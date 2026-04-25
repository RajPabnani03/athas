import { describe, expect, it } from "vite-plus/test";
import { resolveWorkspaceRoot } from "./workspace-root";

describe("resolveWorkspaceRoot", () => {
  it("returns the nearest marker inside the preferred workspace root", async () => {
    const existingPaths = new Set([
      "/workspace/project/packages/app/package.json",
      "/workspace/project/package.json",
    ]);

    await expect(
      resolveWorkspaceRoot("/workspace/project/packages/app/src/main.ts", {
        preferredRoot: "/workspace/project",
        pathExists: async (path) => existingPaths.has(path),
      }),
    ).resolves.toBe("/workspace/project/packages/app");
  });

  it("falls back to the preferred workspace root when no marker is found inside it", async () => {
    await expect(
      resolveWorkspaceRoot("/workspace/project/src/main.ts", {
        preferredRoot: "/workspace/project",
        pathExists: async () => false,
      }),
    ).resolves.toBe("/workspace/project");
  });

  it("discovers a project root without a preferred workspace", async () => {
    const existingPaths = new Set(["/standalone/repo/Cargo.toml"]);

    await expect(
      resolveWorkspaceRoot("/standalone/repo/src/lib.rs", {
        pathExists: async (path) => existingPaths.has(path),
      }),
    ).resolves.toBe("/standalone/repo");
  });

  it("returns the remote workspace root for remote files", async () => {
    await expect(
      resolveWorkspaceRoot("remote://conn-123/home/me/project/src/main.ts", {
        preferredRoot: "remote://conn-123/workspace/",
      }),
    ).resolves.toBe("remote://conn-123/workspace/");
  });

  it("falls back to the remote connection root when the preferred root is for another connection", async () => {
    await expect(
      resolveWorkspaceRoot("remote://conn-123/home/me/project/src/main.ts", {
        preferredRoot: "remote://other-conn/workspace/",
      }),
    ).resolves.toBe("remote://conn-123/");
  });

  it("supports Windows-style paths", async () => {
    const existingPaths = new Set(["C:\\workspace\\repo\\package.json"]);

    await expect(
      resolveWorkspaceRoot("C:\\workspace\\repo\\src\\main.ts", {
        pathExists: async (path) => existingPaths.has(path),
      }),
    ).resolves.toBe("C:\\workspace\\repo");
  });
});
