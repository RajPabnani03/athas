export interface SelectionOperationResult {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

export type SortDirection = "asc" | "desc";
export type CaseTransform = "upper" | "lower" | "title";

interface FullLineSpan {
  start: number;
  /** Exclusive offset of the end of the last line, never including its trailing newline. */
  end: number;
  text: string;
}

function clampOffset(content: string, offset: number): number {
  return Math.max(0, Math.min(offset, content.length));
}

/**
 * Expands an arbitrary [start, end] offset range so that it covers every line
 * the range touches. The returned span starts at the beginning of the first
 * line and ends at the end of the last line, never including the trailing
 * newline of that last line.
 */
function expandToFullLines(content: string, start: number, end: number): FullLineSpan {
  const safeStart = clampOffset(content, Math.min(start, end));
  const safeEnd = clampOffset(content, Math.max(start, end));

  const lineStart = content.lastIndexOf("\n", Math.max(0, safeStart - 1)) + 1;

  // When a non-empty selection ends exactly at a line boundary (right after a
  // newline) the trailing line should not be pulled in.
  let searchFrom = safeEnd;
  if (safeEnd > safeStart && safeEnd > 0 && content[safeEnd - 1] === "\n") {
    searchFrom = safeEnd - 1;
  }

  const nextBreak = content.indexOf("\n", searchFrom);
  const lineEnd = nextBreak === -1 ? content.length : nextBreak;

  return { start: lineStart, end: lineEnd, text: content.slice(lineStart, lineEnd) };
}

function replaceSpan(
  content: string,
  start: number,
  end: number,
  replacement: string,
): SelectionOperationResult {
  return {
    content: content.slice(0, start) + replacement + content.slice(end),
    selectionStart: start,
    selectionEnd: start + replacement.length,
  };
}

/**
 * Sorts the lines covered by the selection (or the current line when the
 * selection is collapsed) alphabetically. Comparison uses `localeCompare` so
 * results follow natural locale ordering.
 */
export function sortLines(
  content: string,
  start: number,
  end: number,
  direction: SortDirection,
): SelectionOperationResult {
  const span = expandToFullLines(content, start, end);
  const lines = span.text.split("\n");
  const sorted = [...lines].sort((a, b) => a.localeCompare(b));
  if (direction === "desc") sorted.reverse();

  return replaceSpan(content, span.start, span.end, sorted.join("\n"));
}

function toTitleCase(text: string): string {
  return text.replace(/\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function applyCase(text: string, mode: CaseTransform): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitleCase(text);
  }
}

/**
 * Transforms the case of the selected text. When the selection is collapsed the
 * current line is transformed instead.
 */
export function transformCase(
  content: string,
  start: number,
  end: number,
  mode: CaseTransform,
): SelectionOperationResult {
  let from = clampOffset(content, Math.min(start, end));
  let to = clampOffset(content, Math.max(start, end));

  if (from === to) {
    const span = expandToFullLines(content, from, from);
    from = span.start;
    to = span.end;
  }

  return replaceSpan(content, from, to, applyCase(content.slice(from, to), mode));
}

/**
 * Joins the lines covered by the selection into a single line, collapsing the
 * leading whitespace of each joined line into a single space. When the
 * selection is collapsed the current line is joined with the line below it.
 */
export function joinLines(content: string, start: number, end: number): SelectionOperationResult {
  let span = expandToFullLines(content, start, end);
  let lines = span.text.split("\n");

  // A collapsed selection on a single line joins it with the following line,
  // matching the behaviour of common editors.
  if (lines.length === 1) {
    const nextBreak = content.indexOf("\n", span.end);
    if (nextBreak === -1) return { content, selectionStart: span.end, selectionEnd: span.end };

    const after = content.indexOf("\n", nextBreak + 1);
    const extendedEnd = after === -1 ? content.length : after;
    span = { start: span.start, end: extendedEnd, text: content.slice(span.start, extendedEnd) };
    lines = span.text.split("\n");
  }

  let joined = "";
  for (let i = 0; i < lines.length; i++) {
    const segment = i === 0 ? lines[i].replace(/\s+$/, "") : lines[i].replace(/^\s+/, "");
    if (i === 0) {
      joined = segment;
    } else if (segment.length > 0) {
      joined += (joined.length > 0 ? " " : "") + segment;
    }
  }

  const caret = span.start + joined.length;
  return {
    content: content.slice(0, span.start) + joined + content.slice(span.end),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/**
 * Removes trailing spaces and tabs from every line in the document. The
 * selection is clamped to the new content length so the caret stays valid.
 */
export function trimTrailingWhitespace(
  content: string,
  start: number,
  end: number,
): SelectionOperationResult {
  const nextContent = content.replace(/[^\S\r\n]+(?=\r?\n|$)/g, "");
  return {
    content: nextContent,
    selectionStart: clampOffset(nextContent, Math.min(start, end)),
    selectionEnd: clampOffset(nextContent, Math.max(start, end)),
  };
}
