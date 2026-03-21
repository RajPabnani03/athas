import { describe, expect, it } from "vitest";
import { buildVisibleFileTreeRows } from "./visible-file-tree-rows";
import type { FileEntry } from "@/features/file-system/types/app";

const dir = (path: string, children?: FileEntry[]): FileEntry => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: true,
  children,
});

const file = (path: string): FileEntry => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: false,
});

describe("buildVisibleFileTreeRows", () => {
  it("shows root children when root is expanded", () => {
    const files = [dir("/project", [dir("/project/src"), file("/project/readme.md")])];
    const expanded = new Set(["/project"]);
    const rows = buildVisibleFileTreeRows(files, expanded);
    expect(rows.map((r) => r.file.path)).toEqual([
      "/project",
      "/project/src",
      "/project/readme.md",
    ]);
    expect(rows[0].depth).toBe(0);
    expect(rows[1].depth).toBe(1);
  });

  it("shows nested items when multiple levels are expanded", () => {
    const files = [
      dir("/project", [dir("/project/src", [dir("/project/src/components")])]),
    ];
    const expanded = new Set(["/project", "/project/src"]);
    const rows = buildVisibleFileTreeRows(files, expanded);
    expect(rows.map((r) => r.file.path)).toEqual([
      "/project",
      "/project/src",
      "/project/src/components",
    ]);
    expect(rows[2].depth).toBe(2);
  });

  it("hides descendants when a middle folder is collapsed", () => {
    const files = [
      dir("/project", [dir("/project/src", [dir("/project/src/components")])]),
    ];
    const expanded = new Set(["/project"]);
    const rows = buildVisibleFileTreeRows(files, expanded);
    expect(rows.map((r) => r.file.path)).toEqual(["/project", "/project/src"]);
  });

  it("handles deeply nested expansion correctly", () => {
    const files = [
      dir("/a", [dir("/a/b", [dir("/a/b/c", [file("/a/b/c/d.ts")])])]),
    ];
    const expanded = new Set(["/a", "/a/b", "/a/b/c"]);
    const rows = buildVisibleFileTreeRows(files, expanded);
    expect(rows).toHaveLength(4);
    expect(rows[3].file.path).toBe("/a/b/c/d.ts");
    expect(rows[3].depth).toBe(3);
  });
});
