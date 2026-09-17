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

The command binds a temporary server to `127.0.0.1`, opens the artifact, and blocks until **Submit annotations** is pressed. It then saves the full JSON bundle under the operating system's temporary directory, prints its path and a readable Markdown version to stdout, and exits.

Markdown annotations carry their section, source line range, and selected text. HTML annotations carry a CSS selector, nearby heading, rendered text, element metadata, and viewport size. HTML artifacts run in a sandboxed iframe; pause the inspector to interact with the app normally.

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

## Security

The local server listens only on `127.0.0.1` and protects annotation APIs with a random session token. Markdown is sanitized before rendering. HTML files are treated as executable applications and run inside an iframe without same-origin access; only annotate HTML you are willing to run locally.

## License

MIT
