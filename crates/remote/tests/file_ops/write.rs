use super::{AtomicFileWriter, atomic_write_command, sibling_temporary_path, write_atomically};
use std::{
   cell::Cell,
   fs,
   io::{self, Write},
   path::{Path, PathBuf},
};
#[cfg(unix)]
use std::{
   os::unix::fs::PermissionsExt,
   process::{Command, Stdio},
};

struct TestDir(PathBuf);

impl TestDir {
   fn new(label: &str) -> Self {
      let path = std::env::temp_dir().join(format!(
         "athas-file-ops-{}-{}",
         label,
         uuid::Uuid::new_v4().simple()
      ));
      fs::create_dir_all(&path).unwrap();
      Self(path)
   }

   fn write(&self, name: &str, content: &str) -> PathBuf {
      let path = self.0.join(name);
      fs::write(&path, content).unwrap();
      path
   }

   fn names(&self) -> Vec<String> {
      let mut names: Vec<String> = fs::read_dir(&self.0)
         .unwrap()
         .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
         .collect();
      names.sort();
      names
   }
}

impl Drop for TestDir {
   fn drop(&mut self) {
      let _ = fs::remove_dir_all(&self.0);
   }
}

#[derive(Default)]
struct TestWriter {
   write_limit: Option<usize>,
   deny_create: bool,
   deny_rename: bool,
   deny_set_mode: bool,
   created_mode: Cell<Option<u32>>,
}

impl AtomicFileWriter for TestWriter {
   fn is_symlink(&self, path: &Path) -> bool {
      fs::symlink_metadata(path)
         .map(|metadata| metadata.file_type().is_symlink())
         .unwrap_or(false)
   }

   fn exists(&self, path: &Path) -> bool {
      path.exists()
   }

   fn mode(&self, path: &Path) -> Option<u32> {
      test_mode(path)
   }

   fn resolve(&self, path: &Path) -> Result<PathBuf, String> {
      let parent = path.parent().unwrap_or_else(|| Path::new(""));
      let target = fs::read_link(path).map_err(|e| e.to_string())?;
      let resolved = if target.is_absolute() {
         target
      } else {
         parent.join(target)
      };

      Ok(fs::canonicalize(&resolved).unwrap_or(resolved))
   }

   fn create_temporary(&self, path: &Path, mode: u32) -> Result<Box<dyn Write>, String> {
      if self.deny_create {
         return Err("Failed to create temporary file: Permission denied".to_string());
      }

      self.created_mode.set(Some(mode));
      let file =
         fs::File::create(path).map_err(|e| format!("Failed to create temporary file: {}", e))?;
      let _ = set_test_mode(path, mode);

      match self.write_limit {
         Some(limit) => Ok(Box::new(InterruptedWriter { file, limit })),
         None => Ok(Box::new(file)),
      }
   }

   fn set_mode(&self, path: &Path, mode: u32) -> Result<(), String> {
      if self.deny_set_mode {
         return Err("Failed to set file permissions: Permission denied".to_string());
      }

      set_test_mode(path, mode)
   }

   fn rename_over(&self, from: &Path, to: &Path) -> Result<(), String> {
      if self.deny_rename {
         return Err("Failed to replace file: Permission denied".to_string());
      }

      fs::rename(from, to).map_err(|e| format!("Failed to replace file: {}", e))
   }

   fn remove(&self, path: &Path) -> Result<(), String> {
      fs::remove_file(path).map_err(|e| format!("Failed to remove temporary file: {}", e))
   }
}

#[cfg(unix)]
fn set_test_mode(path: &Path, mode: u32) -> Result<(), String> {
   fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o7777)).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn set_test_mode(path: &Path, mode: u32) -> Result<(), String> {
   let _ = (path, mode);
   Ok(())
}

#[cfg(unix)]
fn test_mode(path: &Path) -> Option<u32> {
   fs::metadata(path)
      .ok()
      .map(|metadata| metadata.permissions().mode() & 0o7777)
}

#[cfg(not(unix))]
fn test_mode(path: &Path) -> Option<u32> {
   let _ = path;
   None
}

struct InterruptedWriter {
   file: fs::File,
   limit: usize,
}

impl Write for InterruptedWriter {
   fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
      if self.limit == 0 {
         return Err(io::Error::new(
            io::ErrorKind::ConnectionReset,
            "connection lost mid-stream",
         ));
      }

      let len = buf.len().min(self.limit);
      let written = self.file.write(&buf[..len])?;
      self.limit -= written;
      Ok(written)
   }

   fn flush(&mut self) -> io::Result<()> {
      self.file.flush()
   }
}

#[test]
fn replaces_the_target_after_a_complete_write() {
   let dir = TestDir::new("complete");
   let target = dir.write("notes.txt", "original");

   write_atomically(&TestWriter::default(), &target, b"replacement").unwrap();

   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[test]
fn keeps_the_original_when_the_stream_drops_mid_write() {
   let dir = TestDir::new("interrupted");
   let target = dir.write("notes.txt", "original");

   let error = write_atomically(
      &TestWriter {
         write_limit: Some(4),
         ..TestWriter::default()
      },
      &target,
      b"replacement",
   )
   .unwrap_err();

   assert!(error.contains("connection lost mid-stream"), "{error}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[test]
fn keeps_the_original_when_the_rename_fails() {
   let dir = TestDir::new("rename");
   let target = dir.write("notes.txt", "original");

   let error = write_atomically(
      &TestWriter {
         deny_rename: true,
         ..TestWriter::default()
      },
      &target,
      b"replacement",
   )
   .unwrap_err();

   assert!(error.contains("Failed to replace file"), "{error}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[test]
fn keeps_the_original_when_the_temporary_file_cannot_be_created() {
   let dir = TestDir::new("denied");
   let target = dir.write("notes.txt", "original");

   let error = write_atomically(
      &TestWriter {
         deny_create: true,
         ..TestWriter::default()
      },
      &target,
      b"replacement",
   )
   .unwrap_err();

   assert!(error.contains("Permission denied"), "{error}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[test]
fn places_the_temporary_file_next_to_the_target() {
   let temporary = sibling_temporary_path(Path::new("/srv/app/notes.txt"));

   assert_eq!(temporary.parent(), Some(Path::new("/srv/app")));
   let name = temporary.file_name().unwrap().to_string_lossy();
   assert!(name.starts_with(".notes.txt.athas-"), "{name}");
   assert!(name.ends_with(".tmp"), "{name}");
}

#[cfg(unix)]
fn run_write_command(script: &str, input: &[u8]) -> (std::process::ExitStatus, String) {
   let mut child = Command::new("sh")
      .arg("-c")
      .arg(script)
      .stdin(Stdio::piped())
      .stdout(Stdio::null())
      .stderr(Stdio::piped())
      .spawn()
      .unwrap();

   let mut stdin = child.stdin.take().unwrap();
   let _ = stdin.write_all(input);
   drop(stdin);

   let output = child.wait_with_output().unwrap();
   (
      output.status,
      String::from_utf8_lossy(&output.stderr).into_owned(),
   )
}

#[cfg(unix)]
fn runs_as_root() -> bool {
   Command::new("id")
      .arg("-u")
      .output()
      .map(|output| String::from_utf8_lossy(&output.stdout).trim() == "0")
      .unwrap_or(false)
}

#[cfg(unix)]
#[test]
fn shell_write_replaces_the_target_and_keeps_its_permissions() {
   let dir = TestDir::new("shell-complete");
   let target = dir.write("script.sh", "original");
   fs::set_permissions(&target, fs::Permissions::from_mode(0o750)).unwrap();
   let path = target.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(status.success(), "{status} {stderr}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(
      fs::metadata(&target).unwrap().permissions().mode() & 0o777,
      0o750
   );
   assert_eq!(dir.names(), vec!["script.sh".to_string()]);
}

#[cfg(unix)]
#[test]
fn shell_write_keeps_the_original_when_the_stream_ends_early() {
   let dir = TestDir::new("shell-interrupted");
   let target = dir.write("notes.txt", "original");
   let path = target.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"repl");

   assert!(!status.success(), "{status} {stderr}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[cfg(unix)]
#[test]
fn shell_write_keeps_the_original_when_the_directory_is_not_writable() {
   if runs_as_root() {
      return;
   }

   let dir = TestDir::new("shell-denied");
   let target = dir.write("notes.txt", "original");
   let path = target.to_str().unwrap().to_string();
   fs::set_permissions(&dir.0, fs::Permissions::from_mode(0o555)).unwrap();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   fs::set_permissions(&dir.0, fs::Permissions::from_mode(0o755)).unwrap();

   assert!(!status.success(), "{status} {stderr}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[cfg(unix)]
#[test]
fn shell_write_creates_a_new_file_with_the_umask_default_mode() {
   let dir = TestDir::new("shell-create");
   let target = dir.0.join("new.txt");
   let path = target.to_str().unwrap().to_string();

   let script = format!("umask 022; {}", atomic_write_command(&path, 7));
   let (status, stderr) = run_write_command(&script, b"content");

   assert!(status.success(), "{status} {stderr}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "content");
   assert_eq!(
      fs::metadata(&target).unwrap().permissions().mode() & 0o777,
      0o644
   );
}

#[cfg(unix)]
fn link_to(target: &Path, link: &Path) {
   std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(unix)]
fn is_symlink(path: &Path) -> bool {
   fs::symlink_metadata(path).unwrap().file_type().is_symlink()
}

#[cfg(unix)]
#[test]
fn writes_through_a_symlink_whose_target_is_in_the_same_directory() {
   let dir = TestDir::new("link-same");
   let target = dir.write("real.txt", "original");
   let link = dir.0.join("link.txt");
   link_to(Path::new("real.txt"), &link);

   write_atomically(&TestWriter::default(), &link, b"replacement").unwrap();

   assert!(is_symlink(&link));
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec!["link.txt", "real.txt"]);
}

#[cfg(unix)]
#[test]
fn writes_through_a_symlink_whose_target_is_in_another_directory() {
   let dir = TestDir::new("link-other");
   let other = dir.0.join("other");
   fs::create_dir(&other).unwrap();
   let target = other.join("real.txt");
   fs::write(&target, "original").unwrap();
   let link = dir.0.join("link.txt");
   link_to(&target, &link);

   write_atomically(&TestWriter::default(), &link, b"replacement").unwrap();

   assert!(is_symlink(&link));
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec!["link.txt", "other"]);
   assert_eq!(fs::read_dir(&other).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn fails_on_a_dangling_symlink_instead_of_replacing_it() {
   let dir = TestDir::new("link-dangling");
   let link = dir.0.join("link.txt");
   link_to(Path::new("missing.txt"), &link);

   let error = write_atomically(&TestWriter::default(), &link, b"replacement").unwrap_err();

   assert!(error.contains("Failed to resolve symlink"), "{error}");
   assert!(error.contains("link.txt"), "{error}");
   assert!(is_symlink(&link));
   assert!(!dir.0.join("missing.txt").exists());
   assert_eq!(dir.names(), vec!["link.txt"]);
}

#[cfg(unix)]
#[test]
fn shell_write_keeps_a_symlink_in_the_same_directory() {
   let dir = TestDir::new("shell-link-same");
   let target = dir.write("real.txt", "original");
   let link = dir.0.join("link.txt");
   link_to(Path::new("real.txt"), &link);
   let path = link.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(status.success(), "{status} {stderr}");
   assert!(is_symlink(&link));
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec!["link.txt", "real.txt"]);
}

#[cfg(unix)]
#[test]
fn shell_write_keeps_a_symlink_pointing_into_another_directory() {
   let dir = TestDir::new("shell-link-other");
   let other = dir.0.join("other");
   fs::create_dir(&other).unwrap();
   let target = other.join("real.txt");
   fs::write(&target, "original").unwrap();
   let link = dir.0.join("link.txt");
   link_to(&target, &link);
   let path = link.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(status.success(), "{status} {stderr}");
   assert!(is_symlink(&link));
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec!["link.txt", "other"]);
   assert_eq!(fs::read_dir(&other).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn shell_write_fails_on_a_dangling_symlink() {
   let dir = TestDir::new("shell-link-dangling");
   let link = dir.0.join("link.txt");
   link_to(Path::new("missing.txt"), &link);
   let path = link.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(!status.success(), "{status}");
   assert!(stderr.contains("Failed to resolve symlink"), "{stderr}");
   assert!(stderr.contains("link.txt"), "{stderr}");
   assert!(is_symlink(&link));
   assert!(!dir.0.join("missing.txt").exists());
   assert_eq!(dir.names(), vec!["link.txt"]);
}

#[cfg(unix)]
#[test]
fn creates_the_temporary_file_with_the_target_mode() {
   let dir = TestDir::new("mode-existing");
   let target = dir.write("secret.txt", "original");
   fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
   let writer = TestWriter::default();

   write_atomically(&writer, &target, b"replacement").unwrap();

   assert_eq!(writer.created_mode.get(), Some(0o600));
   assert_eq!(
      fs::metadata(&target).unwrap().permissions().mode() & 0o7777,
      0o600
   );
}

#[test]
fn creates_a_new_file_with_the_default_mode() {
   let dir = TestDir::new("mode-new");
   let target = dir.0.join("new.txt");
   let writer = TestWriter::default();

   write_atomically(&writer, &target, b"content").unwrap();

   assert_eq!(writer.created_mode.get(), Some(0o666));
}

#[cfg(unix)]
#[test]
fn keeps_the_original_when_the_mode_cannot_be_applied() {
   let dir = TestDir::new("mode-denied");
   let target = dir.write("notes.txt", "original");

   let error = write_atomically(
      &TestWriter {
         deny_set_mode: true,
         ..TestWriter::default()
      },
      &target,
      b"replacement",
   )
   .unwrap_err();

   assert!(error.contains("Failed to set file permissions"), "{error}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[test]
fn keeps_temporary_names_within_the_common_name_limit() {
   for name in ["a".repeat(250), format!("{}.txt", "a".repeat(250))] {
      let temporary = sibling_temporary_path(&Path::new("/srv").join(&name));
      let temporary_name = temporary.file_name().unwrap().to_string_lossy();

      assert!(temporary_name.len() <= 145, "{temporary_name}");
   }

   let wide = format!("{}.txt", "配".repeat(75));
   let temporary = sibling_temporary_path(&Path::new("/srv").join(&wide));
   let temporary_name = temporary.file_name().unwrap().to_string_lossy();

   assert!(temporary_name.len() <= 145, "{temporary_name}");
}

#[cfg(unix)]
#[test]
fn shell_write_handles_a_name_close_to_the_filesystem_limit() {
   let dir = TestDir::new("shell-long-name");
   let name = format!("{}.txt", "n".repeat(240));
   let target = dir.write(&name, "original");
   let path = target.to_str().unwrap().to_string();

   let (status, stderr) = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(status.success(), "{status} {stderr}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "replacement");
   assert_eq!(dir.names(), vec![name]);
}
