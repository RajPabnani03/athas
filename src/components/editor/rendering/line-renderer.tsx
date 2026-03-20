import type React from "react";
import { memo } from "react";
import type { Decoration, LineToken } from "@/types/editor-types";
import { cn } from "@/utils/cn";

interface LineRendererProps {
  lineNumber: number;
  content: string;
  tokens: LineToken[];
  decorations: Decoration[];
  isSelected?: boolean;
  searchHighlight?: { start: number; end: number }[];
}

// Memoized line renderer for performance
const LineRendererInternal = ({
  lineNumber,
  content,
  tokens,
  decorations,
  isSelected = false,
  searchHighlight = [],
}: LineRendererProps) => {
  const renderTokenizedContent = () => {
    if (!tokens || tokens.length === 0) {
      return <span>{content || "\u00A0"}</span>;
    }

    const elements: React.ReactNode[] = [];
    let lastEnd = 0;

    const sortedTokens = [...tokens].sort((a, b) => a.startColumn - b.startColumn);

    sortedTokens.forEach((token, index) => {
      if (token.startColumn > lastEnd) {
        elements.push(
          <span key={`text-${index}`}>{content.slice(lastEnd, token.startColumn)}</span>,
        );
      }

      const tokenContent = content.slice(token.startColumn, token.endColumn);
      elements.push(
        <span key={`token-${index}`} className={token.className}>
          {tokenContent}
        </span>,
      );

      lastEnd = token.endColumn;
    });

    if (lastEnd < content.length) {
      elements.push(<span key="text-end">{content.slice(lastEnd)}</span>);
    }

    if (elements.length === 0 && content.length === 0) {
      elements.push(<span key="empty">{"\u00A0"}</span>);
    }

    return <>{elements}</>;
  };

  const renderContent = () => {
    const inlineDecorations = decorations.filter(
      (d) => d.type === "inline" && d.range.start.line === lineNumber,
    );

    if (inlineDecorations.length === 0 && searchHighlight.length === 0) {
      return renderTokenizedContent();
    }

    // Collect all boundaries from tokens, search highlights, and inline decorations
    const boundaries = new Set<number>([0, content.length]);

    for (const token of tokens) {
      boundaries.add(token.startColumn);
      boundaries.add(token.endColumn);
    }

    for (const highlight of searchHighlight) {
      boundaries.add(Math.max(0, highlight.start));
      boundaries.add(Math.min(content.length, highlight.end));
    }

    for (const dec of inlineDecorations) {
      boundaries.add(Math.max(0, dec.range.start.column));
      boundaries.add(Math.min(content.length, dec.range.end.column));
    }

    const sortedBoundaries = [...boundaries]
      .filter((b) => b >= 0 && b <= content.length)
      .sort((a, b) => a - b);

    const elements: React.ReactNode[] = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const start = sortedBoundaries[i];
      const end = sortedBoundaries[i + 1];
      const text = content.slice(start, end);

      if (!text) continue;

      const classes: string[] = [];

      for (const token of tokens) {
        if (start >= token.startColumn && end <= token.endColumn && token.className) {
          classes.push(token.className);
        }
      }

      for (const highlight of searchHighlight) {
        if (start >= highlight.start && end <= highlight.end) {
          classes.push("search-highlight");
        }
      }

      for (const dec of inlineDecorations) {
        const decStart = dec.range.start.column;
        const decEnd = dec.range.end.column;
        if (start >= decStart && end <= decEnd && dec.className) {
          classes.push(dec.className);
        }
      }

      elements.push(
        <span key={`seg-${start}`} className={classes.length > 0 ? classes.join(" ") : undefined}>
          {text}
        </span>,
      );
    }

    if (elements.length === 0) {
      elements.push(<span key="empty">{"\u00A0"}</span>);
    }

    return <>{elements}</>;
  };

  return (
    <div className={cn("editor-line", isSelected && "selected")} data-line-number={lineNumber}>
      <span className="editor-line-content">{renderContent()}</span>
    </div>
  );
};

// Export memoized version for performance
export const LineRenderer = memo(LineRendererInternal, (prevProps, nextProps) => {
  // Custom comparison for optimal re-rendering
  return (
    prevProps.lineNumber === nextProps.lineNumber &&
    prevProps.content === nextProps.content &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.tokens.length === nextProps.tokens.length &&
    prevProps.decorations.length === nextProps.decorations.length &&
    (prevProps.searchHighlight?.length || 0) === (nextProps.searchHighlight?.length || 0)
  );
});
