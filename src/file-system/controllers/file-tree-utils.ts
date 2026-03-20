import type { FileEntry } from "../models/app";

/** Normalize paths for tree lookups (trailing slashes differ between APIs and UI). */
export function normalizePathKey(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  return trimmed || path;
}

export function sortFileEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    // Directories come first
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;

    // Then sort alphabetically (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

export function findFileInTree(files: FileEntry[], targetPath: string): FileEntry | null {
  const target = normalizePathKey(targetPath);
  for (const file of files) {
    if (normalizePathKey(file.path) === target) {
      return file;
    }
    if (file.children) {
      const found = findFileInTree(file.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function updateFileInTree(
  files: FileEntry[],
  targetPath: string,
  updater: (file: FileEntry) => FileEntry,
): FileEntry[] {
  const target = normalizePathKey(targetPath);
  return files.map((file) => {
    if (normalizePathKey(file.path) === target) {
      return updater(file);
    }
    if (file.children) {
      return {
        ...file,
        children: updateFileInTree(file.children, targetPath, updater),
      };
    }
    return file;
  });
}

export function removeFileFromTree(files: FileEntry[], targetPath: string): FileEntry[] {
  const target = normalizePathKey(targetPath);
  return files
    .filter((file) => normalizePathKey(file.path) !== target)
    .map((file) => {
      if (file.children) {
        return {
          ...file,
          children: removeFileFromTree(file.children, targetPath),
        };
      }
      return file;
    });
}

export function addFileToTree(
  files: FileEntry[],
  parentPath: string,
  newFile: FileEntry,
): FileEntry[] {
  // If parentPath is empty or root, add to top level
  if (!parentPath || parentPath === "/" || parentPath === "\\") {
    return sortFileEntries([...files, newFile]);
  }

  // Check if parentPath matches the root folder (when files are direct children of parentPath)
  // This happens when creating files in the root directory
  if (files.length > 0 && files[0].path) {
    const firstFilePath = files[0].path;
    // Extract the parent directory of the first file
    const rootDirFromFirstFile = firstFilePath.substring(0, firstFilePath.lastIndexOf("/"));
    if (parentPath === rootDirFromFirstFile) {
      // Add to top level since parentPath is the root directory
      return sortFileEntries([...files, newFile]);
    }
  }

  const normalizedParent = normalizePathKey(parentPath);
  const result = files.map((file) => {
    if (normalizePathKey(file.path) === normalizedParent && file.isDir) {
      const children = sortFileEntries([...(file.children || []), newFile]);
      return { ...file, children, expanded: true };
    }
    if (file.children) {
      return {
        ...file,
        children: addFileToTree(file.children, parentPath, newFile),
      };
    }
    return file;
  });
  return result;
}

export function collapseAllFolders(files: FileEntry[]): FileEntry[] {
  return files.map((file) => ({
    ...file,
    expanded: false,
    children: file.children ? collapseAllFolders(file.children) : undefined,
  }));
}
