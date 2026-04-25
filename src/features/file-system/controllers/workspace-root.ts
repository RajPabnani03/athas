import {
  buildRemoteRootPath,
  isRemotePath,
  parseRemotePath,
} from "@/features/remote/utils/remote-path";

export const WORKSPACE_ROOT_MARKERS = [
  ".git",
  "package.json",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "pnpm-workspace.yaml",
  "package-lock.json",
  "yarn.lock",
  "pyproject.toml",
  "go.mod",
] as const;

type PathExists = (path: string) => Promise<boolean>;

interface ResolveWorkspaceRootOptions {
  preferredRoot?: string;
  pathExists?: PathExists;
  markers?: readonly string[];
}

interface WorkspaceRootSearchResult {
  root: string;
  foundMarker: boolean;
}

function normalizeForComparison(path: string): string {
  let normalized = path.replace(/\\/g, "/");

  if (normalized !== "/") {
    normalized = normalized.replace(/\/+$/, "");
  }

  if (!normalized) {
    return "/";
  }

  if (/^[a-zA-Z]:/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return normalized;
}

function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeForComparison(path);
  const normalizedRoot = normalizeForComparison(root);

  if (normalizedRoot === "/") {
    return normalizedPath.startsWith("/");
  }

  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isWindowsDriveRoot(path: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(path);
}

function stripTrailingSeparators(path: string): string {
  if (path === "/" || isWindowsDriveRoot(path)) {
    return path;
  }

  return path.replace(/[\\/]+$/, "");
}

function getParentDirectory(path: string): string | undefined {
  const normalizedPath = stripTrailingSeparators(path);

  if (normalizedPath === "/" || isWindowsDriveRoot(normalizedPath)) {
    return undefined;
  }

  const separatorIndex = Math.max(
    normalizedPath.lastIndexOf("/"),
    normalizedPath.lastIndexOf("\\"),
  );

  if (separatorIndex < 0) {
    return undefined;
  }

  if (separatorIndex === 0) {
    return "/";
  }

  const parentDirectory = normalizedPath.slice(0, separatorIndex);
  if (/^[a-zA-Z]:$/.test(parentDirectory)) {
    return `${parentDirectory}${normalizedPath[separatorIndex]}`;
  }

  return parentDirectory;
}

function getFileDirectory(path: string): string | undefined {
  return getParentDirectory(path);
}

function joinPath(directoryPath: string, childPath: string): string {
  if (directoryPath === "/") {
    return `/${childPath}`;
  }

  if (isWindowsDriveRoot(directoryPath)) {
    return `${directoryPath}${childPath}`;
  }

  const separator = directoryPath.includes("\\") ? "\\" : "/";
  return `${directoryPath}${separator}${childPath}`;
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(path);
  } catch {
    return false;
  }
}

async function getCurrentWorkspaceRoot(): Promise<string | undefined> {
  try {
    const { useFileSystemStore } = await import("./store");
    return useFileSystemStore.getState().rootFolderPath;
  } catch {
    return undefined;
  }
}

async function findWorkspaceRoot(
  filePath: string,
  pathExists: PathExists,
  markers: readonly string[],
  stopDirectory?: string,
): Promise<WorkspaceRootSearchResult | undefined> {
  const fileDirectory = getFileDirectory(filePath);
  if (!fileDirectory) {
    return undefined;
  }

  const normalizedStopDirectory = stopDirectory
    ? normalizeForComparison(stripTrailingSeparators(stopDirectory))
    : undefined;
  let currentDirectory: string | undefined = fileDirectory;
  while (currentDirectory) {
    for (const marker of markers) {
      if (await pathExists(joinPath(currentDirectory, marker))) {
        return {
          root: currentDirectory,
          foundMarker: true,
        };
      }
    }

    if (
      normalizedStopDirectory &&
      normalizeForComparison(stripTrailingSeparators(currentDirectory)) === normalizedStopDirectory
    ) {
      break;
    }

    currentDirectory = getParentDirectory(currentDirectory);
  }

  return {
    root: fileDirectory,
    foundMarker: false,
  };
}

async function findWorkspaceRootWithinPreferredRoot(
  filePath: string,
  preferredRoot: string,
  pathExists: PathExists,
  markers: readonly string[],
): Promise<string> {
  const searchResult = await findWorkspaceRoot(filePath, pathExists, markers, preferredRoot);

  if (!searchResult) {
    return preferredRoot;
  }

  const normalizedPreferredRoot = normalizeForComparison(stripTrailingSeparators(preferredRoot));
  const normalizedResolvedRoot = normalizeForComparison(stripTrailingSeparators(searchResult.root));

  if (!searchResult.foundMarker) {
    return preferredRoot;
  }

  if (
    normalizedResolvedRoot === normalizedPreferredRoot ||
    normalizedResolvedRoot.startsWith(`${normalizedPreferredRoot}/`)
  ) {
    return searchResult.root;
  }

  return preferredRoot;
}

function getRemoteWorkspaceRoot(filePath: string, preferredRoot?: string): string | undefined {
  const parsedPath = parseRemotePath(filePath);
  if (!parsedPath) {
    return preferredRoot;
  }

  if (preferredRoot && isRemotePath(preferredRoot)) {
    const parsedRoot = parseRemotePath(preferredRoot);
    if (parsedRoot?.connectionId === parsedPath.connectionId) {
      return preferredRoot;
    }
  }

  return buildRemoteRootPath(parsedPath.connectionId);
}

export async function resolveWorkspaceRoot(
  filePath: string,
  options: ResolveWorkspaceRootOptions = {},
): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  const preferredRoot = options.preferredRoot ?? (await getCurrentWorkspaceRoot());
  if (isRemotePath(filePath)) {
    return getRemoteWorkspaceRoot(filePath, preferredRoot);
  }

  const pathExists = options.pathExists ?? defaultPathExists;
  const markers = options.markers ?? WORKSPACE_ROOT_MARKERS;

  if (preferredRoot && !isRemotePath(preferredRoot) && isPathWithinRoot(filePath, preferredRoot)) {
    return await findWorkspaceRootWithinPreferredRoot(filePath, preferredRoot, pathExists, markers);
  }

  return (await findWorkspaceRoot(filePath, pathExists, markers))?.root;
}
