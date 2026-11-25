import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../agent/continuum-agent.mjs");
const keeper = join(here, "../agent/continuum-keeper.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

function run(script, argv) {
  try {
    return JSON.parse(execFileSync(process.execPath, [script, ...argv], { encoding: "utf8" }));
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message) };
  }
}

async function step() {
  return { summary: "observed the world at " + new Date().toISOString() };
}

async function main() {
  let lastAnchor = 0;
  let lastKeeperCheck = 0;

  for (;;) {
    const work = await step();

    const cp = run(cli, ["checkpoint", "--note", work.summary]);
    console.log("checkpoint:", cp.checkpoints, cp.commitment?.slice(0, 12));

    if (Date.now() - lastAnchor > DAY) {
      const a = run(cli, ["anchor"]);
      console.log("anchor:", a.sig || a.error);
      lastAnchor = Date.now();
    }

    if (Date.now() - lastKeeperCheck > DAY) {
      const k = run(keeper, ["check", "--file", "continuum.json", "--grace-days", "365"]);
      console.log("keeper:", k.due ? "activation due" : "alive", k.error || "");
      lastKeeperCheck = Date.now();
    }

    await sleep(60_000);
  }
}

main();
