import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, normalize, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "./markdown.js";

const publicDirectory = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export async function createAnnotationServer({ filePath, content, kind, sessionId }) {
  const token = randomBytes(24).toString("hex");
  let settleResult;
  let settled = false;
  const result = new Promise((resolveResult) => {
    settleResult = resolveResult;
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");

      if (url.pathname === "/" && request.method === "GET") {
        return sendFile(response, resolve(publicDirectory, "index.html"));
      }
      if (url.pathname.startsWith("/static/") && request.method === "GET") {
        return sendPublicFile(response, url.pathname.slice("/static/".length));
      }
      if (url.pathname === "/api/artifact" && request.method === "GET") {
        requireToken(request, url, token);
        return sendJson(response, {
          sessionId,
          artifact: { path: filePath, name: filePath.split(sep).at(-1), kind },
          blocks: kind === "markdown" ? renderMarkdown(content) : undefined,
          htmlUrl: kind === "html" ? "/content/index.html" : undefined
        });
      }
      if (url.pathname === "/api/draft" && request.method === "PUT") {
        requireToken(request, url, token);
        await readJson(request);
        return sendJson(response, { saved: true });
      }
      if (url.pathname === "/api/submit" && request.method === "POST") {
        requireToken(request, url, token);
        const submission = await readJson(request);
        if (!settled) {
          settled = true;
          settleResult({
            version: 1,
            sessionId,
            submittedAt: new Date().toISOString(),
            artifact: { path: filePath, kind },
            overallFeedback: String(submission.overallFeedback || "").trim(),
            annotations: Array.isArray(submission.annotations) ? submission.annotations : []
          });
        }
        return sendJson(response, { submitted: true });
      }
      if (kind === "html" && url.pathname.startsWith("/content/") && request.method === "GET") {
        return serveHtmlArtifact(response, url.pathname, filePath, content);
      }

      response.writeHead(404).end("Not found");
    } catch (error) {
      response.writeHead(error.statusCode || 500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.statusCode ? error.message : "Internal server error");
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();

  return {
    token,
    url: `http://127.0.0.1:${address.port}`,
    result,
    close: () => new Promise((resolveClose) => {
      if (!server.listening) return resolveClose();
      server.close(resolveClose);
    })
  };
}

async function sendPublicFile(response, requestedPath) {
  const filePath = resolve(publicDirectory, normalize(requestedPath));
  if (!filePath.startsWith(`${publicDirectory}${sep}`)) return response.writeHead(403).end("Forbidden");
  return sendFile(response, filePath);
}

async function sendFile(response, filePath) {
  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

async function serveHtmlArtifact(response, pathname, entryPath, entryContent) {
  const root = dirname(entryPath);
  const relativePath = decodeURIComponent(pathname.slice("/content/".length));
  const filePath = relativePath === "index.html" ? entryPath : resolve(root, normalize(relativePath));
  if (filePath !== entryPath && !filePath.startsWith(`${root}${sep}`)) {
    return response.writeHead(403).end("Forbidden");
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return response.writeHead(404).end("Not found");
  const raw = filePath === entryPath ? entryContent : await readFile(filePath);
  const isHtml = [".html", ".htm"].includes(extname(filePath).toLowerCase());
  const body = isHtml ? injectInspector(raw.toString()) : raw;

  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || (isHtml ? "text/html; charset=utf-8" : "application/octet-stream"),
    "cache-control": "no-store"
  });
  response.end(body);
}

function injectInspector(html) {
  const script = `<script src="/static/inspector.js"></script>`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${script}</body>`) : `${html}${script}`;
}

function requireToken(request, url, token) {
  const provided = request.headers["x-annotation-token"] || url.searchParams.get("token");
  if (provided !== token) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) {
      const error = new Error("Request too large");
      error.statusCode = 413;
      throw error;
    }
  }
  return JSON.parse(body || "{}");
}

function sendJson(response, value) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}
