import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "app/index.html"), "utf8");

test("the client boots, creates a Continuum and checkpoints it", async () => {
  const dom = new JSDOM(html, { url: "https://continuum.local/", runScripts: "outside-only" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  globalThis.confirm = () => true;
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0;

  try {
    await import(pathToFileURL(join(root, "app/app.js")).href);
    const $ = (id) => dom.window.document.getElementById(id);

    assert.equal($("dashboard").classList.contains("hidden"), true);
    assert.equal($("create").classList.contains("hidden"), false);

    $("new-name").value = "ATLAS-01";
    $("btn-create").dispatchEvent(new dom.window.MouseEvent("click"));
    await new Promise((r) => setTimeout(r, 30));

    assert.equal($("create").classList.contains("hidden"), true);
    assert.equal($("dashboard").classList.contains("hidden"), false);
    assert.equal($("c-name").textContent, "ATLAS-01");
    assert.ok($("c-anchor").textContent.length >= 32);
    assert.equal($("c-status").textContent, "LOCAL");

    $("cp-note").value = "first thought";
    $("cp-pass").value = "correct horse battery staple";
    $("btn-checkpoint").dispatchEvent(new dom.window.MouseEvent("click"));
    await new Promise((r) => setTimeout(r, 600));

    assert.equal($("c-cp").textContent, "1");
    const items = $("timeline").querySelectorAll("li");
    assert.equal(items.length, 2);

    $("inh-mode").value = "dormant";
    $("inh-heir").value = "11111111111111111111111111111111";
    $("btn-inherit").dispatchEvent(new dom.window.MouseEvent("click"));
    assert.match($("inh-out").textContent, /dormant/);

    const stored = JSON.parse(dom.window.localStorage.getItem("continuum.v1"));
    assert.equal(stored.name, "ATLAS-01");
    assert.equal(stored.checkpoints, 1);
    assert.equal(stored.lastSnapshot.alg, "AES-GCM-256/PBKDF2");
    assert.ok(stored.events.length >= 3);

    $("calc-n").value = "2";
    $("calc-y").value = "5";
    $("calc-legacy").checked = true;
    $("calc-n").dispatchEvent(new dom.window.Event("input"));
    assert.equal($("calc-total").textContent, "0.500 SOL");
  } finally {
    globalThis.setInterval = realSetInterval;
  }
});
