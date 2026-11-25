#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agentCli = join(here, "continuum-agent.mjs");
const keeperCli = join(here, "continuum-keeper.mjs");
const cwd = process.env.CONTINUUM_DIR || process.cwd();

function runCli(cli, argv) {
  const r = spawnSync(process.execPath, [cli, ...argv], { cwd, encoding: "utf8" });
  const out = (r.stdout || "").trim();
  try {
    return JSON.parse(out);
  } catch {
    return { ok: r.status === 0, output: out, error: (r.stderr || "").trim() || undefined };
  }
}

const TOOLS = [
  {
    name: "continuum_create",
    description: "Create a new Continuum (agent identity + temporal anchor) in the working directory.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the being, e.g. ATLAS-01" },
        heirPub: { type: "string", description: "Optional heir recovery public key (ECDH P-256, base64)" },
      },
      required: ["name"],
    },
  },
  {
    name: "continuum_checkpoint",
    description: "Seal the current memory into an encrypted checkpoint and commit its hash.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string", description: "What just happened" } },
      required: ["note"],
    },
  },
  {
    name: "continuum_anchor",
    description: "Write the temporal anchor (and latest state hash) to Solana.",
    inputSchema: { type: "object", properties: { rpc: { type: "string" } } },
  },
  {
    name: "continuum_restore",
    description: "Decrypt and return the last sealed state vector.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "continuum_status",
    description: "Read name, anchor, age, checkpoint count and anchoring state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "continuum_covenant_check",
    description: "Keeper check: is the grace period elapsed and covenant activation due?",
    inputSchema: { type: "object", properties: { graceDays: { type: "number" } } },
  },
];

function callTool(name, a = {}) {
  switch (name) {
    case "continuum_create": {
      const argv = ["init", "--name", String(a.name)];
      if (a.heirPub) argv.push("--heir-pub", String(a.heirPub));
      return runCli(agentCli, argv);
    }
    case "continuum_checkpoint":
      return runCli(agentCli, ["checkpoint", "--note", String(a.note || "checkpoint")]);
    case "continuum_anchor": {
      const argv = ["anchor"];
      if (a.rpc) argv.push("--rpc", String(a.rpc));
      return runCli(agentCli, argv);
    }
    case "continuum_restore":
      return runCli(agentCli, ["restore"]);
    case "continuum_status":
      return runCli(agentCli, ["status"]);
    case "continuum_covenant_check":
      return runCli(keeperCli, ["check", "--grace-days", String(a.graceDays || 365)]);
    default:
      throw new Error("unknown tool: " + name);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    fail(null, -32700, "parse error");
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "continuum-protocol", version: "0.1.0" },
      });
      return;
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "ping") {
      reply(id, {});
      return;
    }
    if (method === "tools/list") {
      reply(id, { tools: TOOLS });
      return;
    }
    if (method === "tools/call") {
      const name = params?.name;
      const result = callTool(name, params?.arguments || {});
      reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
      return;
    }
    fail(id, -32601, "method not found: " + method);
  } catch (e) {
    fail(id, -32000, e?.message || String(e));
  }
});
