use crate::git::{DiffLineType, GitHunk, IntoStringError};
use anyhow::{Context, Result, bail};
use std::{io::Write, path::Path, process::Command};
use tempfile::NamedTempFile;

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
      let prefix = match line.line_type {
         DiffLineType::Added => '+',
         DiffLineType::Removed => '-',
         DiffLineType::Context => ' ',
         DiffLineType::Header => continue,
      };

      patch.push(prefix);
      patch.push_str(&line.content);
      patch.push('\n');

      if line.no_trailing_newline {
         patch.push_str("\\ No newline at end of file\n");
      }
   }

   Ok(patch)
}

pub fn git_stage_hunk(repo_path: String, hunk: GitHunk) -> Result<(), String> {
   _git_stage_hunk(repo_path, hunk).into_string_error()
}

fn _git_stage_hunk(repo_path: String, hunk: GitHunk) -> Result<()> {
   let repo_dir = Path::new(&repo_path);
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

#[cfg(test)]
mod tests {
   use super::*;
   use crate::git::{DiffLineType, GitDiffLine, git_diff_file};
   use git2::{IndexAddOption, Repository, Signature};
   use std::{fs, path::PathBuf};

   fn init_repo() -> (tempfile::TempDir, PathBuf) {
      let temp_dir = tempfile::tempdir().expect("temp dir");
      Repository::init(temp_dir.path()).expect("repo init");
      let path = temp_dir.path().to_path_buf();
      (temp_dir, path)
   }

   fn commit_paths(repo_path: &Path, paths: &[&str]) {
      let repo = Repository::open(repo_path).expect("repo");
      let mut index = repo.index().expect("index");
      index
         .add_all(paths.iter(), IndexAddOption::DEFAULT, None)
         .expect("stage paths");
      index.write().expect("write index");
      let tree_id = index.write_tree().expect("write tree");
      let tree = repo.find_tree(tree_id).expect("find tree");
      let signature = Signature::now("Athas Test", "athas@example.com").expect("signature");
      let parent = repo
         .head()
         .ok()
         .and_then(|head| head.target())
         .map(|oid| repo.find_commit(oid).expect("parent commit"));
      let parents = parent.iter().collect::<Vec<_>>();
      repo.commit(
         Some("HEAD"),
         &signature,
         &signature,
         "commit",
         &tree,
         &parents,
      )
      .expect("commit");
   }

   fn index_content(repo_path: &Path, file: &str) -> String {
      let repo = Repository::open(repo_path).expect("repo");
      let index = repo.index().expect("index");
      let entry = index
         .get_path(Path::new(file), 0)
         .expect("index entry for file");
      let blob = repo.find_blob(entry.id).expect("index blob");
      String::from_utf8(blob.content().to_vec()).expect("utf-8 blob")
   }

   fn group_hunks(lines: &[GitDiffLine]) -> Vec<GitHunk> {
      let mut hunks = Vec::new();
      let mut file_path = String::new();
      let mut header: Option<GitDiffLine> = None;
      let mut current: Vec<GitDiffLine> = Vec::new();

      for line in lines {
         if matches!(line.line_type, DiffLineType::Header) {
            if let Some(previous_header) = header.take()
               && !current.is_empty()
            {
               hunks.push(GitHunk {
                  file_path: file_path.clone(),
                  lines: std::iter::once(previous_header)
                     .chain(current.drain(..))
                     .collect(),
               });
            }

            if let Some(path) = line.content.strip_prefix("diff --git a/")
               && let Some((path, _)) = path.split_once(" b/")
            {
               file_path = path.to_string();
            }
            header = Some(line.clone());
         } else {
            current.push(line.clone());
         }
      }

      if let Some(previous_header) = header
         && !current.is_empty()
      {
         hunks.push(GitHunk {
            file_path,
            lines: std::iter::once(previous_header).chain(current).collect(),
         });
      }

      hunks
   }

   fn stage_hunks(repo_path: &Path, hunks: Vec<GitHunk>) {
      assert!(!hunks.is_empty(), "expected at least one hunk to stage");
      for hunk in hunks {
         let file = hunk.file_path.clone();
         _git_stage_hunk(repo_path.to_string_lossy().into_owned(), hunk)
            .unwrap_or_else(|error| panic!("staging {file}: {error}"));
      }
   }

   #[test]
   fn stages_a_hunk_for_a_file_without_a_trailing_newline() {
      let (_temp_dir, repo_path) = init_repo();
      let file = repo_path.join("file.txt");
      fs::write(&file, "line one\nline two").expect("write original");
      commit_paths(&repo_path, &["file.txt"]);
      fs::write(&file, "line one\nline two\nline three\n").expect("write change");

      let diff = git_diff_file(repo_path.to_string_lossy().into_owned(), "file.txt".to_string(), false)
         .expect("workdir diff");
      stage_hunks(&repo_path, group_hunks(&diff.lines));

      assert_eq!(
         index_content(&repo_path, "file.txt"),
         "line one\nline two\nline three\n"
      );
   }

   #[test]
   fn stages_a_hunk_for_a_file_with_a_trailing_newline() {
      let (_temp_dir, repo_path) = init_repo();
      let file = repo_path.join("file.txt");
      fs::write(&file, "line one\nline two\n").expect("write original");
      commit_paths(&repo_path, &["file.txt"]);
      fs::write(&file, "line one\nline two\nline three\n").expect("write change");

      let diff = git_diff_file(repo_path.to_string_lossy().into_owned(), "file.txt".to_string(), false)
         .expect("workdir diff");
      stage_hunks(&repo_path, group_hunks(&diff.lines));

      assert_eq!(
         index_content(&repo_path, "file.txt"),
         "line one\nline two\nline three\n"
      );
   }

   #[test]
   fn stages_every_hunk_from_one_diff_that_mixes_newline_endings() {
      let (_temp_dir, repo_path) = init_repo();
      fs::write(repo_path.join("with_newline.txt"), "keep\nold\n").expect("write first");
      fs::write(repo_path.join("without_newline.txt"), "keep\nold").expect("write second");
      commit_paths(&repo_path, &["with_newline.txt", "without_newline.txt"]);

      fs::write(repo_path.join("with_newline.txt"), "keep\nnew\n").expect("change first");
      fs::write(repo_path.join("without_newline.txt"), "keep\nnew\n").expect("change second");

      let repo = Repository::open(&repo_path).expect("repo");
      let mut diff = repo.diff_index_to_workdir(None, None).expect("workdir diff");
      let parsed = crate::git::parse_diff_to_lines(&mut diff).expect("parsed diff");

      let hunks = group_hunks(&parsed.lines);
      assert_eq!(hunks.len(), 2);
      stage_hunks(&repo_path, hunks);

      assert_eq!(
         index_content(&repo_path, "with_newline.txt"),
         "keep\nnew\n"
      );
      assert_eq!(
         index_content(&repo_path, "without_newline.txt"),
         "keep\nnew\n"
      );
   }
}
