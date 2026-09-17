---
name: annotate
description: Open a rendered Markdown or HTML artifact, attach feedback to exact locations, and return the submitted annotations to this session.
disable-model-invocation: true
argument-hint: "[file path or artifact description]"
allowed-tools: Bash, Read, Glob, Grep
---

# Annotate an artifact

This workflow is user-invoked. Begin only from the user's explicit invocation of `/annotate`.

## Resolve the artifact

Turn `$ARGUMENTS` into one concrete Markdown or HTML file.

- For a file path, use that file.
- For a description, use conversation context first, then search the named area.
- With no argument, choose the Markdown or HTML artifact most recently created or substantially edited in this session.
- When multiple files remain equally plausible, ask the user to choose.

State the selected path in one short sentence. The artifact is resolved when exactly one readable `.md`, `.markdown`, `.html`, or `.htm` file remains.

## Collect annotations

Run the following command through Bash with the longest timeout the harness supports:

```bash
artifact-annotator "<absolute-path>"
```

The command intentionally blocks while the user annotates in their browser. Wait for it to return. Do not replace it with a background process.

## Act on the bundle

Read the submitted annotations from stdout. If output was truncated, read the JSON file printed after `Bundle:`. Treat change annotations and overall instructions as requested edits; answer questions and account for notes. Apply the complete bundle unless the user asked only to collect feedback.
