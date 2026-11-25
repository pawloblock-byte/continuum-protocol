import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "app/index.html"), "utf8");
const js = await readFile(join(root, "app/app.js"), "utf8");

test("html has no duplicate ids", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, []);
});

test("every element id used by app.js exists in index.html", () => {
  const used = [...js.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  const defined = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...new Set(used)].filter((id) => !defined.has(id));
  assert.deepEqual(missing, [], "missing ids: " + missing.join(", "));
});

test("local assets referenced by the page exist", () => {
  for (const rel of ["style.css", "app.js", "core.js"]) {
    assert.ok(existsSync(join(root, "app", rel)), "missing app/" + rel);
  }
  assert.match(html, /href="style\.css"/);
  assert.match(html, /src="app\.js"/);
});

test("internal navigation targets exist", () => {
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const defined = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...new Set(targets)].filter((t) => !defined.has(t));
  assert.deepEqual(missing, []);
});

test("treasury address appears consistently", () => {
  const treasury = "HfsGkUaCxKbgvhBfJfpr3oLrdbWTrYZnuR6x2HX5fhyS";
  assert.ok(html.includes(treasury));
  assert.ok(js.includes(treasury));
});

test("no external hard dependencies are loaded at page load", () => {
  assert.ok(!/<script[^>]+src="https?:/.test(html), "page must boot without third-party CDNs");
  assert.match(js, /import\(\s*"https:\/\/esm\.sh\/@solana\/web3\.js/, "web3 is lazily imported");
});

const recoverHtml = await readFile(join(root, "app/recover.html"), "utf8");
const recoverJs = await readFile(join(root, "app/recover.js"), "utf8");

test("recover page is wired and has no duplicate ids", () => {
  const ids = [...recoverHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, []);
  assert.ok(existsSync(join(root, "app/recover.js")));
  assert.match(recoverHtml, /src="recover\.js"/);
});

test("every element id used by recover.js exists in recover.html", () => {
  const used = [...recoverJs.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  const defined = new Set([...recoverHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...new Set(used)].filter((id) => !defined.has(id));
  assert.deepEqual(missing, [], "missing ids: " + missing.join(", "));
});

test("the main page links to the recovery page", () => {
  assert.match(html, /href="recover\.html"/);
});
