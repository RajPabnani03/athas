import { describe, expect, it } from "vite-plus/test";
import type { FileEntry } from "@/features/file-system/types/app";
import { buildVisibleRows } from "../utils/file-explorer-tree-utils";

const tree: FileEntry[] = [
  {
    name: "src",
    path: "/project/src",
    isDir: true,
    children: [
      {
        name: "components",
        path: "/project/src/components",
        isDir: true,
        children: [
          {
            name: "deep",
            path: "/project/src/components/deep",
            isDir: true,
            children: [
              { name: "index.ts", path: "/project/src/components/deep/index.ts", isDir: false },
            ],
          },
          { name: "button.tsx", path: "/project/src/components/button.tsx", isDir: false },
        ],
      },
      { name: "app.tsx", path: "/project/src/app.tsx", isDir: false },
    ],
  },
  { name: "README.md", path: "/project/README.md", isDir: false },
];

describe("buildVisibleRows", () => {
  it("returns only top-level items when nothing is expanded", () => {
    const rows = buildVisibleRows(tree, new Set());
    expect(rows.map((r) => r.file.name)).toEqual(["src", "README.md"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("expands a single directory one level deep", () => {
    const rows = buildVisibleRows(tree, new Set(["/project/src"]));
    expect(rows.map((r) => r.file.name)).toEqual(["src", "components", "app.tsx", "README.md"]);
    expect(rows[0].isExpanded).toBe(true);
    expect(rows[1].depth).toBe(1);
  });

  it("expands nested directories beyond the second level", () => {
    const expanded = new Set([
      "/project/src",
      "/project/src/components",
      "/project/src/components/deep",
    ]);
    const rows = buildVisibleRows(tree, expanded);
    expect(rows.map((r) => r.file.name)).toEqual([
      "src",
      "components",
      "deep",
      "index.ts",
      "button.tsx",
      "app.tsx",
      "README.md",
    ]);
    expect(rows.find((r) => r.file.name === "index.ts")?.depth).toBe(3);
  });

  it("does not expand directories not in the expanded set", () => {
    const rows = buildVisibleRows(
      tree,
      new Set(["/project/src", "/project/src/components/deep"]),
    );
    expect(rows.map((r) => r.file.name)).toEqual(["src", "components", "app.tsx", "README.md"]);
  });

  it("handles an empty file tree", () => {
    const rows = buildVisibleRows([], new Set(["/anything"]));
    expect(rows).toEqual([]);
  });
});
