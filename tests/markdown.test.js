import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/markdown.js";
import { formatAnnotations } from "../src/format.js";

test("renders top-level Markdown tokens with source anchors", () => {
  const blocks = renderMarkdown("# Title\n\nParagraph one.\n\n## Next\n\nText.\n");
  assert.equal(blocks[0].startLine, 1);
  assert.equal(blocks[1].startLine, 3);
  assert.equal(blocks[1].section, "Title");
  assert.equal(blocks[2].section, "Next");
  assert.match(blocks[0].html, /<h1>Title<\/h1>/);
});

test("removes executable HTML from Markdown", () => {
  const blocks = renderMarkdown("Hello <script>alert('no')</script> world");
  assert.doesNotMatch(blocks[0].html, /script/i);
});

test("formats a readable annotation bundle", () => {
  const output = formatAnnotations({
    artifact: { path: "/tmp/report.md" },
    overallFeedback: "Tighten the opening.",
    annotations: [{
      intent: "change",
      anchor: { section: "Opening", startLine: 3, endLine: 4, quote: "Long introduction" },
      comment: "Cut this in half."
    }]
  }, "/tmp/annotations.json");

  assert.match(output, /Overall instructions/);
  assert.match(output, /Lines: 3-4/);
  assert.match(output, /> Long introduction/);
});
