#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fromB64 } from "../app/core.js";

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const DAY = 86_400_000;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      out[k] = next && !next.startsWith("--") ? argv[++i] : true;
    } else out._.push(a);
  }
  return out;
}

async function loadContinuum(path) {
  const c = JSON.parse(await readFile(path, "utf8"));
  if (!c.anchor || !c.name) throw new Error("not a continuum file");
  return c;
}

function lastActivity(c) {
  const times = [c.createdAt, ...(c.events || []).map((e) => e.t)].filter((n) => typeof n === "number");
  return Math.max(...times);
}

function deadline(c, graceDays) {
  return lastActivity(c) + graceDays * DAY;
}

function covenantMode(c) {
  return c.covenant?.mode || "family";
}

async function cmdCheck(a) {
  const c = await loadContinuum(a.file || "continuum.json");
  const grace = Number(a["grace-days"] || 365);
  const due = Date.now() > deadline(c, grace);
  console.log(
    JSON.stringify(
      {
        name: c.name,
        anchor: c.anchor,
        mode: covenantMode(c),
        lastActivity: new Date(lastActivity(c)).toISOString(),
        deadline: new Date(deadline(c, grace)).toISOString(),
        graceDays: grace,
        due,
        activated: Boolean(c.covenant?.active),
        heir: c.covenant?.heir || null,
        heirSealed: Boolean(c.lastSnapshot?.heir),
      },
      null,
      2
    )
  );
  process.exitCode = due ? 2 : 0;
}

async function cmdActivate(a) {
  const filePath = a.file || "continuum.json";
  const c = await loadContinuum(filePath);
  const grace = Number(a["grace-days"] || 365);
  if (c.covenant?.active && !a.force) {
    console.log(JSON.stringify({ ok: true, already: true, mode: covenantMode(c) }, null, 2));
    return;
  }
  if (!a.force && Date.now() <= deadline(c, grace)) {
    throw new Error("grace period has not elapsed; use --force to activate now");
  }
  const mode = covenantMode(c);
  const now = Date.now();
  c.covenant = { ...(c.covenant || {}), mode, active: true, activatedAt: now };
  c.events.push({
    t: now,
    type: "activate",
    note: "Keeper executed the covenant after " + grace + " days of silence → " + mode,
    hash: null,
  });

  let sig = null;
  if (!a["dry-run"]) {
    if (!a.key) throw new Error("--key keeper-key.json is required to publish activation on-chain");
    const keyFile = JSON.parse(await readFile(a.key, "utf8"));
    const keypair = Keypair.fromSecretKey(fromB64(keyFile.secret));
    const connection = new Connection(a.rpc || "https://api.devnet.solana.com", "confirmed");
    const memo = JSON.stringify({
      p: "continuum",
      e: "activate",
      a: c.anchor,
      mode,
      t: now,
    });
    const ix = new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: new PublicKey(MEMO_PROGRAM_ID),
      data: Buffer.from(memo),
    });
    const tx = new Transaction().add(ix);
    sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
    c.events[c.events.length - 1].hash = sig;
  }

  await writeFile(filePath, JSON.stringify(c, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        activatedAt: new Date(now).toISOString(),
        sig,
        explorer: sig ? "https://explorer.solana.com/tx/" + sig + "?cluster=devnet" : null,
        dryRun: Boolean(a["dry-run"]),
      },
      null,
      2
    )
  );
}

const HELP = `Continuum keeper — dead-man switch and covenant executor

  node agent/continuum-keeper.mjs check --file continuum.json [--grace-days 365]
  node agent/continuum-keeper.mjs activate --file continuum.json --key keeper-key.json [--grace-days 365] [--rpc URL] [--dry-run] [--force]

Exit code 2 from "check" means the grace period has elapsed and activation is due.
Run it from cron:  0 3 * * *  node agent/continuum-keeper.mjs check --file continuum.json
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (cmd === "check") return cmdCheck(a);
  if (cmd === "activate") return cmdActivate(a);
  console.log(HELP);
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  console.error("error: " + (e?.message || e));
  process.exit(1);
});
