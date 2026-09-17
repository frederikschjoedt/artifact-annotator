const token = new URLSearchParams(location.search).get("token");
if (!token) throw new Error("Missing annotation session token");

const INTENT_LABELS = { change: "change", question: "question", note: "note" };

const COPY = {
  markdown: {
    idle: "No notes yet. Select a passage, or hover a block and use the + in its margin.",
    prompt: "Select a passage, then say what should change."
  },
  html: {
    idle: "No notes yet. Click any element in the app to attach a note to it.",
    prompt: "Click an element in the app, then say what should change."
  }
};

const state = {
  artifact: null,
  annotations: [],
  overallFeedback: "",
  pendingAnchor: null,
  selectedIntent: "change",
  inspectActive: true,
  saveTimer: null,
  openedAt: Date.now()
};

const elements = Object.fromEntries([
  "reader", "inspect-strip", "inspect-state", "toggle-inspect", "artifact-name", "held-clock",
  "save-state", "submit-review", "markdown-artifact", "html-artifact", "feed", "overall-feedback",
  "empty-state", "annotation-list", "composer", "anchor-card", "annotation-comment", "intent-picker",
  "add-annotation", "submitted", "sent-marks", "sent-detail"
].map((id) => [id, document.getElementById(id)]));

init().catch(showFatal);

async function init() {
  const response = await api("/api/artifact");
  state.artifact = response.artifact;
  elements["artifact-name"].innerHTML = `<bdi>${escapeHtml(response.artifact.path)}</bdi>`;
  elements["artifact-name"].title = response.artifact.path;
  startHeldClock();

  const saved = localStorage.getItem(draftKey());
  if (saved) {
    const draft = JSON.parse(saved);
    state.annotations = Array.isArray(draft.annotations) ? draft.annotations : [];
    state.overallFeedback = draft.overallFeedback || "";
    elements["overall-feedback"].value = state.overallFeedback;
  }

  if (response.artifact.kind === "markdown") await renderMarkdown(response.blocks);
  else renderHtml(response.htmlUrl);
  bindControls();
  renderAnnotations();
  renderPendingAnchor();
}

/* ------------------------------------------------------------- artifacts */

async function renderMarkdown(blocks) {
  elements["markdown-artifact"].hidden = false;
  elements["markdown-artifact"].innerHTML = blocks.map((block) => `
    <section class="markdown-block"${headingAttribute(block)} data-line="${block.startLine}" data-block='${escapeAttribute(JSON.stringify(block))}'>
      <button class="block-annotate" title="Annotate lines ${block.startLine} to ${block.endLine}" aria-label="Annotate lines ${block.startLine} to ${block.endLine}">+</button>
      <div class="block-content">${block.html}</div>
    </section>`).join("");

  elements["markdown-artifact"].addEventListener("click", (event) => {
    const diagramTarget = event.target.closest(".mermaid-diagram svg [id], .mermaid-diagram svg .node, .mermaid-diagram svg .edgeLabel");
    if (diagramTarget) {
      const block = JSON.parse(diagramTarget.closest(".markdown-block").dataset.block);
      return takeAnchor({
        type: "diagram-element",
        section: block.section,
        startLine: block.startLine,
        endLine: block.endLine,
        diagramElement: diagramTarget.id || diagramTarget.getAttribute("data-id") || diagramTarget.classList[0] || diagramTarget.tagName.toLowerCase(),
        quote: diagramLabel(diagramTarget) || block.text.slice(0, 500)
      });
    }

    const image = event.target.closest(".block-content img");
    if (image) {
      const block = JSON.parse(image.closest(".markdown-block").dataset.block);
      return takeAnchor({
        type: "image",
        section: block.section,
        startLine: block.startLine,
        endLine: block.endLine,
        assetPath: decodeAssetPath(image.getAttribute("src")),
        quote: image.alt || block.text || "Image"
      });
    }

    const button = event.target.closest(".block-annotate");
    if (!button) return;
    const block = JSON.parse(button.closest(".markdown-block").dataset.block);
    takeAnchor({
      type: "block",
      section: block.section,
      startLine: block.startLine,
      endLine: block.endLine,
      quote: block.text.slice(0, 500)
    });
  });

  document.addEventListener("selectionchange", captureMarkdownSelection);
  elements["markdown-artifact"].addEventListener("mouseup", () => {
    if (state.pendingAnchor?.type === "selection" && !elements["annotation-comment"].value) {
      elements["annotation-comment"].focus();
    }
  });
  await renderMermaid(blocks);
}

async function renderMermaid(blocks) {
  const diagrams = [...document.querySelectorAll(".mermaid-diagram")];
  if (diagrams.length === 0) return;

  const { default: mermaid } = await import("/vendor/mermaid/mermaid.esm.min.mjs");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: '"iA Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    themeVariables: {
      background: "#ffffff",
      primaryColor: "#ffffff",
      primaryBorderColor: "#c3cad6",
      primaryTextColor: "#101828",
      secondaryColor: "#f4f6f9",
      tertiaryColor: "#f4f6f9",
      lineColor: "#c3cad6",
      textColor: "#101828",
      fontSize: "13px"
    }
  });
  for (const [index, container] of diagrams.entries()) {
    const blockElement = container.closest(".markdown-block");
    const block = JSON.parse(blockElement.dataset.block);
    try {
      const { svg } = await mermaid.render(`artifact-diagram-${index}`, block.source);
      container.innerHTML = svg;
      container.dataset.rendered = "true";
    } catch (error) {
      container.classList.add("mermaid-error");
      container.textContent = `Could not render this Mermaid diagram: ${error.message}`;
    }
  }
}

function renderHtml(htmlUrl) {
  elements["html-artifact"].hidden = false;
  elements["inspect-strip"].hidden = false;
  elements["html-artifact"].src = htmlUrl;
  elements["empty-state"].textContent = COPY.html.idle;
}

function captureMarkdownSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  const blockElement = selection?.anchorNode?.parentElement?.closest(".markdown-block");
  // An emptied selection never clears a pending anchor: clicking into the comment
  // field collapses the selection, and losing the anchor mid-sentence is worse.
  if (!text || !blockElement || !elements["markdown-artifact"].contains(blockElement)) return;

  const block = JSON.parse(blockElement.dataset.block);
  setPendingAnchor({
    type: "selection",
    section: block.section,
    startLine: block.startLine,
    endLine: block.endLine,
    quote: text.slice(0, 1000)
  });
}

// Vertical rhythm belongs to the block, not to the tag inside it: a heading block
// needs air above it, and every block is a single Markdown token.
function headingAttribute(block) {
  const level = block.html.trim().match(/^<h([1-6])/i)?.[1];
  return level ? ` data-heading="${level}"` : "";
}

function diagramLabel(element) {
  return (element.textContent || element.getAttribute("aria-label") || element.querySelector("title")?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function decodeAssetPath(source) {
  const prefix = "/assets/";
  return source.startsWith(prefix) ? decodeURIComponent(source.slice(prefix.length)) : source;
}

/* --------------------------------------------------------------- anchors */

function takeAnchor(anchor) {
  setPendingAnchor(anchor);
  elements["annotation-comment"].focus();
}

function setPendingAnchor(anchor) {
  state.pendingAnchor = anchor;
  renderPendingAnchor();
}

function renderPendingAnchor() {
  const anchor = state.pendingAnchor;
  elements["annotation-comment"].disabled = !anchor;
  elements["add-annotation"].disabled = !anchor;

  if (!anchor) {
    elements["anchor-card"].innerHTML = `<span>nothing selected</span>`;
    elements["annotation-comment"].placeholder = COPY[state.artifact?.kind || "markdown"].prompt;
    return;
  }
  elements["anchor-card"].innerHTML = `
    <span class="glyph glyph--${state.selectedIntent}"></span>
    <span>${escapeHtml(locatorFor(anchor))}</span>
    <span class="quote">${escapeHtml(anchor.quote || describeAnchor(anchor))}</span>`;
  elements["annotation-comment"].placeholder = "What should change, and why?";
}

function locatorFor(anchor) {
  if (anchor.startLine) {
    return anchor.endLine > anchor.startLine ? `L${anchor.startLine}–${anchor.endLine}` : `L${anchor.startLine}`;
  }
  return anchor.selector || describeAnchor(anchor);
}

function describeAnchor(anchor) {
  if (anchor.type === "diagram-element") return "Diagram element";
  if (anchor.type === "image") return "Image";
  return anchor.type === "element" ? anchor.tag?.toUpperCase() || "Element" : "Selection";
}

/* -------------------------------------------------------------- controls */

function bindControls() {
  elements["add-annotation"].addEventListener("click", addAnnotation);
  elements["overall-feedback"].addEventListener("input", (event) => {
    state.overallFeedback = event.target.value;
    saveDraft();
  });
  elements["submit-review"].addEventListener("click", submitAnnotations);
  elements["toggle-inspect"].addEventListener("click", toggleInspector);

  elements["intent-picker"].addEventListener("click", (event) => {
    const button = event.target.closest(".intent");
    if (!button) return;
    state.selectedIntent = button.dataset.intent;
    [...elements["intent-picker"].children].forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    renderPendingAnchor();
  });

  elements["annotation-comment"].addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      addAnnotation();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearComposer();
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && event.target !== elements["annotation-comment"]) {
      event.preventDefault();
      submitAnnotations();
    }
  });

  window.addEventListener("message", receiveInspectorMessage);
  bindAnnotationList();
}

function receiveInspectorMessage(event) {
  if (event.source !== elements["html-artifact"].contentWindow || event.data?.source !== "artifact-annotator") return;
  if (event.data.type === "ready") return postInspectorState();
  if (event.data.type === "anchor") takeAnchor(event.data.anchor);
}

function toggleInspector() {
  state.inspectActive = !state.inspectActive;
  elements["toggle-inspect"].textContent = state.inspectActive ? "Pause inspector" : "Resume inspector";
  elements["inspect-state"].textContent = state.inspectActive
    ? "Inspector on. Click anything in the app to annotate it."
    : "Inspector paused. The app takes your clicks.";
  elements.reader.classList.toggle("is-paused", !state.inspectActive);
  postInspectorState();
}

function postInspectorState() {
  elements["html-artifact"].contentWindow?.postMessage({
    source: "artifact-annotator-parent",
    type: "set-active",
    active: state.inspectActive
  }, "*");
}

/* ----------------------------------------------------------- annotations */

function addAnnotation() {
  const comment = elements["annotation-comment"].value.trim();
  if (!comment || !state.pendingAnchor) return elements["annotation-comment"].focus();

  state.annotations.push({
    id: crypto.randomUUID(),
    intent: state.selectedIntent,
    anchor: state.pendingAnchor,
    comment
  });
  clearComposer();
  renderAnnotations();
  saveDraft();
}

function clearComposer() {
  state.pendingAnchor = null;
  elements["annotation-comment"].value = "";
  renderPendingAnchor();
}

function renderAnnotations() {
  elements["submit-review"].textContent = submitLabel();
  elements["empty-state"].hidden = state.annotations.length > 0;
  elements["annotation-list"].innerHTML = state.annotations.map((annotation, index) => `
    <li class="entry" data-id="${annotation.id}">
      <div class="entry-head">
        <span class="index">${String(index + 1).padStart(2, "0")}</span>
        <span class="glyph glyph--${annotation.intent}"></span>
        <span class="intent">${INTENT_LABELS[annotation.intent] || annotation.intent}</span>
        <span class="locator" title="${escapeHtml(annotation.anchor.section || "")}">${escapeHtml(locatorFor(annotation.anchor))}</span>
        <button class="btn btn--quiet delete-annotation" aria-label="Remove note ${index + 1}">remove</button>
      </div>
      <div class="entry-quote">${escapeHtml(annotation.anchor.quote || describeAnchor(annotation.anchor))}</div>
      <p class="entry-comment">${escapeHtml(annotation.comment)}</p>
    </li>`).join("");

  paintMarks();
}

function bindAnnotationList() {
  elements["annotation-list"].addEventListener("click", (event) => {
    const remove = event.target.closest(".delete-annotation");
    if (!remove) return;
    const id = remove.closest(".entry").dataset.id;
    state.annotations = state.annotations.filter((annotation) => annotation.id !== id);
    renderAnnotations();
    saveDraft();
  });

  let hovered = null;
  elements["annotation-list"].addEventListener("mouseover", (event) => {
    const entry = event.target.closest(".entry");
    if (!entry || entry.dataset.id === hovered) return;
    hovered = entry.dataset.id;
    const annotation = state.annotations.find((item) => item.id === hovered);
    if (annotation) revealAnchor(annotation.anchor);
  });
  elements["annotation-list"].addEventListener("mouseleave", () => { hovered = null; });
}

// Hovering a note points at what it is attached to. Motion answers the person's action.
function revealAnchor(anchor) {
  if (state.artifact?.kind === "html") {
    return elements["html-artifact"].contentWindow?.postMessage({
      source: "artifact-annotator-parent",
      type: "reveal",
      selector: anchor.selector
    }, "*");
  }
  const block = elements["markdown-artifact"].querySelector(`.markdown-block[data-line="${anchor.startLine}"]`);
  if (!block) return;
  block.classList.remove("is-revealed");
  void block.offsetWidth;
  block.classList.add("is-revealed");
  block.scrollIntoView({ block: "nearest", behavior: "smooth" });
  block.addEventListener("animationend", () => block.classList.remove("is-revealed"), { once: true });
}

// Marks stay visible on the document itself, in the shape that carries their intent.
function paintMarks() {
  const root = elements["markdown-artifact"];
  if (!root || root.hidden) return;

  root.querySelectorAll(".mark").forEach((node) => node.replaceWith(...node.childNodes));
  root.querySelectorAll("[data-marked]").forEach((node) => node.removeAttribute("data-marked"));
  root.normalize();

  for (const annotation of state.annotations) {
    const block = root.querySelector(`.markdown-block[data-line="${annotation.anchor.startLine}"]`);
    if (!block) continue;
    if (annotation.anchor.type === "selection" && wrapQuote(block, annotation.anchor.quote, annotation.intent)) continue;
    block.dataset.marked = annotation.intent;
  }
}

function wrapQuote(block, quote, intent) {
  if (!quote) return false;
  const walker = document.createTreeWalker(block.querySelector(".block-content"), NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const index = node.nodeValue.indexOf(quote);
    if (index === -1) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + quote.length);
    const span = document.createElement("span");
    span.className = `mark mark--${intent}`;
    try {
      range.surroundContents(span);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ------------------------------------------------------------ submission */

function submitLabel() {
  const count = state.annotations.length;
  if (count === 0) return "Send with no notes";
  return `Send ${count} note${count === 1 ? "" : "s"} back`;
}

async function submitAnnotations() {
  if (elements["submit-review"].disabled) return;
  elements["submit-review"].disabled = true;
  elements["submit-review"].textContent = "Sending";
  try {
    await api("/api/submit", {
      method: "POST",
      body: JSON.stringify({ annotations: state.annotations, overallFeedback: state.overallFeedback })
    });
    localStorage.removeItem(draftKey());
    showSent();
  } catch (error) {
    elements["submit-review"].disabled = false;
    elements["submit-review"].textContent = submitLabel();
    elements["save-state"].textContent = `could not send: ${error.message}`;
  }
}

function showSent() {
  const count = state.annotations.length;
  const hasOverall = Boolean(state.overallFeedback.trim());
  elements["sent-marks"].innerHTML = state.annotations
    .slice(0, 16)
    .map((annotation) => `<span class="glyph glyph--${annotation.intent}"></span>`)
    .join("");
  elements["sent-detail"].textContent = count === 0
    ? `${hasOverall ? "Your instructions went" : "An empty review went"} back to the agent. Close this tab whenever you like.`
    : `${count} note${count === 1 ? "" : "s"}${hasOverall ? " and your overall instructions" : ""} went back to the agent, anchored to what you marked. Close this tab whenever you like.`;
  elements.submitted.hidden = false;
}

function showFatal(error) {
  document.body.innerHTML = `
    <main class="fatal">
      <h1>Could not open this artifact</h1>
      <p>The annotation session is still holding your terminal. Stop the CLI with Ctrl-C, then run it again.</p>
      <span class="fact">${escapeHtml(error.message)}</span>
    </main>`;
}

/* ----------------------------------------------------------------- state */

function startHeldClock() {
  const tick = () => {
    const seconds = Math.floor((Date.now() - state.openedAt) / 1000);
    elements["held-clock"].textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  tick();
  setInterval(tick, 1000);
}

function saveDraft() {
  const draft = { annotations: state.annotations, overallFeedback: state.overallFeedback };
  localStorage.setItem(draftKey(), JSON.stringify(draft));
  elements["save-state"].textContent = "saving";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await api("/api/draft", { method: "PUT", body: JSON.stringify(draft) });
      elements["save-state"].textContent = "draft saved";
    } catch {
      elements["save-state"].textContent = "saved in browser";
    }
  }, 250);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", "x-annotation-token": token, ...options.headers }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function draftKey() {
  return `artifact-annotator:${state.artifact.path}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
