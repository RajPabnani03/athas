import type { ComponentPropsWithoutRef } from "react";

export interface TreeIndentGuidesProps {
  depth: number;
  baseIndent: number;
  indentSize: number;
  previousDepth?: number;
  nextDepth?: number;
  /**
   * Extra attributes for the guide at `level`. Trees that resolve a row from the
   * element under the pointer use this to label each guide with that row's path.
   */
  guideProps?: (level: number) => ComponentPropsWithoutRef<"span"> | undefined;
}

/**
 * Vertical indent guides for tree rows. Shared by the sidebar tree and the file
 * explorer so the guide width, offset and colour live in one place.
 */
export function TreeIndentGuides({
  depth,
  baseIndent,
  indentSize,
  previousDepth = depth,
  nextDepth = depth,
  guideProps,
}: TreeIndentGuidesProps) {
  if (depth <= 0) return null;

  return (
    <div className="file-tree-guides pointer-events-none absolute inset-0 z-1">
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          {...guideProps?.(level)}
          className="file-tree-guide pointer-events-auto absolute w-2 -translate-x-[3px] opacity-90 before:absolute before:inset-y-0 before:left-[3px] before:w-px before:bg-subtle-foreground/18"
          style={{
            left: `calc(${baseIndent + level * indentSize}px + 7px)`,
            top: previousDepth <= level ? "4px" : "0",
            bottom: nextDepth <= level ? "4px" : "0",
          }}
        />
      ))}
    </div>
  );
}
