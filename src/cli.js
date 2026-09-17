import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import open from "open";
import { createAnnotationServer } from "./server.js";
import { formatAnnotations } from "./format.js";

const usage = `Usage: artifact-annotator <file.md|file.html> [--no-open]

Open a rendered artifact for annotation and wait until the annotations are submitted.

Options:
  --no-open  Print the URL without opening a browser
  --help     Show this help`;

export async function run(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const fileArg = args.find((arg) => !arg.startsWith("--"));
  if (!fileArg) throw new Error(`a Markdown or HTML file is required\n\n${usage}`);

  const filePath = resolve(fileArg);
  await access(filePath, constants.R_OK);

  const extension = extname(filePath).toLowerCase();
  if (![".md", ".markdown", ".html", ".htm"].includes(extension)) {
    throw new Error("supported files are .md, .markdown, .html, and .htm");
  }

  const content = await readFile(filePath, "utf8");
  const kind = extension === ".md" || extension === ".markdown" ? "markdown" : "html";
  const sessionId = randomUUID();
  const outputDirectory = resolve(tmpdir(), "artifact-annotator", sessionId);
  await mkdir(outputDirectory, { recursive: true });

  const relativeToWorkspace = relative(process.cwd(), filePath);
  const assetRoot = relativeToWorkspace && !relativeToWorkspace.startsWith("..")
    ? process.cwd()
    : dirname(filePath);
  const server = await createAnnotationServer({ filePath, content, kind, sessionId, assetRoot });
  const url = `${server.url}/?token=${server.token}`;

  console.error(`Annotating ${basename(filePath)}`);
  console.error(`Open ${url}`);
  console.error("Waiting for submitted annotations...");

  if (!args.includes("--no-open")) {
    await open(url, { wait: false });
  }

  const stop = async (signal) => {
    await server.close();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const result = await server.result;
  const bundlePath = resolve(outputDirectory, "annotations.json");
  await writeFile(bundlePath, `${JSON.stringify(result, null, 2)}\n`);
  await server.close();

  console.log(formatAnnotations(result, bundlePath));
}
