import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const browser = await chromium.launch({ headless: true });

try {
  await testMarkdown(browser);
  await testHtml(browser);
  console.log("Browser workflows passed");
} finally {
  await browser.close();
}

async function testMarkdown(browser) {
  const session = startCli("examples/sample.md");
  const url = await session.url;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await page.waitForTimeout(500);
  if (await page.locator(".markdown-block").count() === 0) {
    throw new Error(`Markdown did not render: ${await page.locator("body").innerText()}`);
  }

  await page.locator(".markdown-block").nth(1).evaluate((block) => {
    const range = document.createRange();
    range.selectNodeContents(block.querySelector(".block-content"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.locator("#annotate-selection").click();
  await page.locator("#annotation-comment").fill("Make this opening more concrete.");
  await page.locator("#add-annotation").click();
  await page.locator("#overall-feedback").fill("Keep the report concise.");
  await page.screenshot({ path: resolve(root, "test-results/markdown.png"), fullPage: true });
  await page.locator("#submit-review").click();
  await page.locator("#submitted:not([hidden])").waitFor();

  const result = await session.done;
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Make this opening more concrete/);
  assert.match(result.stdout, /Keep the report concise/);
  const bundlePath = result.stdout.match(/^Bundle: (.+)$/m)?.[1];
  assert.ok(bundlePath);
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  assert.equal(bundle.annotations.length, 1);
  assert.equal(bundle.annotations[0].anchor.type, "selection");
  assert.equal(bundle.annotations[0].anchor.startLine, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".sidebar").waitFor();
  await page.close();
}

async function testHtml(browser) {
  const session = startCli("examples/sample.html");
  const url = await session.url;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  const frame = page.frameLocator("#html-artifact");
  await frame.locator("article").first().click();
  await page.locator("#composer:not([hidden])").waitFor();
  await page.locator("#annotation-comment").fill("Emphasize this metric.");
  await page.locator("#add-annotation").click();
  await page.screenshot({ path: resolve(root, "test-results/html.png"), fullPage: true });
  await page.locator("#submit-review").click();

  const result = await session.done;
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Emphasize this metric/);
  assert.match(result.stdout, /Element: .*article/);
  await page.close();
}

function startCli(relativeArtifactPath) {
  const child = spawn(process.execPath, ["bin/artifact-annotator.js", relativeArtifactPath, "--no-open"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let resolveUrl;
  let rejectUrl;
  const url = new Promise((resolvePromise, rejectPromise) => {
    resolveUrl = resolvePromise;
    rejectUrl = rejectPromise;
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    const match = stderr.match(/Open (http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+)/);
    if (match) resolveUrl(match[1]);
  });
  child.once("error", rejectUrl);
  const done = new Promise((resolvePromise) => {
    child.once("exit", (code) => resolvePromise({ code, stdout, stderr }));
  });
  return { url, done };
}
