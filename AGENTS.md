# Artifact Annotator

Artifact Annotator is a local, blocking CLI for collecting anchored feedback on rendered Markdown and HTML artifacts. The CLI opens a browser, waits for submission, prints readable annotations to stdout, and saves the complete JSON bundle in the operating system's temporary directory.

## Repository map

- `bin/artifact-annotator.js` - executable entry point.
- `src/cli.js` - CLI lifecycle and artifact resolution.
- `src/server.js` - token-protected localhost server and local asset serving.
- `src/markdown.js` - source-aware Markdown parsing and sanitization.
- `src/format.js` - annotation bundle formatting.
- `public/` - dependency-free browser interface and HTML/SVG inspector.
- `skills/annotate/SKILL.md` - canonical user-invoked agent skill.
- `examples/` - manual and browser-test fixtures.
- `tests/` - Node tests and Playwright end-to-end coverage.

## Constraints

- Keep the CLI blocking. It exits only after annotations are submitted or the process is interrupted.
- Keep the browser application build-free and served locally by the CLI.
- Bind servers to `127.0.0.1` and preserve session-token protection.
- Treat reviewed HTML as executable and keep it inside the sandboxed iframe.
- Sanitize rendered Markdown and constrain local asset access to the allowed workspace root.
- Preserve human-readable context in every anchor; selectors and generated element IDs are supporting metadata, not sufficient anchors by themselves.
- Keep `skills/annotate/SKILL.md` user-invoked with `disable-model-invocation: true`.

## Verification

Run before committing:

```bash
npm test
npm run test:e2e
npm audit
git diff --check
```

Use `examples/sample.md` and `examples/sample.html` when manually checking the complete annotation workflow. Browser tests write screenshots under ignored `test-results/`.
