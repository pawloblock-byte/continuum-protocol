import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  genRecoveryKey,
  unwrapContentKeyAsHeir,
  unwrapAsOwner,
  openBlob,
  gunzipBytes,
} from "../app/core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "app/index.html"), "utf8");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("the client boots, creates a Continuum, checkpoints and seals it for an heir", async () => {
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
    const click = (id) => $(id).dispatchEvent(new dom.window.MouseEvent("click"));

    assert.equal($("dashboard").classList.contains("hidden"), true);

    $("new-name").value = "ATLAS-01";
    click("btn-create");
    await wait(30);
    assert.equal($("c-name").textContent, "ATLAS-01");
    assert.ok($("c-anchor").textContent.length >= 32);
    assert.equal($("c-status").textContent, "LOCAL");

    $("cp-note").value = "first thought";
    $("cp-pass").value = "correct horse battery staple";
    click("btn-checkpoint");
    await wait(600);
    assert.equal($("c-cp").textContent, "1");
    assert.equal($("timeline").querySelectorAll("li").length, 2);

    const heir = await genRecoveryKey();
    $("inh-mode").value = "dormant";
    $("inh-heir").value = "11111111111111111111111111111111";
    $("inh-pub").value = heir.pub;
    click("btn-inherit");
    assert.match($("inh-out").textContent, /dormant/);

    $("cp-note").value = "sealed for my children";
    $("cp-pass").value = "correct horse battery staple";
    click("btn-checkpoint");
    await wait(600);
    assert.equal($("c-cp").textContent, "2");

    const vault = JSON.parse(dom.window.localStorage.getItem("continuum.v1"));
    assert.equal(vault.name, "ATLAS-01");
    assert.equal(vault.checkpoints, 2);
    assert.equal(vault.lastSnapshot.alg, "AES-GCM-256");
    assert.equal(vault.lastSnapshot.owner.alg, "PBKDF2-AES-GCM");
    assert.equal(vault.lastSnapshot.heir.alg, "ECDH-P256/AES-GCM");
    assert.ok(vault.heirPub);

    const ckHeir = await unwrapContentKeyAsHeir(heir.priv, vault.lastSnapshot.heir);
    const viaHeir = JSON.parse(
      new TextDecoder().decode(await gunzipBytes(await openBlob(ckHeir, vault.lastSnapshot)))
    );
    assert.equal(viaHeir.memory.at(-1).note, "sealed for my children");

    const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vault.anchor)));
    const ckOwner = await unwrapAsOwner("correct horse battery staple", salt, vault.lastSnapshot.owner);
    const viaOwner = JSON.parse(
      new TextDecoder().decode(await gunzipBytes(await openBlob(ckOwner, vault.lastSnapshot)))
    );
    assert.equal(viaOwner.memory.length, 2);
    assert.equal(viaOwner.anchor, vault.anchor);

    $("calc-n").value = "2";
    $("calc-y").value = "5";
    $("calc-legacy").checked = true;
    $("calc-n").dispatchEvent(new dom.window.Event("input"));
    assert.equal($("calc-total").textContent, "0.500 SOL");
  } finally {
    globalThis.setInterval = realSetInterval;
  }
});
