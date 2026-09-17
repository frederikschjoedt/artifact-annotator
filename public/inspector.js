(() => {
  let active = true;
  let highlighted = null;
  const style = document.createElement("style");
  style.textContent = `
    .artifact-annotator-hover { outline: 3px solid #e76838 !important; outline-offset: 3px !important; cursor: crosshair !important; }
    ::selection { background: rgba(231, 104, 56, .28); }
  `;
  document.documentElement.append(style);

  window.addEventListener("message", (event) => {
    if (event.data?.source !== "artifact-annotator-parent" || event.data.type !== "set-active") return;
    active = Boolean(event.data.active);
    clearHighlight();
  });

  document.addEventListener("mouseover", (event) => {
    if (!active || event.target === document.documentElement || event.target === document.body) return;
    clearHighlight();
    highlighted = event.target;
    highlighted.classList.add("artifact-annotator-hover");
  }, true);

  document.addEventListener("mouseout", clearHighlight, true);

  document.addEventListener("click", (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    const selection = window.getSelection()?.toString().trim();
    window.parent.postMessage({
      source: "artifact-annotator",
      type: "anchor",
      anchor: {
        type: selection ? "selection" : "element",
        selector: selectorFor(target),
        tag: target.tagName.toLowerCase(),
        section: nearestHeading(target),
        quote: (selection || target.innerText || target.getAttribute("aria-label") || "").trim().slice(0, 1000),
        classes: [...target.classList].filter((name) => name !== "artifact-annotator-hover"),
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }
    }, "*");
  }, true);

  window.parent.postMessage({ source: "artifact-annotator", type: "ready" }, "*");

  function clearHighlight() {
    highlighted?.classList.remove("artifact-annotator-hover");
    highlighted = null;
  }

  function selectorFor(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`${part}#${CSS.escape(current.id)}`);
        break;
      }
      const siblings = [...current.parentElement.children].filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function nearestHeading(element) {
    const ownHeading = element.closest("section, article")?.querySelector("h1, h2, h3, h4, h5, h6");
    if (ownHeading) return ownHeading.innerText.trim();
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const preceding = headings.filter((heading) => heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
    return preceding.at(-1)?.innerText.trim() || document.title || "HTML artifact";
  }
})();
