import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("CompanyPanel layout", () => {
  it("uses bounded panel height classes", () => {
    const source = readFileSync(new URL("./company-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("flex shrink-0 flex-col border-t border-border bg-primary-bg");
    expect(source).toContain('className="flex h-64 min-h-0 flex-col"');
    expect(source).not.toContain("flex h-full flex-col border-t border-border bg-primary-bg");
  });
});
