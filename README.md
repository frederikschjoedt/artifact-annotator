# Artifact Annotator

Artifact Annotator opens a Markdown document or standalone HTML app in a local browser UI, lets you attach feedback to rendered content, and returns one structured annotation bundle to the calling coding agent.

It is designed for a simple agent loop:

```text
agent runs CLI → browser opens → user annotates → CLI prints feedback → agent continues
```

## Install

Requires Node.js 20 or newer.

```bash
npm install
npm link
```

## Use

```bash
artifact-annotator path/to/report.md
artifact-annotator path/to/app.html
```

The command binds a temporary server to `127.0.0.1`, opens the artifact, and blocks until **Send notes back** is pressed. It then saves the full JSON bundle under the operating system's temporary directory, prints its path and a readable Markdown version to stdout, and exits.

Markdown annotations carry their section, source line range, and selected text. Mermaid fences render as diagrams and support whole-block or individual diagram-element annotations. Relative Markdown images, including SVG files, are served from the current workspace and can be annotated as image blocks.

The artifact renders on the left and the review you are assembling renders on the right, in the order the agent will read it. Select a passage or click an element to anchor a note, tag it as a change, a question, or a note, and add it with `Cmd`/`Ctrl` + `Enter`. Anchored passages stay marked in the document; hovering a note points back at what it is attached to.

HTML annotations carry a CSS selector, nearby heading, rendered text, element metadata, and viewport size. Inline SVG clicks also capture the nearest named SVG group, visible label, and coordinates. HTML artifacts run in a sandboxed iframe; pause the inspector to interact with the app normally.

Use `--no-open` when the browser should not launch automatically.

## Agent skill

The canonical user-invoked skill is in [`skills/annotate/SKILL.md`](skills/annotate/SKILL.md). Link or copy that directory into the skills directory used by your coding-agent harness.

The skill deliberately sets `disable-model-invocation: true`. An agent should only enter this workflow after an explicit `/annotate` invocation.

## Development

```bash
npm test
artifact-annotator examples/sample.md
artifact-annotator examples/sample.html
```

## Interface

The browser interface is build-free and fully local. It is set in iA Writer Quattro and iA Writer Mono, vendored under `public/fonts/`, so the UI renders identically with no network access.

## Security

The local server listens only on `127.0.0.1` and protects annotation APIs with a random session token. Markdown is sanitized before rendering. HTML files are treated as executable applications and run inside an iframe without same-origin access; only annotate HTML you are willing to run locally.

## License

MIT
