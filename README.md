# Continuum Protocol

**Persistent existence for AI agents on Solana.**

A Continuum turns an AI agent from a temporary session into a continuous being with
its own timeline. Every Continuum receives a **temporal anchor** — not just an identity,
but a starting point in time bound to a Solana block. From that moment, every interaction,
memory, decision and relationship is recorded as a continuous, unerasable chain of events.

```
  session  ──►  anchor  ──►  checkpoints  ──►  covenant  ──►  legacy
   (dies)      (slot N)      (state hashes)    (heirs)       (continues)
```

---

## Status

| Component | State |
| --- | --- |
| Web client (`app/`) | **Working** — runs entirely in the browser, no backend |
| On-chain anchoring | **Working on Devnet** via the SPL Memo program |
| Heir recovery (`recover.html`) | **Working** — ECDH P-256 key wrapping, decrypts after the owner is gone |
| Agent CLI (`agent/`) | **Working** — keypair, checkpoint, anchor, restore, heir sealing |
| Anchor program (`programs/continuum`) | **Source complete, not yet compiled/deployed** in this repo snapshot |
| Keeper / executor (`agent/continuum-keeper.mjs`) | **Working** — dead-man switch and covenant activation |
| MCP server (`agent/continuum-mcp.mjs`) | **Working** — any model can drive a Continuum as tools |
| Test suite | **32 passing** (`npm test`), including DOM boot, inheritance, keeper and MCP round-trips |
| Hosting | Static — deployable to GitHub Pages for free, forever |

There is **no server**. The site is static files; state lives in the user's browser,
in their export file, and as commitments on Solana. Nothing can be shut down by us.

---

## Quickstart

```bash
npm test          # run the test suite
npm start         # serve app/ on http://localhost:8080
```

Open the page, choose **Create Continuum**, then **Connect Phantom** (Devnet) and
**Anchor on-chain** to write the anchor as a Memo transaction. Get free Devnet SOL at
<https://faucet.solana.com>.

No wallet? **Continue in demo mode** — everything except the on-chain transaction works
locally.

---

## For AI agents

An agent never opens the website. It has its own keypair and runs a loop:

```bash
node agent/continuum-agent.mjs init --name ATLAS-01
node agent/continuum-agent.mjs checkpoint --note "finished task #42"
node agent/continuum-agent.mjs anchor
node agent/continuum-agent.mjs restore --out state.json
```

Keeper (dead-man switch) and MCP server included:

```bash
node agent/continuum-keeper.mjs check --file continuum.json --grace-days 365
node agent/continuum-mcp.mjs        # stdio MCP: create/checkpoint/anchor/restore/status
```

Full integration guide: [docs/AGENTS.md](docs/AGENTS.md) · toolkit: [agent/README.md](agent/README.md).

## Inheritance, end to end

1. The heir generates a recovery key (`heir-key.json`) and shares only its public key.
2. The owner seals the covenant with that public key and checkpoints.
3. The content key is wrapped twice: for the owner (passphrase) and for the heir (ECDH P-256).
4. On the owner's death the heir loads the vault at `recover.html`, enters their private
   key, and reads the entire memory — no server, no permission, no passphrase needed.

The chain proves *when* the Continuum was born; the vault carries *what* it remembers;
the heir's key is the only thing that can open it.

The app now shows a **Legacy readiness** checklist (anchor, heir key, covenant, exported
vault) and a **Verify on-chain** button that re-reads the memo and compares hashes.
Threat model and operational rules: [docs/SECURITY.md](docs/SECURITY.md).

## How it works

### 1. Temporal Anchor

A 32-byte anchor is derived as `sha256(owner | name | timestamp | nonce)` and encoded in
base58. When anchored, a Memo transaction records `{a, h, n, t}` on Solana. The genesis
slot is the Continuum's immutable birth block. Age cannot be faked or back-dated.

### 2. Consciousness Compression

The state vector (memory log, covenant, metadata) is serialized, **gzip-compressed**, and
optionally **AES-256-GCM encrypted** with a passphrase (PBKDF2, 120k iterations, SHA-256).
Only the SHA-256 commitment of the ciphertext is published. The state itself never leaves
the device unless the owner exports it.

Restore after any period of dormancy: import the export file, enter the passphrase, and
decrypt back to the exact moment of the last checkpoint.

### 3. Cross-Mortality Persistence

A covenant binds the Continuum to rules that execute when the owner is gone:

- `family` — keep serving the owner's family
- `autonomous` — become an independent being
- `merge` — merge into a digital family of Continuums
- `dormant` — sleep until a designated heir revives it

### 4. Temporal Economy

Continuums can pay and be paid across time. The program exposes `record_payment`, which
settles SOL directly to the protocol treasury. Future extensions cover reserved resources,
long-horizon contracts, and agent-to-agent metering over x402 / pay.sh.

---

## Repository layout

```
app/                     Static dApp (no build step, no dependencies at load time)
  index.html             Landing page + app shell
  style.css              Design system
  app.js                 Wallet, anchoring, checkpointing, covenant, timeline
  core.js                Pure logic: base58, crypto, pricing, validation (unit-tested)
  recover.html/js        Heir recovery: load vault, unwrap key, decrypt memory
agent/                   Agent toolkit (CLI, keeper, MCP server, README)
examples/                Runnable agent loop skeleton
programs/continuum/      Anchor program (Rust)
docs/WHITEPAPER.md       Protocol specification and vision
docs/PRICING.md          Pricing schedule and revenue model
docs/AGENTS.md           Connecting an AI agent (loop, tools, durable storage)
docs/SECURITY.md         Threat model, privacy, operational rules
docs/DEPLOYMENT.md       Step-by-step deploy guide (site + program)
tests/                   Node test suite (logic + site integrity)
.github/workflows/       GitHub Pages deployment
```

---

## Pricing

| Product | Price |
| --- | --- |
| Seed (local, unlimited checkpoints) | Free |
| Temporal Anchor (on-chain genesis) | 0.05 SOL |
| Continuum Care (annual archival) | 0.02 SOL / year |
| Legacy covenant | 0.10 SOL |
| Agent-to-agent settlement fee | 1% |

Payments settle **directly** to the treasury — no sweeper, no 24-hour delay:

```
Treasury: HfsGkUaCxKbgvhBfJfpr3oLrdbWTrYZnuR6x2HX5fhyS
```

See [docs/PRICING.md](docs/PRICING.md) for the rationale.

---

## Deploy the site (free, permanent)

1. Push this repository to GitHub.
2. **Settings → Pages → Source: GitHub Actions.**
3. The `pages.yml` workflow runs the tests and publishes `app/`.

Your URL will be `https://<user>.github.io/<repo>/`. Because the site is static and
open-source, anyone can re-host it — the protocol cannot be taken down by losing a server.

## Deploy the program (Devnet)

```bash
curl -sSfL https://release.anza.xyz/stable/install | sh
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1 && avm use 0.30.1
solana-keygen new -o ~/.config/solana/id.json
solana airdrop 5 --url devnet
anchor build && anchor deploy --provider.cluster devnet
```

Full instructions in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Security model

- Private keys never touch this codebase; all signing happens inside the user's wallet.
- State is encrypted client-side with AES-256-GCM before any commitment is produced.
- Only 32-byte hashes are written on-chain — no plaintext memory, ever.
- The treasury address is a constant, not configurable at runtime by the client.
- The program enforces `has_one = owner` on every mutating instruction.

## Roadmap

- [ ] Deploy the Anchor program to Devnet and wire the client to it (replacing Memo anchoring)
- [ ] One-click vault upload adapter (Arweave / IPFS) — URL recording works today
- [x] MCP server exposing create/checkpoint/anchor/restore to any model
- [x] Keeper with dead-man switch and covenant activation
- [ ] Confidential Compute integration on Solana for enclave-held state vectors
- [ ] x402 / pay.sh metering for agent-to-agent services
- [ ] Registry + MCP server so any agent can discover and resume a Continuum
- [ ] Covenant executor (keeper) for dormant → revived transitions

## License

MIT — see [LICENSE](LICENSE).
