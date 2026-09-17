const token = new URLSearchParams(location.search).get("token");
if (!token) throw new Error("Missing annotation session token");

const state = {
  artifact: null,
  annotations: [],
  overallFeedback: "",
  pendingAnchor: null,
  selectedIntent: "change",
  inspectActive: true,
  saveTimer: null
};

const elements = Object.fromEntries([
  "artifact-name", "save-state", "toggle-inspect", "submit-review", "selection-bar",
  "selection-preview", "annotate-selection", "markdown-artifact", "html-shell",
  "html-artifact", "annotation-count", "overall-feedback", "composer", "close-composer",
  "anchor-card", "annotation-comment", "add-annotation", "empty-state", "annotation-list", "submitted"
].map((id) => [id, document.getElementById(id)]));

init().catch((error) => {
  document.body.innerHTML = `<main class="fatal"><h1>Could not open artifact</h1><p>${escapeHtml(error.message)}</p></main>`;
});

async function init() {
  const response = await api("/api/artifact");
  state.artifact = response.artifact;
  elements["artifact-name"].textContent = response.artifact.path;

  const saved = localStorage.getItem(draftKey());
  if (saved) {
    const draft = JSON.parse(saved);
    state.annotations = Array.isArray(draft.annotations) ? draft.annotations : [];
    state.overallFeedback = draft.overallFeedback || "";
    elements["overall-feedback"].value = state.overallFeedback;
  }

  if (response.artifact.kind === "markdown") renderMarkdown(response.blocks);
  else renderHtml(response.htmlUrl);
  bindControls();
  renderAnnotations();
}

function renderMarkdown(blocks) {
  elements["markdown-artifact"].hidden = false;
  elements["markdown-artifact"].innerHTML = blocks.map((block) => `
    <section class="markdown-block" data-block='${escapeAttribute(JSON.stringify(block))}'>
      <button class="block-annotate" title="Annotate this block" aria-label="Annotate lines ${block.startLine} to ${block.endLine}">+</button>
      <div class="block-content">${block.html}</div>
    </section>`).join("");

  elements["markdown-artifact"].addEventListener("click", (event) => {
    const button = event.target.closest(".block-annotate");
    if (!button) return;
    const block = JSON.parse(button.closest(".markdown-block").dataset.block);
    openComposer({
      type: "block",
      section: block.section,
      startLine: block.startLine,
      endLine: block.endLine,
      quote: block.text.slice(0, 500)
    });
  });

  document.addEventListener("selectionchange", captureMarkdownSelection);
}

function captureMarkdownSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  const blockElement = selection?.anchorNode?.parentElement?.closest(".markdown-block");
  if (!text || !blockElement || !elements["markdown-artifact"].contains(blockElement)) {
    elements["selection-bar"].hidden = true;
    return;
  }

  const block = JSON.parse(blockElement.dataset.block);
  state.pendingAnchor = {
    type: "selection",
    section: block.section,
    startLine: block.startLine,
    endLine: block.endLine,
    quote: text.slice(0, 1000)
  };
  elements["selection-preview"].textContent = `“${text.slice(0, 80)}${text.length > 80 ? "…" : ""}”`;
  elements["selection-bar"].hidden = false;
}

function renderHtml(htmlUrl) {
  elements["html-shell"].hidden = false;
  elements["toggle-inspect"].hidden = false;
  elements["html-artifact"].src = htmlUrl;
}

function bindControls() {
  elements["annotate-selection"].addEventListener("click", () => openComposer(state.pendingAnchor));
  elements["close-composer"].addEventListener("click", closeComposer);
  elements["add-annotation"].addEventListener("click", addAnnotation);
  elements["overall-feedback"].addEventListener("input", (event) => {
    state.overallFeedback = event.target.value;
    saveDraft();
  });
  elements["submit-review"].addEventListener("click", submitAnnotations);
  elements["toggle-inspect"].addEventListener("click", toggleInspector);
  document.querySelectorAll(".intent").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedIntent = button.dataset.intent;
      document.querySelectorAll(".intent").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  window.addEventListener("message", receiveInspectorMessage);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!elements.composer.hidden) addAnnotation();
      else submitAnnotations();
    }
    if (event.key === "Escape" && !elements.composer.hidden) closeComposer();
  });
}

function receiveInspectorMessage(event) {
  if (event.source !== elements["html-artifact"].contentWindow || event.data?.source !== "artifact-annotator") return;
  if (event.data.type === "ready") {
    postInspectorState();
    return;
  }
  if (event.data.type === "anchor") openComposer(event.data.anchor);
}

function toggleInspector() {
  state.inspectActive = !state.inspectActive;
  elements["toggle-inspect"].textContent = state.inspectActive ? "Pause inspector" : "Resume inspector";
  elements["html-shell"].classList.toggle("paused", !state.inspectActive);
  postInspectorState();
}

function postInspectorState() {
  elements["html-artifact"].contentWindow?.postMessage({
    source: "artifact-annotator-parent",
    type: "set-active",
    active: state.inspectActive
  }, "*");
}

function openComposer(anchor) {
  if (!anchor) return;
  state.pendingAnchor = anchor;
  elements["selection-bar"].hidden = true;
  elements.composer.hidden = false;
  elements["anchor-card"].innerHTML = `
    <span>${escapeHtml(anchor.section || describeAnchor(anchor))}</span>
    <strong>${escapeHtml(anchor.quote || anchor.selector || "Selected element")}</strong>
    ${anchor.startLine ? `<small>Lines ${anchor.startLine}${anchor.endLine > anchor.startLine ? `–${anchor.endLine}` : ""}</small>` : ""}`;
  elements["annotation-comment"].value = "";
  elements["annotation-comment"].focus();
}

function closeComposer() {
  state.pendingAnchor = null;
  elements.composer.hidden = true;
}

function addAnnotation() {
  const comment = elements["annotation-comment"].value.trim();
  if (!comment || !state.pendingAnchor) {
    elements["annotation-comment"].focus();
    return;
  }
  state.annotations.push({
    id: crypto.randomUUID(),
    intent: state.selectedIntent,
    anchor: state.pendingAnchor,
    comment
  });
  closeComposer();
  renderAnnotations();
  saveDraft();
}

function renderAnnotations() {
  elements["annotation-count"].textContent = state.annotations.length;
  elements["empty-state"].hidden = state.annotations.length > 0;
  elements["annotation-list"].innerHTML = state.annotations.map((annotation, index) => `
    <li class="annotation-item" data-id="${annotation.id}">
      <div class="annotation-meta">
        <span class="intent-label ${annotation.intent}">${annotation.intent}</span>
        <span>#${index + 1}</span>
        <button class="delete-annotation" aria-label="Delete annotation">Delete</button>
      </div>
      <strong>${escapeHtml(annotation.anchor.section || describeAnchor(annotation.anchor))}</strong>
      <blockquote>${escapeHtml(annotation.anchor.quote || annotation.anchor.selector || "Selected element")}</blockquote>
      <p>${escapeHtml(annotation.comment)}</p>
    </li>`).join("");

  document.querySelectorAll(".delete-annotation").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest(".annotation-item").dataset.id;
      state.annotations = state.annotations.filter((annotation) => annotation.id !== id);
      renderAnnotations();
      saveDraft();
    });
  });
}

function describeAnchor(anchor) {
  return anchor.type === "element" ? anchor.tag?.toUpperCase() || "Element" : "Selection";
}

function saveDraft() {
  const draft = { annotations: state.annotations, overallFeedback: state.overallFeedback };
  localStorage.setItem(draftKey(), JSON.stringify(draft));
  elements["save-state"].textContent = "Saving...";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await api("/api/draft", { method: "PUT", body: JSON.stringify(draft) });
      elements["save-state"].textContent = "Draft saved";
    } catch {
      elements["save-state"].textContent = "Saved in browser";
    }
  }, 250);
}

async function submitAnnotations() {
  elements["submit-review"].disabled = true;
  elements["submit-review"].textContent = "Submitting...";
  try {
    await api("/api/submit", {
      method: "POST",
      body: JSON.stringify({ annotations: state.annotations, overallFeedback: state.overallFeedback })
    });
    localStorage.removeItem(draftKey());
    elements.submitted.hidden = false;
  } catch (error) {
    elements["submit-review"].disabled = false;
    elements["submit-review"].textContent = "Submit annotations";
    alert(`Could not submit: ${error.message}`);
  }
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
