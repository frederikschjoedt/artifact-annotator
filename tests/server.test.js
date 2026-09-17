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
