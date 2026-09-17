import test from "node:test";
import assert from "node:assert/strict";
import { createAnnotationServer } from "../src/server.js";

test("protects APIs and resolves the blocking result on submission", async (context) => {
  const server = await createAnnotationServer({
    filePath: "/tmp/report.md",
    content: "# Report",
    kind: "markdown",
    sessionId: "test-session"
  });
  context.after(() => server.close());

  const unauthorized = await fetch(`${server.url}/api/artifact`);
  assert.equal(unauthorized.status, 401);

  const artifact = await fetch(`${server.url}/api/artifact`, {
    headers: { "x-annotation-token": server.token }
  }).then((response) => response.json());
  assert.equal(artifact.artifact.kind, "markdown");

  await fetch(`${server.url}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-annotation-token": server.token },
    body: JSON.stringify({ overallFeedback: "Make it shorter.", annotations: [] })
  });
  const result = await server.result;
  assert.equal(result.overallFeedback, "Make it shorter.");
});

test("serves Markdown assets from the allowed root and blocks traversal", async (context) => {
  const server = await createAnnotationServer({
    filePath: new URL("../examples/sample.md", import.meta.url).pathname,
    content: "![Diagram](./workflow.svg)",
    kind: "markdown",
    sessionId: "asset-test",
    assetRoot: new URL("../", import.meta.url).pathname
  });
  context.after(() => server.close());

  const asset = await fetch(`${server.url}/assets/${encodeURIComponent("./workflow.svg")}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /image\/svg\+xml/);

  const traversal = await fetch(`${server.url}/assets/${encodeURIComponent("../../../../etc/passwd")}`);
  assert.equal(traversal.status, 403);
});
