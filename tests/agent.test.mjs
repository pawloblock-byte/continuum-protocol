import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unwrapContentKeyAsHeir, openBlob, gunzipBytes } from "../app/core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "agent/continuum-agent.mjs");

function run(cwd, ...argv) {
  const out = execFileSync(process.execPath, [cli, ...argv], { cwd, encoding: "utf8" });
  return JSON.parse(out);
}

test("agent CLI: init, checkpoint, status and restore round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-agent-"));
  const init = run(dir, "init", "--name", "AGENT-X");
  assert.equal(init.ok, true);
  assert.ok(init.anchor.length >= 32);

  const cp = run(dir, "checkpoint", "--note", "I chose to persist");
  assert.equal(cp.checkpoints, 1);
  assert.equal(cp.heir, false);

  const status = run(dir, "status");
  assert.equal(status.name, "AGENT-X");
  assert.equal(status.checkpoints, 1);
  assert.equal(status.anchored, false);

  const restored = run(dir, "restore");
  assert.equal(restored.memory.length, 1);
  assert.equal(restored.memory[0].note, "I chose to persist");
  assert.equal(restored.anchor, init.anchor);
});

test("agent CLI: a continuum can be sealed for an heir and opened by the heir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-heir-"));
  const heir = run(dir, "heir-key", "--out", "heir-key.json");
  assert.ok(heir.pub);

  run(dir, "init", "--name", "LEGACY-01", "--heir-pub", heir.pub);
  const cp = run(dir, "checkpoint", "--note", "remember me");
  assert.equal(cp.heir, true);

  const continuum = JSON.parse(await readFile(join(dir, "continuum-legacy-01.json"), "utf8"));
  const keyFile = JSON.parse(await readFile(join(dir, "heir-key.json"), "utf8"));
  assert.equal(continuum.lastSnapshot.heir.alg, "ECDH-P256/AES-GCM");

  const ck = await unwrapContentKeyAsHeir(keyFile.priv, continuum.lastSnapshot.heir);
  const payload = JSON.parse(
    new TextDecoder().decode(await gunzipBytes(await openBlob(ck, continuum.lastSnapshot)))
  );
  assert.equal(payload.name, "LEGACY-01");
  assert.equal(payload.memory.at(-1).note, "remember me");
});
