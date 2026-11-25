import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentCli = join(root, "agent/continuum-agent.mjs");
const keeperCli = join(root, "agent/continuum-keeper.mjs");

function agent(cwd, ...argv) {
  return JSON.parse(execFileSync(process.execPath, [agentCli, ...argv], { cwd, encoding: "utf8" }));
}

async function agedContinuum(dir, days) {
  const init = agent(dir, "init", "--name", "OLD-ONE");
  const file = join(dir, "continuum-old-one.json");
  const c = JSON.parse(await readFile(file, "utf8"));
  const old = Date.now() - days * 86_400_000;
  c.createdAt = old;
  c.events.forEach((e) => (e.t = old));
  c.covenant = { mode: "autonomous", heir: null, sealedAt: old };
  await writeFile(file, JSON.stringify(c, null, 2));
  return { init, file };
}

test("keeper: reports due after the grace period and activates the covenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-keeper-"));
  const { file } = await agedContinuum(dir, 400);

  const check = spawnSync(process.execPath, [keeperCli, "check", "--file", file, "--grace-days", "365"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(check.status, 2);
  assert.equal(JSON.parse(check.stdout).due, true);

  const act = JSON.parse(
    execFileSync(process.execPath, [keeperCli, "activate", "--file", file, "--dry-run"], {
      cwd: dir,
      encoding: "utf8",
    })
  );
  assert.equal(act.ok, true);
  assert.equal(act.mode, "autonomous");
  assert.equal(act.dryRun, true);

  const after = JSON.parse(await readFile(file, "utf8"));
  assert.equal(after.covenant.active, true);
  assert.ok(after.events.some((e) => e.type === "activate"));
});

test("keeper: refuses to activate before the grace period", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-keeper-"));
  agent(dir, "init", "--name", "FRESH-ONE");
  const r = spawnSync(
    process.execPath,
    [keeperCli, "activate", "--file", join(dir, "continuum-fresh-one.json"), "--dry-run"],
    { cwd: dir, encoding: "utf8" }
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /grace period/);
});
