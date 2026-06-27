import { describe, expect, it } from "vite-plus/test";
import {
  joinLines,
  sortLines,
  transformCase,
  trimTrailingWhitespace,
} from "../utils/selection-operations";

describe("selection operation utilities", () => {
  describe("sortLines", () => {
    it("sorts the selected lines ascending", () => {
      const content = "gamma\nalpha\nbeta";
      expect(sortLines(content, 0, content.length, "asc")).toEqual({
        content: "alpha\nbeta\ngamma",
        selectionStart: 0,
        selectionEnd: "alpha\nbeta\ngamma".length,
      });
    });

    it("sorts the selected lines descending", () => {
      const content = "alpha\nbeta\ngamma";
      expect(sortLines(content, 0, content.length, "desc")).toEqual({
        content: "gamma\nbeta\nalpha",
        selectionStart: 0,
        selectionEnd: content.length,
      });
    });

    it("expands a collapsed selection to cover whole lines it touches", () => {
      // Selection only spans "eta\ngam" but full lines are pulled in.
      const content = "alpha\nbeta\ngamma";
      const start = "alpha\nb".length;
      const end = "alpha\nbeta\ngam".length;
      expect(sortLines(content, start, end, "asc")).toEqual({
        content: "alpha\nbeta\ngamma",
        selectionStart: "alpha\n".length,
        selectionEnd: content.length,
      });
    });

    it("does not pull in the next line when the selection ends at a line boundary", () => {
      const content = "gamma\nalpha\nbeta";
      const end = "gamma\nalpha\n".length;
      const result = sortLines(content, 0, end, "asc");
      expect(result.content).toBe("alpha\ngamma\nbeta");
    });
  });

  describe("transformCase", () => {
    it("uppercases the selected text only", () => {
      const content = "hello world";
      expect(transformCase(content, 0, "hello".length, "upper")).toEqual({
        content: "HELLO world",
        selectionStart: 0,
        selectionEnd: "HELLO".length,
      });
    });

    it("lowercases the selected text", () => {
      const content = "HELLO WORLD";
      expect(transformCase(content, 6, content.length, "lower").content).toBe("HELLO world");
    });

    it("title-cases each word in the selection", () => {
      const content = "the quick BROWN fox";
      expect(transformCase(content, 0, content.length, "title").content).toBe(
        "The Quick Brown Fox",
      );
    });

    it("falls back to the current line when the selection is collapsed", () => {
      const content = "alpha\nbeta\ngamma";
      const offset = "alpha\nbe".length;
      expect(transformCase(content, offset, offset, "upper")).toEqual({
        content: "alpha\nBETA\ngamma",
        selectionStart: "alpha\n".length,
        selectionEnd: "alpha\nbeta".length,
      });
    });
  });

  describe("joinLines", () => {
    it("joins the selected lines collapsing indentation into single spaces", () => {
      const content = "alpha\n   beta\n\tgamma";
      const result = joinLines(content, 0, content.length);
      expect(result.content).toBe("alpha beta gamma");
      expect(result.selectionStart).toBe("alpha beta gamma".length);
      expect(result.selectionEnd).toBe("alpha beta gamma".length);
    });

    it("joins the current line with the next when the selection is collapsed", () => {
      const content = "alpha\nbeta\ngamma";
      const offset = "alp".length;
      expect(joinLines(content, offset, offset).content).toBe("alpha beta\ngamma");
    });

    it("does nothing when joining the last line with no following line", () => {
      const content = "alpha\nbeta";
      const offset = "alpha\nbe".length;
      expect(joinLines(content, offset, offset).content).toBe(content);
    });
  });

  describe("trimTrailingWhitespace", () => {
    it("removes trailing spaces and tabs from every line", () => {
      const content = "alpha  \nbeta\t\ngamma   ";
      expect(trimTrailingWhitespace(content, 0, 0).content).toBe("alpha\nbeta\ngamma");
    });

    it("preserves blank lines and leading indentation", () => {
      const content = "  indented   \n\n  keep";
      expect(trimTrailingWhitespace(content, 0, 0).content).toBe("  indented\n\n  keep");
    });

    it("clamps the selection to the trimmed content length", () => {
      const content = "alpha   ";
      const result = trimTrailingWhitespace(content, content.length, content.length);
      expect(result.content).toBe("alpha");
      expect(result.selectionStart).toBe("alpha".length);
      expect(result.selectionEnd).toBe("alpha".length);
    });
  });
});
