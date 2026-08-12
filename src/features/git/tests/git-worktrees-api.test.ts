import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { removeWorktree } from "../api/git-worktrees-api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("removeWorktree", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("defaults force to false so local changes are not discarded", async () => {
    const success = await removeWorktree("/repo", "/repo/.worktrees/feature");

    expect(success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("git_remove_worktree", {
      repoPath: "/repo",
      path: "/repo/.worktrees/feature",
      force: false,
    });
  });

  it("forwards an explicit force flag when the caller opts in", async () => {
    await removeWorktree("/repo", "/repo/.worktrees/feature", true);

    expect(mockInvoke).toHaveBeenCalledWith("git_remove_worktree", {
      repoPath: "/repo",
      path: "/repo/.worktrees/feature",
      force: true,
    });
  });

  it("returns false when the backend refuses removal", async () => {
    mockInvoke.mockRejectedValue(new Error("worktree contains modified or untracked files"));

    const success = await removeWorktree("/repo", "/repo/.worktrees/feature", false);

    expect(success).toBe(false);
  });
});
