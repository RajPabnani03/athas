import type { Node } from "web-tree-sitter";
import { describe, expect, it } from "vite-plus/test";
import {
  findInjectionNodes,
  getInjectionRules,
  resolveInjectedLanguage,
} from "../lib/wasm-parser/language-injections";

function nodeRange(startIndex: number, endIndex: number): Node {
  return { startIndex, endIndex } as Node;
}

describe("language injections", () => {
  it("uses shared rules for embedded HTML languages", () => {
    expect(getInjectionRules("html")).toEqual([
      { parentType: "script_element", contentType: "raw_text", language: "javascript" },
      { parentType: "style_element", contentType: "raw_text", language: "css" },
    ]);
  });

  it("injects fenced code blocks for Markdown and R Markdown", () => {
    expect(getInjectionRules("markdown")).toEqual([
      { parentType: "*", contentType: "html_block", language: "html" },
      { parentType: "fenced_code_block", contentType: "code_fence_content", language: "text" },
    ]);
    expect(getInjectionRules("rmarkdown")).toEqual([
      { parentType: "*", contentType: "html_block", language: "html" },
      { parentType: "fenced_code_block", contentType: "code_fence_content", language: "r" },
    ]);
  });

  it("resolves R Markdown chunk language from the code fence info string", () => {
    const source = "```{r cars}\nsummary(cars)\n```";
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange("```{r cars}\n".length, source.indexOf("\n```"));
    const fenceRule = getInjectionRules("rmarkdown")?.find(
      (rule) => rule.contentType === "code_fence_content",
    );

    expect(fenceRule).toBeDefined();
    expect(resolveInjectedLanguage(source, "rmarkdown", fenceRule!, contentNode, parentNode)).toBe(
      "r",
    );
  });

  it("resolves Python chunks in notebook-style Markdown fences", () => {
    const source = "```python\nimport pandas as pd\n```";
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange("```python\n".length, source.indexOf("\n```"));
    const fenceRule = getInjectionRules("markdown")?.find(
      (rule) => rule.contentType === "code_fence_content",
    );

    expect(fenceRule).toBeDefined();
    expect(resolveInjectedLanguage(source, "markdown", fenceRule!, contentNode, parentNode)).toBe(
      "python",
    );
  });

  it("marks untyped Markdown fences as plain text", () => {
    const source = "```\nplain text\n```";
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange("```\n".length, source.indexOf("\n```"));
    const fenceRule = getInjectionRules("markdown")?.find(
      (rule) => rule.contentType === "code_fence_content",
    );

    expect(fenceRule).toBeDefined();
    expect(resolveInjectedLanguage(source, "markdown", fenceRule!, contentNode, parentNode)).toBe(
      "text",
    );
  });

  it("resolves script lang aliases for embedded content", () => {
    const source = '<script lang="ts">const value = 1;</script>';
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange('<script lang="ts">'.length, source.indexOf("</script>"));
    const [scriptRule] = getInjectionRules("html") ?? [];

    expect(resolveInjectedLanguage(source, "html", scriptRule, contentNode, parentNode)).toBe(
      "typescript",
    );
  });

  it("keeps Svelte TSX script blocks distinct", () => {
    const source = '<script lang="tsx">export let value;</script>';
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange('<script lang="tsx">'.length, source.indexOf("</script>"));
    const [scriptRule] = getInjectionRules("svelte") ?? [];

    expect(resolveInjectedLanguage(source, "svelte", scriptRule, contentNode, parentNode)).toBe(
      "typescriptreact",
    );
  });

  it("returns Astro-specific injection rules", () => {
    expect(getInjectionRules("astro")).toEqual([
      { parentType: "frontmatter", contentType: "frontmatter_js_block", language: "typescript" },
      { parentType: "script_element", contentType: "raw_text", language: "typescript" },
      { parentType: "style_element", contentType: "raw_text", language: "css" },
      { parentType: "*", contentType: "attribute_js_expr", language: "typescript" },
      { parentType: "*", contentType: "permissible_text", language: "typescript" },
    ]);
  });

  it("treats Astro scripts without a lang attribute as TypeScript", () => {
    const source = "<script>const value = 1;</script>";
    const parentNode = nodeRange(0, source.length);
    const contentNode = nodeRange("<script>".length, source.indexOf("</script>"));
    const [, scriptRule] = getInjectionRules("astro") ?? [];

    expect(scriptRule).toBeDefined();
    expect(resolveInjectedLanguage(source, "astro", scriptRule, contentNode, parentNode)).toBe(
      "typescript",
    );
  });

  it("finds Astro frontmatter injection nodes", () => {
    const source = '---\nconst title = "Hello";\n---';
    const parentNode = {
      type: "frontmatter",
      startIndex: 0,
      endIndex: source.length,
      childCount: 1,
      child: () =>
        ({ type: "frontmatter_js_block", startIndex: 3, endIndex: source.length - 3 }) as Node,
    } as unknown as Node;

    const rules = getInjectionRules("astro") ?? [];
    const injectionNodes = findInjectionNodes(parentNode, rules);

    expect(injectionNodes).toHaveLength(1);
    expect(injectionNodes[0].node.type).toBe("frontmatter_js_block");
    expect(injectionNodes[0].parentNode?.type).toBe("frontmatter");
  });

  it("resolves Astro frontmatter and attribute expressions as TypeScript", () => {
    const source = '---\nconst title = "Hello";\n---\n<div style={styleMap}></div>';
    const rules = getInjectionRules("astro") ?? [];
    const frontmatterRule = rules[0];
    const attrRule = rules[3];

    expect(frontmatterRule).toBeDefined();
    expect(attrRule).toBeDefined();
    expect(
      resolveInjectedLanguage(source, "astro", frontmatterRule, nodeRange(3, 25), nodeRange(0, 28)),
    ).toBe("typescript");
    expect(resolveInjectedLanguage(source, "astro", attrRule, nodeRange(42, 50), null)).toBe(
      "typescript",
    );
  });
});
