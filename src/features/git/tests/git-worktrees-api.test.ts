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
    const result = await removeWorktree("/repo", "/repo/.worktrees/feature");

    expect(result).toEqual({ success: true });
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

  it("returns the backend error when removal is refused", async () => {
    mockInvoke.mockRejectedValue(new Error("worktree contains modified or untracked files"));

    const result = await removeWorktree("/repo", "/repo/.worktrees/feature", false);

    expect(result).toEqual({
      success: false,
      error: "worktree contains modified or untracked files",
    });
  });
});
