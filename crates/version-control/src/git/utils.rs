use anyhow::{Result, bail};
use base64::{Engine as _, engine::general_purpose};
use git2::{Oid, Repository};
use std::path::{Path, PathBuf};

pub trait IntoStringError<T> {
   fn into_string_error(self) -> Result<T, String>;
}

impl<T> IntoStringError<T> for Result<T> {
   fn into_string_error(self) -> Result<T, String> {
      self.map_err(|e| format!("{:#}", e))
   }
}

pub fn is_image_file(path: &str) -> bool {
   let lower = path.to_lowercase();
   lower.ends_with(".png")
      || lower.ends_with(".jpg")
      || lower.ends_with(".jpeg")
      || lower.ends_with(".gif")
      || lower.ends_with(".bmp")
      || lower.ends_with(".svg")
      || lower.ends_with(".webp")
      || lower.ends_with(".ico")
      || lower.ends_with(".tiff")
      || lower.ends_with(".tif")
      || lower.ends_with(".avif")
      || lower.ends_with(".heic")
      || lower.ends_with(".heif")
      || lower.ends_with(".jfif")
      || lower.ends_with(".pjpeg")
      || lower.ends_with(".pjp")
      || lower.ends_with(".apng")
}

pub fn get_blob_base64(repo: &Repository, oid: Option<Oid>, _file_path: &str) -> Option<String> {
   if let Some(oid) = oid
      && !oid.is_zero()
      && let Ok(blob) = repo.find_blob(oid)
   {
      let data = blob.content();
      return Some(general_purpose::STANDARD.encode(data));
   }
   None
}

pub fn get_ahead_behind_counts(repo: &Repository, branch: &str) -> (i32, i32) {
   let local_branch = match repo.find_branch(branch, git2::BranchType::Local) {
      Ok(branch) => branch,
      Err(_) => return (0, 0),
   };

   let upstream = match local_branch.upstream() {
      Ok(upstream) => upstream,
      Err(_) => return (0, 0),
   };

   let local_oid = match local_branch.get().target() {
      Some(oid) => oid,
      None => return (0, 0),
   };

   let upstream_oid = match upstream.get().target() {
      Some(oid) => oid,
      None => return (0, 0),
   };

   match repo.graph_ahead_behind(local_oid, upstream_oid) {
      Ok((ahead, behind)) => (ahead as i32, behind as i32),
      Err(_) => (0, 0),
   }
}

pub fn format_git_time(seconds: Option<i64>) -> String {
   seconds
      .and_then(|s| chrono::DateTime::<chrono::Utc>::from_timestamp(s, 0))
      .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
      .unwrap_or_default()
}

fn status_entry_path(entry: &git2::StatusEntry<'_>) -> PathBuf {
   #[cfg(unix)]
   {
      use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
      PathBuf::from(OsStr::from_bytes(entry.path_bytes()))
   }
   #[cfg(not(unix))]
   {
      PathBuf::from(entry.path().unwrap_or_default())
   }
}

pub fn path_to_bytes(path: &Path) -> Vec<u8> {
   #[cfg(unix)]
   {
      use std::os::unix::ffi::OsStrExt;
      path.as_os_str().as_bytes().to_vec()
   }
   #[cfg(not(unix))]
   {
      path.to_string_lossy().into_owned().into_bytes()
   }
}

pub fn resolve_status_path(repo: &Repository, requested_path: &str) -> Result<PathBuf> {
   let mut options = git2::StatusOptions::new();
   options
      .include_untracked(true)
      .recurse_untracked_dirs(false)
      .include_ignored(false);

   let statuses = repo.statuses(Some(&mut options))?;
   let mut candidates: Vec<PathBuf> = Vec::new();

   for entry in statuses.iter() {
      if String::from_utf8_lossy(entry.path_bytes()) != requested_path {
         continue;
      }

      let candidate = status_entry_path(&entry);
      if !candidates.contains(&candidate) {
         candidates.push(candidate);
      }
   }

   match candidates.len() {
      0 => Ok(PathBuf::from(requested_path)),
      1 => Ok(candidates.remove(0)),
      _ => bail!(
         "Path {requested_path} matches more than one file; refusing to act on an ambiguous path"
      ),
   }
}
