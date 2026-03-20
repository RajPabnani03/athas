import type { FileEntry } from "../models/app";

/** Normalize filesystem paths so tree lookups match across `/` vs `\\` and trailing slashes. */
export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizePathKey(a) === normalizePathKey(b);
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
  const targetKey = normalizePathKey(targetPath);
  for (const file of files) {
    if (normalizePathKey(file.path) === targetKey) {
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
  const targetKey = normalizePathKey(targetPath);
  return files.map((file) => {
    if (normalizePathKey(file.path) === targetKey) {
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
  const targetKey = normalizePathKey(targetPath);
  return files
    .filter((file) => normalizePathKey(file.path) !== targetKey)
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
    const norm = normalizePathKey(files[0].path);
    const lastSlash = norm.lastIndexOf("/");
    const rootDirFromFirstFile = lastSlash >= 0 ? norm.slice(0, lastSlash) : norm;
    if (pathsEqual(parentPath, rootDirFromFirstFile)) {
      // Add to top level since parentPath is the root directory
      return sortFileEntries([...files, newFile]);
    }
  }

  const result = files.map((file) => {
    if (pathsEqual(file.path, parentPath) && file.isDir) {
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
