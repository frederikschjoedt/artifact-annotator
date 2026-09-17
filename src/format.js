export function formatAnnotations(bundle, bundlePath) {
  const lines = [
    "Artifact annotations submitted.",
    "",
    `Bundle: ${bundlePath}`,
    `Artifact: ${bundle.artifact.path}`,
    ""
  ];

  if (bundle.overallFeedback) {
    lines.push("## Overall instructions", "", bundle.overallFeedback, "");
  }

  for (const [index, annotation] of bundle.annotations.entries()) {
    lines.push(`## Annotation ${index + 1}: ${capitalize(annotation.intent)}`, "");
    if (annotation.anchor.section) lines.push(`Section: ${annotation.anchor.section}`);
    if (annotation.anchor.startLine) {
      const range = annotation.anchor.endLine > annotation.anchor.startLine
        ? `${annotation.anchor.startLine}-${annotation.anchor.endLine}`
        : `${annotation.anchor.startLine}`;
      lines.push(`Lines: ${range}`);
    }
    if (annotation.anchor.region) lines.push(`Inside: ${annotation.anchor.region}`);
    if (annotation.anchor.selector) lines.push(`Element: ${annotation.anchor.selector}`);
    if (annotation.anchor.diagramElement) lines.push(`Diagram element: ${annotation.anchor.diagramElement}`);
    if (annotation.anchor.assetPath) lines.push(`Asset: ${annotation.anchor.assetPath}`);
    if (annotation.anchor.viewport) {
      lines.push(`Viewport: ${annotation.anchor.viewport.width}x${annotation.anchor.viewport.height}`);
    }
    if (annotation.anchor.quote) {
      lines.push("", ...annotation.anchor.quote.split("\n").map((line) => `> ${line}`));
    }
    lines.push("", annotation.comment, "");
  }

  if (!bundle.overallFeedback && bundle.annotations.length === 0) {
    lines.push("No annotations were added.", "");
  }

  return lines.join("\n").trimEnd();
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
