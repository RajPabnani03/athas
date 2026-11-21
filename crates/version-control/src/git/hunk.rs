use crate::git::{DiffLineType, GitHunk, IntoStringError, resolve_status_path};
use anyhow::{Context, Result, bail};
use git2::Repository;
use std::{io::Write, path::Path, process::Command};
use tempfile::NamedTempFile;

fn reject_non_utf8_hunk_path(repo_path: &Path, file_path: &str) -> Result<()> {
   let repo = Repository::open(repo_path).context("Failed to open repository")?;
   let resolved = resolve_status_path(&repo, file_path)?;

   if resolved != Path::new(file_path) {
      bail!(
         "Cannot apply a hunk to {file_path} because the path is not valid UTF-8 and a patch \
          cannot address it"
      );
   }

   Ok(())
}

fn create_patch_from_hunk(hunk: &GitHunk) -> Result<String, String> {
   let mut patch = String::new();

   let header_line = hunk
      .lines
      .iter()
      .find(|line| matches!(line.line_type, DiffLineType::Header))
      .ok_or_else(|| {
         log::error!(
            "No header line found in hunk. Line types present: {:?}",
            hunk.lines.iter().map(|l| &l.line_type).collect::<Vec<_>>()
         );
         "No header line found in hunk".to_string()
      })?;

   patch.push_str(&format!(
      "diff --git a/{} b/{}\n",
      hunk.file_path, hunk.file_path
   ));
   patch.push_str(&format!("--- a/{}\n", hunk.file_path));
   patch.push_str(&format!("+++ b/{}\n", hunk.file_path));
   patch.push_str(&header_line.content);
   if !header_line.content.ends_with('\n') {
      patch.push('\n');
   }

   for line in &hunk.lines {
      match line.line_type {
         DiffLineType::Added => {
            patch.push('+');
            patch.push_str(&line.content);
            patch.push('\n');
         }
         DiffLineType::Removed => {
            patch.push('-');
            patch.push_str(&line.content);
            patch.push('\n');
         }
         DiffLineType::Context => {
            patch.push(' ');
            patch.push_str(&line.content);
            patch.push('\n');
         }
         DiffLineType::Header => {}
      }
   }

   Ok(patch)
}

pub fn git_stage_hunk(repo_path: String, hunk: GitHunk) -> Result<(), String> {
   _git_stage_hunk(repo_path, hunk).into_string_error()
}

fn _git_stage_hunk(repo_path: String, hunk: GitHunk) -> Result<()> {
   let repo_dir = Path::new(&repo_path);
   reject_non_utf8_hunk_path(repo_dir, &hunk.file_path)?;
   let patch_content = create_patch_from_hunk(&hunk).map_err(|e| anyhow::anyhow!(e))?;

   let mut temp_file = NamedTempFile::new().context("Failed to create temp file")?;
   temp_file
      .write_all(patch_content.as_bytes())
      .context("Failed to write patch")?;
   temp_file.flush().context("Failed to flush temp file")?;

   let output = Command::new("git")
      .current_dir(repo_dir)
      .args(["apply", "--cached", temp_file.path().to_str().unwrap()])
      .output()
      .context("Failed to apply patch")?;

   if !output.status.success() {
      bail!(
         "Failed to stage hunk: {}",
         String::from_utf8_lossy(&output.stderr)
      );
   }

   Ok(())
}

pub fn git_unstage_hunk(repo_path: String, hunk: GitHunk) -> Result<(), String> {
   _git_unstage_hunk(repo_path, hunk).into_string_error()
}

fn _git_unstage_hunk(repo_path: String, hunk: GitHunk) -> Result<()> {
   let repo_dir = Path::new(&repo_path);
   reject_non_utf8_hunk_path(repo_dir, &hunk.file_path)?;
   let patch_content = create_patch_from_hunk(&hunk).map_err(|e| anyhow::anyhow!(e))?;

   let mut temp_file = NamedTempFile::new().context("Failed to create temp file")?;
   temp_file
      .write_all(patch_content.as_bytes())
      .context("Failed to write patch")?;
   temp_file.flush().context("Failed to flush temp file")?;

   let output = Command::new("git")
      .current_dir(repo_dir)
      .args([
         "apply",
         "--reverse",
         "--cached",
         temp_file.path().to_str().unwrap(),
      ])
      .output()
      .context("Failed to apply reverse patch")?;

   if !output.status.success() {
      bail!(
         "Failed to unstage hunk: {}",
         String::from_utf8_lossy(&output.stderr)
      );
   }

   Ok(())
}

#[cfg(all(test, unix))]
mod tests {
   use super::*;
   use crate::git::{DiffLineType, GitDiffLine, GitHunk};
   use git2::Repository;
   use std::{ffi::OsStr, fs, os::unix::ffi::OsStrExt};

   #[test]
   fn rejects_a_hunk_for_a_path_that_is_not_utf8() {
      let temp_dir = tempfile::tempdir().expect("temp dir");
      Repository::init(temp_dir.path()).expect("repo init");
      let invalid_name = OsStr::from_bytes(b"bad-\xff-name.txt");
      let lookalike_name = OsStr::from_bytes(b"bad-\xef\xbf\xbd-name.txt");
      fs::write(temp_dir.path().join(invalid_name), "original\n").expect("write bytes file");
      fs::write(temp_dir.path().join(lookalike_name), "original\n").expect("write lookalike");

      let hunk = GitHunk {
         file_path: String::from_utf8_lossy(invalid_name.as_bytes()).into_owned(),
         lines: vec![
            GitDiffLine {
               line_type: DiffLineType::Header,
               content: "@@ -1,1 +1,1 @@".to_string(),
               old_line_number: None,
               new_line_number: None,
            },
            GitDiffLine {
               line_type: DiffLineType::Removed,
               content: "original".to_string(),
               old_line_number: Some(1),
               new_line_number: None,
            },
            GitDiffLine {
               line_type: DiffLineType::Added,
               content: "changed".to_string(),
               old_line_number: None,
               new_line_number: Some(1),
            },
         ],
      };

      let result = _git_stage_hunk(temp_dir.path().to_string_lossy().into_owned(), hunk);

      assert!(
         result.is_err(),
         "staging should refuse a non-UTF-8 hunk path"
      );
      assert_eq!(
         fs::read_to_string(temp_dir.path().join(lookalike_name)).expect("read lookalike"),
         "original\n"
      );
   }
}
