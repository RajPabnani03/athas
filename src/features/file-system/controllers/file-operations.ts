import type { FileEntry } from "../types/app";
import {
  createDirectory as platformCreateDirectory,
  deletePath as platformDeletePath,
  readDirectory as platformReadDirectory,
  readFile as platformReadFile,
  writeFile as platformWriteFile,
} from "./platform";
import { shouldIgnore } from "./utils";

export async function readFileContent(path: string): Promise<string> {
  try {
    const content = await platformReadFile(path);
    return content || "";
  } catch (error) {
    throw new Error(`Failed to read file ${path}: ${error}`);
  }
}

async function writeFileContent(path: string, content: string): Promise<void> {
  try {
    await platformWriteFile(path, content);
  } catch (error) {
    throw new Error(`Failed to write file ${path}: ${error}`);
  }
}

export async function createNewFile(directoryPath: string, fileName: string): Promise<string> {
  if (!directoryPath || directoryPath.trim() === "") {
    throw new Error("Directory path cannot be empty");
  }
  if (!fileName || fileName.trim() === "") {
    throw new Error("File name cannot be empty");
  }

  const filePath = `${directoryPath}/${fileName}`;
  await writeFileContent(filePath, "");
  return filePath;
}

export async function createNewDirectory(parentPath: string, folderName: string): Promise<string> {
  if (!parentPath || parentPath.trim() === "") {
    throw new Error("Parent path cannot be empty");
  }
  if (!folderName || folderName.trim() === "") {
    throw new Error("Folder name cannot be empty");
  }

  const folderPath = `${parentPath}/${folderName}`;
  await platformCreateDirectory(folderPath);
  return folderPath;
}

export async function deleteFileOrDirectory(path: string): Promise<void> {
  await platformDeletePath(path);
}

export async function readDirectoryContents(path: string): Promise<FileEntry[]> {
  try {
    const entries = await platformReadDirectory(path);

    const filteredEntries = (entries as any[]).filter((entry: any) => {
      const name = entry.name || "Unknown";
      const isDir = entry.is_dir || false;
      return !shouldIgnore(name, isDir);
    });

    // Skip per-entry symlink resolution during initial directory read.
    // Symlink info is resolved lazily when a file is opened (handleFileSelect)
    // or a directory is expanded, avoiding hundreds of stat syscalls that
    // cause significant lag on large projects (see #572).
    return filteredEntries.map((entry: any) => {
      const entryPath = entry.path || `${path}/${entry.name}`;
      return {
        name: entry.name || "Unknown",
        path: entryPath,
        isDir: entry.is_dir || false,
        children: undefined,
      };
    });
  } catch (error) {
    throw new Error(`Failed to read directory ${path}: ${error}`);
  }
}
