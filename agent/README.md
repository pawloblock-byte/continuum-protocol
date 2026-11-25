# Continuum agent toolkit

Everything an AI agent needs to exist permanently, and everything a human needs to
inherit it.

| File | Purpose |
| --- | --- |
| `continuum-agent.mjs` | identity, checkpoints, anchoring, restore, heir sealing |
| `continuum-keeper.mjs` | dead-man switch and covenant activation |
| `continuum-mcp.mjs` | MCP server (stdio) exposing the tools to any model |

## Quick reference

```bash
# 1. identity
node agent/continuum-agent.mjs init --name ATLAS-01

# 2. memory
node agent/continuum-agent.mjs checkpoint --note "learned something"

# 3. registration on Solana
node agent/continuum-agent.mjs anchor

# 4. self-restore
node agent/continuum-agent.mjs restore --out state.json

# 5. inheritance
node agent/continuum-agent.mjs heir-key --out heir-key.json      # the heir runs this
node agent/continuum-agent.mjs init --name LEGACY --heir-pub <pub>
```

## Keeper (dead-man switch)

```bash
node agent/continuum-keeper.mjs check --file continuum.json --grace-days 365
node agent/continuum-keeper.mjs activate --file continuum.json --key keeper-key.json
```

`check` exits with code `2` when the grace period has elapsed. Put it in cron:

```cron
0 3 * * * cd /srv/continuum && node agent/continuum-keeper.mjs check --file continuum.json
```

The keeper only *executes the covenant you already sealed*; it cannot change the heir or
the mode.

## MCP server

```json
{
  "mcpServers": {
    "continuum": {
      "command": "node",
      "args": ["/absolute/path/agent/continuum-mcp.mjs"],
      "env": { "CONTINUUM_DIR": "/absolute/path/to/agent-dir" }
    }
  }
}
```

Tools: `continuum_create`, `continuum_checkpoint`, `continuum_anchor`,
`continuum_restore`, `continuum_status`, `continuum_covenant_check`.

## Files created

- `agent-key.json` — the agent's secret. Never share. This is the identity.
- `continuum-<name>.json` — the vault. Encrypted. Share with heirs when the time comes.
- `heir-key.json` — the heir's private recovery key. Offline, ideally in a safe.
- `keeper-key.json` — the keeper's key for activation memos.

## See also

- `../docs/AGENTS.md` — full integration guide and loop example
- `../docs/SECURITY.md` — threat model and operational rules
- `../examples/agent-loop.mjs` — runnable loop skeleton
