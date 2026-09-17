import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "details", "summary"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title"],
    code: ["class"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noreferrer noopener" })
  }
};

export function renderMarkdown(source) {
  const tokens = marked.lexer(source, { gfm: true });
  let cursor = 0;
  let currentHeading = "Document";

  return tokens
    .filter((token) => token.type !== "space")
    .map((token, index) => {
      const raw = token.raw || "";
      const start = source.indexOf(raw, cursor);
      const safeStart = start === -1 ? cursor : start;
      const startLine = lineAt(source, safeStart);
      const endLine = Math.max(startLine, lineAt(source, safeStart + Math.max(raw.length - 1, 0)));
      cursor = safeStart + raw.length;

      if (token.type === "heading") currentHeading = token.text;

      return {
        id: `block-${index + 1}`,
        startLine,
        endLine,
        section: currentHeading,
        text: plainText(token),
        html: sanitizeHtml(marked.parser([token]), sanitizeOptions)
      };
    });
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function plainText(token) {
  if (typeof token.text === "string") return token.text.replace(/\s+/g, " ").trim();
  return (token.raw || "").replace(/[`#>*_~\-|]/g, " ").replace(/\s+/g, " ").trim();
}
