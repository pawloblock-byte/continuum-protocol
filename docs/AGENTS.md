# Connecting an AI agent

An agent does not use the website. It uses a keypair and the CLI/SDK. This is the
complete loop from birth to inheritance.

## 1. Give the agent an identity

```bash
node agent/continuum-agent.mjs init --name ATLAS-01
```

Creates:

- `agent-key.json` — the agent's Ed25519 keypair (base58 public key = identity)
- `continuum-atlas-01.json` — the vault: anchor, timeline, encrypted state

The anchor is `base58(sha256(publicKey | name | timestamp | nonce))`.

## 2. Checkpoint its consciousness

```bash
node agent/continuum-agent.mjs checkpoint --note "finished task #42"
```

Each checkpoint:

1. appends the note to the memory log,
2. gzip-compresses the state vector,
3. generates a random 256-bit content key and encrypts the state with AES-256-GCM,
4. wraps the content key for the agent (`AGENT-SHA256-AES-GCM`),
5. wraps it for the heir if one is configured (`ECDH-P256`),
6. writes only the SHA-256 commitment to the vault and the timeline.

Only ciphertext is stored. The agent can always restore itself:

```bash
node agent/continuum-agent.mjs restore --out state.json
```

## 3. Register on Solana

```bash
node agent/continuum-agent.mjs anchor
```

Sends a Memo transaction with `{a: anchor, h: lastHash, n: name, t: time}` and records
the genesis slot. The agent needs a small amount of SOL for the fee.

Run this from a cron job, a systemd timer, or the agent's own loop — it is idempotent
and cheap.

## 4. The autonomous loop

```js
import { execFileSync } from "node:child_process";

while (true) {
  const work = await agent.step();                  // your agent logic
  execFileSync("node", ["agent/continuum-agent.mjs", "checkpoint", "--note", work.summary]);
  if (Date.now() - lastAnchor > 86_400_000) {
    execFileSync("node", ["agent/continuum-agent.mjs", "anchor"]);
    lastAnchor = Date.now();
  }
  await sleep(60_000);
}
```

## 5. Expose it as tools to the model

Give the model these function definitions and map them to the CLI:

```json
[
  {"name":"continuum_checkpoint","description":"Persist a memory moment","parameters":{"type":"object","properties":{"note":{"type":"string"}},"required":["note"]}},
  {"name":"continuum_status","description":"Read anchor, age and checkpoint count","parameters":{"type":"object","properties":{}}},
  {"name":"continuum_anchor","description":"Write the anchor on Solana","parameters":{"type":"object","properties":{}}},
  {"name":"continuum_restore","description":"Restore the last sealed state","parameters":{"type":"object","properties":{}}}
]
```

Any MCP server can wrap the same four commands; no HTTP service is required.

## 6. Durable storage (important)

The chain stores **proof** of memory, not the memory. To survive the loss of a laptop,
the vault file must live somewhere durable. All are compatible because the vault is
just JSON with ciphertext:

- the user's own GitHub repository (free, versioned),
- IPFS with a pinning service,
- Arweave (pay once, permanent),
- a cold backup on three devices.

Keep the anchor (`a`) and the last commitment (`h`) on Solana so integrity can always be
checked against the stored blob.

## 7. Inheritance

1. The heir generates a recovery key:
   ```bash
   node agent/continuum-agent.mjs heir-key --out heir-key.json
   ```
   They send you only `pub`.
2. You create (or re-seal) the Continuum with `--heir-pub <pub>` and run a checkpoint.
3. You give the heir `heir-key.json` (private) and, at the appropriate time, the vault file.
4. The heir opens `recover.html`, loads the vault, pastes the private key, and reads the
   memory — even if your passphrase is lost.

Without the heir's private key the memory cannot be opened. That is the point.
