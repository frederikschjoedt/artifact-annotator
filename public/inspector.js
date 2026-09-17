(() => {
  let active = true;
  let highlighted = null;
  let revealTimer = null;
  const style = document.createElement("style");
  style.textContent = `
    .artifact-annotator-hover { outline: 2px solid #ff3d8f !important; outline-offset: 3px !important; cursor: crosshair !important; }
    .artifact-annotator-reveal { outline: 2px solid #ff3d8f !important; outline-offset: 3px !important; background: rgba(255, 61, 143, .16) !important; }
    ::selection { background: rgba(255, 61, 143, .24); }
  `;
  document.documentElement.append(style);

  window.addEventListener("message", (event) => {
    if (event.data?.source !== "artifact-annotator-parent") return;
    if (event.data.type === "set-active") {
      active = Boolean(event.data.active);
      return clearHighlight();
    }
    if (event.data.type === "reveal") reveal(event.data.selector);
  });

  // Hovering a note in the review pane points back at the element it is attached to.
  function reveal(selector) {
    clearTimeout(revealTimer);
    document.querySelectorAll(".artifact-annotator-reveal").forEach((node) => {
      node.classList.remove("artifact-annotator-reveal");
    });
    if (!selector) return;
    let target = null;
    try {
      target = document.querySelector(selector);
    } catch {
      return;
    }
    if (!target) return;
    target.classList.add("artifact-annotator-reveal");
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    revealTimer = setTimeout(() => target.classList.remove("artifact-annotator-reveal"), 900);
  }

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
    const svgContext = describeSvg(target);
    window.parent.postMessage({
      source: "artifact-annotator",
      type: "anchor",
      anchor: {
        type: selection ? "selection" : "element",
        selector: selectorFor(target),
        tag: target.tagName.toLowerCase(),
        section: nearestHeading(target),
        quote: (selection || svgContext.label || target.innerText || target.textContent || target.getAttribute("aria-label") || "").trim().slice(0, 1000),
        classes: [...target.classList].filter((name) => name !== "artifact-annotator-hover"),
        diagramElement: svgContext.element,
        svg: svgContext.metadata,
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

  function describeSvg(element) {
    const svg = element.closest("svg");
    if (!svg) return { label: "", element: undefined, metadata: undefined };
    const group = element.closest("g[id]");
    const title = element.querySelector?.("title")?.textContent || group?.querySelector("title")?.textContent || svg.querySelector("title")?.textContent;
    const label = title || element.getAttribute("aria-label") || group?.getAttribute("aria-label") || group?.textContent || element.textContent || "";
    const box = typeof element.getBBox === "function" ? element.getBBox() : null;
    return {
      label: label.replace(/\s+/g, " ").trim(),
      element: element.id || group?.id || element.tagName.toLowerCase(),
      metadata: {
        svgId: svg.id || undefined,
        groupId: group?.id || undefined,
        coordinates: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined
      }
    };
  }
})();
