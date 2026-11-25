#!/usr/bin/env node
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  b58,
  toB64,
  fromB64,
  sha256Hex,
  gzipBytes,
  gunzipBytes,
  sealBlob,
  openBlob,
  wrapForAgent,
  unwrapAsAgent,
  wrapContentKeyForHeir,
  genRecoveryKey,
} from "../app/core.js";

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
const enc = new TextEncoder();

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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadKey(path) {
  const k = await readJson(path);
  if (!k.secret) throw new Error("key file has no secret");
  return { meta: k, keypair: Keypair.fromSecretKey(fromB64(k.secret)) };
}

async function defaultFile(a) {
  if (a.file) return a.file;
  if (existsSync("continuum.json")) return "continuum.json";
  const files = (await readdir(".")).filter((f) => /^continuum.*\.json$/.test(f));
  if (files.length === 1) return files[0];
  return "continuum.json";
}

async function loadContinuum(path) {
  const c = await readJson(path);
  if (!c.anchor || !c.name) throw new Error("not a continuum file");
  return c;
}

function genesisEvent(name, anchor, owner) {
  return {
    t: Date.now(),
    type: "genesis",
    note: "Temporal anchor generated for " + name + " by " + owner.slice(0, 6) + "…",
    hash: anchor,
  };
}

async function cmdInit(a) {
  const name = a.name;
  if (!name) throw new Error("--name is required");
  const keyPath = a.key || "agent-key.json";
  const filePath = a.file || "continuum-" + String(name).toLowerCase().replace(/[^a-z0-9]/g, "-") + ".json";
  if (existsSync(keyPath)) throw new Error("key file already exists: " + keyPath);

  const kp = Keypair.generate();
  const secret = toB64(kp.secretKey);
  const pub = kp.publicKey.toBase58();
  const born = Date.now();
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const anchor = b58(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(pub + "|" + name + "|" + born + "|" + toB64(nonce))))
  );

  await writeFile(
    keyPath,
    JSON.stringify(
      { v: 1, type: "continuum-agent-key", publicKey: pub, secret, createdAt: born },
      null,
      2
    ) + "\n"
  );

  const continuum = {
    v: 1,
    id: crypto.randomUUID(),
    name,
    owner: pub,
    createdAt: born,
    anchor,
    genesis: { slot: null, sig: null, at: null },
    checkpoints: 0,
    lastHash: null,
    lastSnapshot: null,
    heirPub: a["heir-pub"] || null,
    memory: [],
    events: [genesisEvent(name, anchor, pub)],
  };
  await writeFile(filePath, JSON.stringify(continuum, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, continuum: filePath, key: keyPath, anchor, owner: pub }, null, 2));
}

async function cmdCheckpoint(a) {
  const filePath = await defaultFile(a);
  const keyPath = a.key || "agent-key.json";
  const note = a.note || "Autonomous checkpoint";
  const c = await loadContinuum(filePath);
  const { meta } = await loadKey(keyPath);

  const entry = { t: Date.now(), note, age: "agent" };
  c.memory.push(entry);
  if (c.memory.length > 1000) c.memory = c.memory.slice(-1000);

  const snapshot = {
    v: 2,
    anchor: c.anchor,
    owner: c.owner,
    name: c.name,
    ts: entry.t,
    memory: c.memory,
    heirPub: c.heirPub || null,
  };
  const compressed = await gzipBytes(enc.encode(JSON.stringify(snapshot)));
  const ck = crypto.getRandomValues(new Uint8Array(32));
  const blob = await sealBlob(ck, compressed);
  const agentWrap = await wrapForAgent(ck, meta.secret);
  const heirWrap = c.heirPub ? await wrapContentKeyForHeir(c.heirPub, ck) : null;
  const commitment = await sha256Hex(fromB64(blob.ct));

  c.checkpoints += 1;
  c.lastHash = commitment;
  c.lastSnapshot = { v: 2, alg: blob.alg, iv: blob.iv, ct: blob.ct, agent: agentWrap, heir: heirWrap };
  c.events.push({ t: entry.t, type: "checkpoint", note, hash: commitment });
  await writeFile(filePath, JSON.stringify(c, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, checkpoints: c.checkpoints, commitment, heir: Boolean(heirWrap) }, null, 2));
}

async function cmdAnchor(a) {
  const filePath = await defaultFile(a);
  const keyPath = a.key || "agent-key.json";
  const rpc = a.rpc || "https://api.devnet.solana.com";
  const c = await loadContinuum(filePath);
  const { keypair } = await loadKey(keyPath);

  const connection = new Connection(rpc, "confirmed");
  const memo = JSON.stringify({
    p: "continuum",
    v: 1,
    a: c.anchor,
    h: c.lastHash || c.anchor,
    n: c.name.slice(0, 24),
    t: Date.now(),
  });
  const ix = new TransactionInstruction({
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
    programId: new PublicKey(MEMO_PROGRAM_ID),
    data: Buffer.from(memo),
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
  const slot = await connection.getSlot("confirmed");

  c.genesis = { slot, sig, at: Date.now() };
  c.events.push({ t: Date.now(), type: "anchor", note: "Anchor written at slot " + slot, hash: sig });
  await writeFile(filePath, JSON.stringify(c, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        ok: true,
        sig,
        slot,
        explorer: "https://explorer.solana.com/tx/" + sig + "?cluster=devnet",
      },
      null,
      2
    )
  );
}

async function cmdRestore(a) {
  const filePath = await defaultFile(a);
  const keyPath = a.key || "agent-key.json";
  const c = await loadContinuum(filePath);
  const { meta } = await loadKey(keyPath);
  const snap = c.lastSnapshot;
  if (!snap || !snap.agent) throw new Error("no agent-sealed checkpoint in this continuum");
  const ck = await unwrapAsAgent(meta.secret, snap.agent);
  const payload = JSON.parse(new TextDecoder().decode(await gunzipBytes(await openBlob(ck, snap))));
  if (a.out) {
    await writeFile(a.out, JSON.stringify(payload, null, 2) + "\n");
    console.log(JSON.stringify({ ok: true, out: a.out, memories: payload.memory.length }, null, 2));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

async function cmdStatus(a) {
  const c = await loadContinuum(await defaultFile(a));
  console.log(
    JSON.stringify(
      {
        name: c.name,
        anchor: c.anchor,
        owner: c.owner,
        born: new Date(c.createdAt).toISOString(),
        checkpoints: c.checkpoints,
        anchored: Boolean(c.genesis && c.genesis.sig),
        genesisSlot: c.genesis?.slot ?? null,
        heirSealed: Boolean(c.lastSnapshot?.heir),
        lastHash: c.lastHash,
      },
      null,
      2
    )
  );
}

async function cmdKeygen(a) {
  const out = a.out || "agent-key.json";
  if (existsSync(out)) throw new Error("key file already exists: " + out);
  const kp = Keypair.generate();
  await writeFile(
    out,
    JSON.stringify(
      { v: 1, type: "continuum-key", publicKey: kp.publicKey.toBase58(), secret: toB64(kp.secretKey), createdAt: Date.now() },
      null,
      2
    ) + "\n"
  );
  console.log(JSON.stringify({ ok: true, out, publicKey: kp.publicKey.toBase58() }, null, 2));
}

async function cmdHeirKey(a) {
  const k = await genRecoveryKey();
  const payload = {
    v: 1,
    type: "continuum-heir-key",
    pub: k.pub,
    priv: k.priv,
    createdAt: Date.now(),
  };
  const out = a.out || "heir-key.json";
  await writeFile(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, out, pub: k.pub, note: "Give this file to your heir, offline." }, null, 2));
}

const HELP = `Continuum agent CLI

  node agent/continuum-agent.mjs init --name ATLAS-01 [--key agent-key.json] [--file continuum.json] [--heir-pub B64]
  node agent/continuum-agent.mjs checkpoint --note "..." [--file ...] [--key ...]
  node agent/continuum-agent.mjs anchor [--file ...] [--key ...] [--rpc URL]
  node agent/continuum-agent.mjs restore [--file ...] [--key ...] [--out state.json]
  node agent/continuum-agent.mjs status [--file ...]
  node agent/continuum-agent.mjs keygen [--out agent-key.json]
  node agent/continuum-agent.mjs heir-key [--out heir-key.json]
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const table = {
    init: cmdInit,
    checkpoint: cmdCheckpoint,
    anchor: cmdAnchor,
    restore: cmdRestore,
    status: cmdStatus,
    keygen: cmdKeygen,
    "heir-key": cmdHeirKey,
  };
  if (!cmd || cmd === "help" || !table[cmd]) {
    console.log(HELP);
    process.exit(cmd && cmd !== "help" ? 1 : 0);
  }
  await table[cmd](a);
}

main().catch((e) => {
  console.error("error: " + (e?.message || e));
  process.exit(1);
});
