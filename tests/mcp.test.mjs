import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentCli = join(root, "agent/continuum-agent.mjs");
const mcpCli = join(root, "agent/continuum-mcp.mjs");

function rpc(cwd, messages) {
  const r = spawnSync(process.execPath, [mcpCli], {
    cwd,
    encoding: "utf8",
    input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    env: { ...process.env, CONTINUUM_DIR: cwd },
  });
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test("MCP server exposes tools and answers status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-mcp-"));
  execFileSync(process.execPath, [agentCli, "init", "--name", "MCP-01"], { cwd: dir, encoding: "utf8" });

  const out = rpc(dir, [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "continuum_status", arguments: {} } },
  ]);

  const init = out.find((m) => m.id === 1);
  assert.equal(init.result.serverInfo.name, "continuum-protocol");

  const list = out.find((m) => m.id === 2);
  const names = list.result.tools.map((t) => t.name);
  for (const n of ["continuum_create", "continuum_checkpoint", "continuum_anchor", "continuum_restore", "continuum_status"]) {
    assert.ok(names.includes(n), "missing tool " + n);
  }

  const status = out.find((m) => m.id === 3);
  const payload = JSON.parse(status.result.content[0].text);
  assert.equal(payload.name, "MCP-01");
  assert.equal(payload.checkpoints, 0);
});

test("MCP server rejects unknown methods with a JSON-RPC error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "continuum-mcp-"));
  const out = rpc(dir, [{ jsonrpc: "2.0", id: 9, method: "does/not/exist" }]);
  assert.equal(out[0].error.code, -32601);
});
