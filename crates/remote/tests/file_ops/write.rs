use super::{AtomicFileWriter, atomic_write_command, sibling_temporary_path, write_atomically};
use std::{
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
}

impl AtomicFileWriter for TestWriter {
   fn create_temporary(&self, path: &Path) -> Result<Box<dyn Write>, String> {
      if self.deny_create {
         return Err("Failed to create temporary file: Permission denied".to_string());
      }

      let file =
         fs::File::create(path).map_err(|e| format!("Failed to create temporary file: {}", e))?;

      match self.write_limit {
         Some(limit) => Ok(Box::new(InterruptedWriter { file, limit })),
         None => Ok(Box::new(file)),
      }
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
fn run_write_command(script: &str, input: &[u8]) -> std::process::ExitStatus {
   let mut child = Command::new("sh")
      .arg("-c")
      .arg(script)
      .stdin(Stdio::piped())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .unwrap();

   let mut stdin = child.stdin.take().unwrap();
   let _ = stdin.write_all(input);
   drop(stdin);

   child.wait().unwrap()
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

   let status = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   assert!(status.success(), "{status}");
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

   let status = run_write_command(&atomic_write_command(&path, 11), b"repl");

   assert!(!status.success(), "{status}");
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

   let status = run_write_command(&atomic_write_command(&path, 11), b"replacement");

   fs::set_permissions(&dir.0, fs::Permissions::from_mode(0o755)).unwrap();

   assert!(!status.success(), "{status}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "original");
   assert_eq!(dir.names(), vec!["notes.txt".to_string()]);
}

#[cfg(unix)]
#[test]
fn shell_write_creates_a_new_file_with_the_umask_default_mode() {
   let dir = TestDir::new("shell-create");
   let target = dir.0.join("new.txt");
   let path = target.to_str().unwrap().to_string();

   let status = run_write_command(&atomic_write_command(&path, 7), b"content");

   assert!(status.success(), "{status}");
   assert_eq!(fs::read_to_string(&target).unwrap(), "content");
   assert_ne!(
      fs::metadata(&target).unwrap().permissions().mode() & 0o777,
      0o600
   );
}
