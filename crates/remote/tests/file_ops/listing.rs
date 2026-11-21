use super::{RemoteFileEntry, parse_listing};

const LISTING: &str = "\
total 24
drwxr-xr-x  5 user group 4096 Nov 21 10:12 src
drwxr-xr-x  2 user group 4096 Nov 21 10:12 .git
-rw-r--r--  1 user group  120 Nov 21 10:12 notes.txt
-rw-r--r--  1 user group   32 Nov 21 10:12 my notes.txt
-rw-r--r--+ 1 user group   12 Nov 21 10:12 acl-file.txt
lrwxrwxrwx  1 user group   14 Nov 21 10:12 current -> /srv/current
lrwxrwxrwx  1 user group   11 Nov 21 10:12 my link -> /tmp/target dir
";

fn names(entries: &[RemoteFileEntry]) -> Vec<&str> {
   entries.iter().map(|entry| entry.name.as_str()).collect()
}

fn find<'a>(entries: &'a [RemoteFileEntry], name: &str) -> &'a RemoteFileEntry {
   entries
      .iter()
      .find(|entry| entry.name == name)
      .unwrap_or_else(|| panic!("missing entry {name}: {entries:?}"))
}

#[test]
fn keeps_symlink_name_separate_from_its_target() {
   let entries = parse_listing(LISTING, "/home/user");
   let entry = find(&entries, "current");

   assert_eq!(entry.path, "/home/user/current");
   assert!(!entry.is_dir);
}

#[test]
fn keeps_spaces_in_file_names() {
   let entries = parse_listing(LISTING, "/home/user");
   let entry = find(&entries, "my notes.txt");

   assert_eq!(entry.path, "/home/user/my notes.txt");
}

#[test]
fn keeps_spaces_in_symlink_names_and_drops_the_target() {
   let entries = parse_listing(LISTING, "/home/user");
   let entry = find(&entries, "my link");

   assert_eq!(entry.path, "/home/user/my link");
}

#[test]
fn accepts_permission_column_extensions() {
   let entries = parse_listing(LISTING, "/home/user");
   let entry = find(&entries, "acl-file.txt");

   assert_eq!(entry.size, 12);
}

#[test]
fn skips_total_header_hidden_and_parent_entries() {
   assert_eq!(
      names(&parse_listing(LISTING, "/home/user")),
      vec![
         "src",
         "notes.txt",
         "my notes.txt",
         "acl-file.txt",
         "current",
         "my link",
      ]
   );
}

#[test]
fn marks_directories_and_reads_sizes() {
   let entries = parse_listing(LISTING, "/home/user");

   assert!(find(&entries, "src").is_dir);
   assert_eq!(find(&entries, "src").size, 4096);
   assert!(!find(&entries, "notes.txt").is_dir);
   assert_eq!(find(&entries, "notes.txt").size, 120);
}

#[test]
fn builds_paths_from_the_root_directory() {
   let entries = parse_listing(
      "total 0\n-rw-r--r-- 1 user group 3 Nov 21 10:12 root.txt\n",
      "/",
   );

   assert_eq!(entries[0].path, "/root.txt");
}

#[test]
fn ignores_lines_that_are_not_listing_entries() {
   assert!(
      parse_listing(
         "ls: cannot access '/missing': No such file or directory\n",
         "/"
      )
      .is_empty()
   );
}
