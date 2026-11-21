use crate::git::{IntoStringError, path_to_bytes, resolve_status_path};
use anyhow::{Context, Result};
use git2::{ErrorCode, Repository};
use std::path::Path;

pub fn git_add(repo_path: String, file_path: String) -> Result<(), String> {
   _git_add(repo_path, file_path).into_string_error()
}

fn _git_add(repo_path: String, file_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;
   let mut index = repo.index().context("Failed to get index")?;

   let relative_path = resolve_status_path(&repo, &file_path)?;
   let absolute_path = Path::new(&repo_path).join(&relative_path);

   if absolute_path.is_dir() {
      index
         .add_all(
            [relative_path.as_path()].iter(),
            git2::IndexAddOption::DEFAULT,
            None,
         )
         .with_context(|| format!("Failed to add directory {}", file_path))?;
   } else {
      match index.add_path(&relative_path) {
         Ok(_) => {}
         Err(err) => {
            if err.code() == ErrorCode::NotFound {
               index
                  .add_all(
                     [relative_path.as_path()].iter(),
                     git2::IndexAddOption::DEFAULT,
                     None,
                  )
                  .with_context(|| format!("Failed to add path {}", file_path))?;
            } else {
               return Err(err).with_context(|| format!("Failed to add file {}", file_path));
            }
         }
      }
   }

   index.write().context("Failed to write index")?;

   Ok(())
}

pub fn git_reset(repo_path: String, file_path: String) -> Result<(), String> {
   _git_reset(repo_path, file_path).into_string_error()
}

fn _git_reset(repo_path: String, file_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;

   let head = repo.head().context("Failed to get HEAD")?;
   let head_commit = head.peel_to_commit().context("Failed to get HEAD commit")?;
   let head_tree = head_commit.tree().context("Failed to get HEAD tree")?;
   let mut index = repo.index().context("Failed to get index")?;

   let path = resolve_status_path(&repo, &file_path)?;
   match head_tree.get_path(&path) {
      Ok(entry) => {
         let object = entry.to_object(&repo).context("Failed to get object")?;
         let blob = object.as_blob().context("Object is not a blob")?;

         let index_entry = git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: entry.filemode() as u32,
            uid: 0,
            gid: 0,
            file_size: blob.size() as u32,
            id: entry.id(),
            flags: 0,
            flags_extended: 0,
            path: path_to_bytes(&path),
         };

         index.add(&index_entry).context("Failed to update index")?;
      }
      Err(_) => {
         index
            .remove_path(&path)
            .context("Failed to remove from index")?;
      }
   }

   index.write().context("Failed to write index")?;
   Ok(())
}

pub fn git_add_all(repo_path: String) -> Result<(), String> {
   _git_add_all(repo_path).into_string_error()
}

fn _git_add_all(repo_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;
   let mut index = repo.index().context("Failed to get index")?;

   index
      .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
      .context("Failed to add all files")?;
   index.write().context("Failed to write index")?;

   Ok(())
}

pub fn git_reset_all(repo_path: String) -> Result<(), String> {
   _git_reset_all(repo_path).into_string_error()
}

fn _git_reset_all(repo_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;

   let head = repo.head().context("Failed to get HEAD")?;
   let head_commit = head.peel_to_commit().context("Failed to get HEAD commit")?;
   let head_tree = head_commit.tree().context("Failed to get HEAD tree")?;
   let mut index = repo.index().context("Failed to get index")?;

   index
      .read_tree(&head_tree)
      .context("Failed to reset index to HEAD")?;
   index.write().context("Failed to write index")?;

   Ok(())
}

pub fn git_discard_file_changes(repo_path: String, file_path: String) -> Result<(), String> {
   _git_discard_file_changes(repo_path, file_path).into_string_error()
}

fn _git_discard_file_changes(repo_path: String, file_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;

   let head = repo
      .head()
      .context("Failed to get HEAD")?
      .peel_to_tree()
      .context("Failed to get HEAD tree")?;

   let path = resolve_status_path(&repo, &file_path)?;

   let mut checkout_opts = git2::build::CheckoutBuilder::new();
   checkout_opts.force().update_index(true).path(&path);

   repo
      .checkout_tree(head.as_object(), Some(&mut checkout_opts))
      .context("Failed to checkout file")?;

   Ok(())
}

pub fn git_discard_all_changes(repo_path: String) -> Result<(), String> {
   _git_discard_all_changes(repo_path).into_string_error()
}

fn _git_discard_all_changes(repo_path: String) -> Result<()> {
   let repo = Repository::open(&repo_path).context("Failed to open repository")?;

   let head = repo
      .head()
      .context("Failed to get HEAD")?
      .peel_to_commit()
      .context("Failed to get HEAD commit")?;

   repo
      .reset(head.as_object(), git2::ResetType::Hard, None)
      .context("Failed to reset to HEAD")?;

   Ok(())
}

#[cfg(all(test, unix))]
mod tests {
   use super::*;
   use git2::{IndexAddOption, Repository, Signature};
   use std::{ffi::OsStr, fs, os::unix::ffi::OsStrExt};

   fn init_repo_with_files(files: &[&OsStr]) -> (tempfile::TempDir, String) {
      let temp_dir = tempfile::tempdir().expect("temp dir");
      let repo = Repository::init(temp_dir.path()).expect("repo init");

      for file in files {
         fs::write(temp_dir.path().join(file), "tracked\n").expect("write file");
      }

      let mut index = repo.index().expect("index");
      index
         .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
         .expect("stage files");
      index.write().expect("write index");
      let tree_id = index.write_tree().expect("write tree");
      let tree = repo.find_tree(tree_id).expect("find tree");
      let signature = Signature::now("Athas Test", "athas@example.com").expect("signature");
      repo
         .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
         .expect("commit");

      let path = temp_dir.path().to_string_lossy().into_owned();
      (temp_dir, path)
   }

   fn index_blob_content(repo_path: &str, raw_path: &[u8]) -> Option<String> {
      let repo = Repository::open(repo_path).expect("repo");
      let index = repo.index().expect("index");
      let entry = index.iter().find(|entry| entry.path == raw_path)?;
      let blob = repo.find_blob(entry.id).expect("index blob");
      Some(String::from_utf8(blob.content().to_vec()).expect("utf-8 blob"))
   }

   #[test]
   fn adds_a_file_whose_path_is_not_utf8() {
      let invalid_name = OsStr::from_bytes(b"bad-\xff-name.txt");
      let (_temp_dir, repo_path) = init_repo_with_files(&[invalid_name]);
      fs::remove_file(std::path::Path::new(&repo_path).join(invalid_name)).expect("remove file");
      fs::write(
         std::path::Path::new(&repo_path).join(invalid_name),
         "changed\n",
      )
      .expect("write file");

      _git_add(
         repo_path.clone(),
         String::from_utf8_lossy(invalid_name.as_bytes()).into_owned(),
      )
      .expect("stage file");

      assert_eq!(
         index_blob_content(&repo_path, invalid_name.as_bytes()).as_deref(),
         Some("changed\n")
      );
   }

   #[test]
   fn discard_refuses_a_path_that_matches_two_files() {
      let invalid_name = OsStr::from_bytes(b"bad-\xff-name.txt");
      let lookalike_name = OsStr::from_bytes(b"bad-\xef\xbf\xbd-name.txt");
      let (temp_dir, repo_path) = init_repo_with_files(&[invalid_name, lookalike_name]);

      fs::write(temp_dir.path().join(invalid_name), "changed bytes\n").expect("change file");
      fs::write(temp_dir.path().join(lookalike_name), "changed lookalike\n")
         .expect("change lookalike");

      let lossy_path = String::from_utf8_lossy(invalid_name.as_bytes()).into_owned();
      let result = _git_discard_file_changes(repo_path, lossy_path);

      assert!(result.is_err(), "discard should refuse an ambiguous path");
      assert_eq!(
         fs::read_to_string(temp_dir.path().join(invalid_name)).expect("read bytes file"),
         "changed bytes\n"
      );
      assert_eq!(
         fs::read_to_string(temp_dir.path().join(lookalike_name)).expect("read lookalike"),
         "changed lookalike\n"
      );
   }
}
