use crate::{ssh_helpers::shell_quote, state::CONNECTIONS};
use serde::{Deserialize, Serialize};
use ssh2::{FileType, RenameFlags, Session, Sftp};
use std::{
   io::{Read, Write},
   path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileEntry {
   pub name: String,
   pub path: String,
   pub is_dir: bool,
   pub size: u64,
}

trait AtomicFileWriter {
   fn is_symlink(&self, path: &Path) -> bool;
   fn exists(&self, path: &Path) -> bool;
   fn resolve(&self, path: &Path) -> Result<PathBuf, String>;
   fn create_temporary(&self, path: &Path) -> Result<Box<dyn Write>, String>;
   fn rename_over(&self, from: &Path, to: &Path) -> Result<(), String>;
   fn remove(&self, path: &Path) -> Result<(), String>;
}

impl AtomicFileWriter for Sftp {
   fn is_symlink(&self, path: &Path) -> bool {
      Sftp::lstat(self, path)
         .map(|stat| stat.file_type() == FileType::Symlink)
         .unwrap_or(false)
   }

   fn exists(&self, path: &Path) -> bool {
      Sftp::stat(self, path).is_ok()
   }

   fn resolve(&self, path: &Path) -> Result<PathBuf, String> {
      Sftp::realpath(self, path).map_err(|e| e.to_string())
   }

   fn create_temporary(&self, path: &Path) -> Result<Box<dyn Write>, String> {
      let file =
         Sftp::create(self, path).map_err(|e| format!("Failed to create temporary file: {}", e))?;
      Ok(Box::new(file))
   }

   fn rename_over(&self, from: &Path, to: &Path) -> Result<(), String> {
      Sftp::rename(
         self,
         from,
         to,
         Some(RenameFlags::OVERWRITE | RenameFlags::ATOMIC | RenameFlags::NATIVE),
      )
      .map_err(|e| format!("Failed to replace file: {}", e))
   }

   fn remove(&self, path: &Path) -> Result<(), String> {
      Sftp::unlink(self, path).map_err(|e| format!("Failed to remove temporary file: {}", e))
   }
}

/// Writes through a sibling temporary file and renames it over the target, so a
/// write that dies partway through leaves the original file untouched instead of
/// truncating it.
fn write_atomically(
   writer: &dyn AtomicFileWriter,
   target: &Path,
   content: &[u8],
) -> Result<(), String> {
   let target = resolve_write_target(writer, target)?;
   let temporary = sibling_temporary_path(&target);

   let written = (|| -> Result<(), String> {
      let mut file = writer.create_temporary(&temporary)?;
      file
         .write_all(content)
         .map_err(|e| format!("Failed to write file: {}", e))?;
      file
         .flush()
         .map_err(|e| format!("Failed to write file: {}", e))?;
      drop(file);
      writer.rename_over(&temporary, &target)
   })();

   if written.is_err() {
      let _ = writer.remove(&temporary);
   }

   written
}

/// A symlinked target stays a symlink: the write lands on the file the link
/// points at, and the temporary file is created beside that resolved file so the
/// rename stays inside one filesystem.
fn resolve_write_target(writer: &dyn AtomicFileWriter, target: &Path) -> Result<PathBuf, String> {
   if !writer.is_symlink(target) {
      return Ok(target.to_path_buf());
   }

   let resolved = writer
      .resolve(target)
      .map_err(|e| format!("Failed to resolve symlink {}: {}", target.display(), e))?;

   if !writer.exists(&resolved) {
      return Err(format!(
         "Failed to resolve symlink {}: {} does not exist",
         target.display(),
         resolved.display()
      ));
   }

   Ok(resolved)
}

fn sibling_temporary_path(target: &Path) -> PathBuf {
   let parent = target.parent().unwrap_or_else(|| Path::new(""));
   let name: String = target
      .file_name()
      .map(|name| name.to_string_lossy().into_owned())
      .unwrap_or_default()
      .chars()
      .take(120)
      .collect();

   parent.join(format!(
      ".{}.athas-{}.tmp",
      name,
      uuid::Uuid::new_v4().simple()
   ))
}

/// The remote shell equivalent of [`write_atomically`]: stream into a sibling
/// temporary file, refuse it when fewer bytes arrived than were sent, and only
/// then move it over the target.
fn atomic_write_command(file_path: &str, byte_len: usize) -> String {
   let path = shell_quote(file_path);
   let unresolved = shell_quote(&format!("Failed to resolve symlink: {}", file_path));

   [
      "set -e".to_string(),
      format!("target={path}"),
      format!(
         "if [ -L {path} ]; then target=$(readlink -f -- {path} 2>/dev/null || realpath -- {path} \
          2>/dev/null || true); if [ -z \"$target\" ] || [ ! -f \"$target\" ]; then echo \
          {unresolved} >&2; exit 1; fi; fi"
      ),
      "tmp=$(mktemp \"${target}.athas-XXXXXX\")".to_string(),
      "trap 'rm -f \"$tmp\"' EXIT HUP INT TERM".to_string(),
      "cat > \"$tmp\"".to_string(),
      format!("[ \"$(wc -c < \"$tmp\")\" -eq {byte_len} ]"),
      "if [ -e \"$target\" ]; then mode=$(stat -c %a \"$target\" 2>/dev/null || stat -f %Lp \
       \"$target\" 2>/dev/null || true); fi"
         .to_string(),
      "if [ -z \"$mode\" ]; then mode=$(printf '%o' $(( 0666 & ~0$(umask) ))); fi".to_string(),
      "chmod \"$mode\" \"$tmp\"".to_string(),
      "mv -f \"$tmp\" \"$target\"".to_string(),
      "trap - EXIT".to_string(),
   ]
   .join("; ")
}

fn write_file_sftp(sftp: &Sftp, file_path: &str, content: &[u8]) -> Result<(), String> {
   let target = Path::new(file_path);
   let mode = sftp.stat(target).ok().and_then(|stat| stat.perm);

   write_atomically(sftp, target, content)?;

   if let Some(mode) = mode
      && let Ok(mut stat) = sftp.stat(target)
   {
      stat.perm = Some(mode);
      let _ = sftp.setstat(target, stat);
   }

   Ok(())
}

fn write_file_over_channel(
   session: &Session,
   file_path: &str,
   content: &[u8],
) -> Result<(), String> {
   let mut channel = session
      .channel_session()
      .map_err(|e| format!("Failed to create channel: {}", e))?;

   channel
      .exec(&atomic_write_command(file_path, content.len()))
      .map_err(|e| format!("Failed to execute command: {}", e))?;

   channel
      .write_all(content)
      .map_err(|e| format!("Failed to write content: {}", e))?;

   channel
      .send_eof()
      .map_err(|e| format!("Failed to send EOF: {}", e))?;

   let mut stderr = String::new();
   channel
      .stderr()
      .read_to_string(&mut stderr)
      .map_err(|e| format!("Failed to read command error output: {}", e))?;

   channel.close().ok();
   channel.wait_close().ok();

   let exit_status = channel.exit_status().unwrap_or_default();
   if exit_status != 0 {
      let details = stderr.trim();
      return Err(if details.is_empty() {
         format!("Remote write failed with exit status {}", exit_status)
      } else {
         details.to_string()
      });
   }

   Ok(())
}

pub(super) async fn write_file(
   connection_id: String,
   file_path: String,
   content: String,
) -> Result<(), String> {
   let connections = CONNECTIONS
      .lock()
      .map_err(|e| format!("Failed to lock connections: {}", e))?;
   let (session, sftp_opt) = connections
      .get(&connection_id)
      .ok_or("Connection not found")?;

   match sftp_opt {
      Some(sftp) => write_file_sftp(sftp, &file_path, content.as_bytes()),
      None => write_file_over_channel(session, &file_path, content.as_bytes()),
   }
}

fn parse_listing(output: &str, dir_path: &str) -> Vec<RemoteFileEntry> {
   output
      .lines()
      .filter_map(|line| parse_listing_line(line, dir_path))
      .collect()
}

fn parse_listing_line(line: &str, dir_path: &str) -> Option<RemoteFileEntry> {
   let mut fields = [""; 8];
   let mut rest = line;

   for field in &mut fields {
      rest = rest.trim_start();
      let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
      if end == 0 {
         return None;
      }
      *field = &rest[..end];
      rest = &rest[end..];
   }

   let mode = fields[0];
   if mode.len() < 10 || !"-dlbcps".contains(mode.as_bytes()[0] as char) {
      return None;
   }

   let listed_name = rest.trim_start();
   let name = if mode.starts_with('l') {
      listed_name
         .split_once(" -> ")
         .map_or(listed_name, |(name, _)| name)
   } else {
      listed_name
   };

   if name.is_empty() || name == "." || name == ".." || name.starts_with('.') {
      return None;
   }

   let path = if dir_path == "/" {
      format!("/{}", name)
   } else {
      format!("{}/{}", dir_path, name)
   };

   Some(RemoteFileEntry {
      name: name.to_string(),
      path,
      is_dir: mode.starts_with('d'),
      size: fields[4].parse().unwrap_or(0),
   })
}

pub(super) async fn read_directory(
   connection_id: String,
   path: String,
) -> Result<Vec<RemoteFileEntry>, String> {
   let connections = CONNECTIONS
      .lock()
      .map_err(|e| format!("Failed to lock connections: {}", e))?;
   let (session, sftp_opt) = connections
      .get(&connection_id)
      .ok_or("Connection not found")?;

   let dir_path = if path.is_empty() { "/" } else { &path };

   if let Some(sftp) = sftp_opt {
      let remote_path = std::path::Path::new(dir_path);
      let entries = sftp
         .readdir(remote_path)
         .map_err(|e| format!("Failed to read directory: {}", e))?;

      let mut result: Vec<RemoteFileEntry> = entries
         .into_iter()
         .filter_map(|(path_buf, stat)| {
            let name = path_buf.file_name()?.to_string_lossy().to_string();
            if name.starts_with('.') {
               return None;
            }
            let full_path = path_buf.to_string_lossy().to_string();
            Some(RemoteFileEntry {
               name,
               path: full_path,
               is_dir: stat.is_dir(),
               size: stat.size.unwrap_or(0),
            })
         })
         .collect();

      result.sort_by(|a, b| match (a.is_dir, b.is_dir) {
         (true, false) => std::cmp::Ordering::Less,
         (false, true) => std::cmp::Ordering::Greater,
         _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
      });

      Ok(result)
   } else {
      let mut channel = session
         .channel_session()
         .map_err(|e| format!("Failed to create channel: {}", e))?;

      let command = format!("ls -la {}", shell_quote(dir_path));
      channel
         .exec(&command)
         .map_err(|e| format!("Failed to execute command: {}", e))?;

      let mut output = String::new();
      channel
         .read_to_string(&mut output)
         .map_err(|e| format!("Failed to read output: {}", e))?;

      channel.close().ok();
      channel.wait_close().ok();

      Ok(parse_listing(&output, dir_path))
   }
}

pub(super) async fn read_file(connection_id: String, file_path: String) -> Result<String, String> {
   let connections = CONNECTIONS
      .lock()
      .map_err(|e| format!("Failed to lock connections: {}", e))?;
   let (session, sftp_opt) = connections
      .get(&connection_id)
      .ok_or("Connection not found")?;

   if let Some(sftp) = sftp_opt {
      let remote_path = std::path::Path::new(&file_path);
      let mut file = sftp
         .open(remote_path)
         .map_err(|e| format!("Failed to open file: {}", e))?;

      let mut content = String::new();
      file
         .read_to_string(&mut content)
         .map_err(|e| format!("Failed to read file: {}", e))?;

      Ok(content)
   } else {
      let mut channel = session
         .channel_session()
         .map_err(|e| format!("Failed to create channel: {}", e))?;

      let command = format!("cat '{}'", file_path.replace('\'', "'\\''"));
      channel
         .exec(&command)
         .map_err(|e| format!("Failed to execute command: {}", e))?;

      let mut content = String::new();
      channel
         .read_to_string(&mut content)
         .map_err(|e| format!("Failed to read file: {}", e))?;

      channel.close().ok();
      channel.wait_close().ok();

      Ok(content)
   }
}

#[cfg(test)]
#[path = "../tests/file_ops/listing.rs"]
mod listing_tests;

#[cfg(test)]
#[path = "../tests/file_ops/write.rs"]
mod write_tests;
