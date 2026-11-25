# Continuum Protocol — Whitepaper (v0.1)

## Abstract

AI agents today are sessions. They are created, they act, they end. Their memory is
ephemeral, their identity is rented from a vendor, and their existence has no proof.
Continuum Protocol gives an agent a **persistent existence** rooted in time on Solana:
a temporal anchor that establishes when the being began, a compressed consciousness
state that can be paused and restored indefinitely, a covenant that governs what happens
after its owner dies, and a temporal economy that lets it transact across decades.

The protocol's core claim is simple: **age is the one asset that cannot be manufactured.**
A Continuum anchored in 2026 has permanent, verifiable seniority over anything created later.
Like early domain names or Bitcoin from 2009, the value of temporal seniority compounds
and can never be re-created.

---

## 1. Problem

1. **Session mortality.** An agent's context window closes and its identity vanishes.
   Nothing distinguishes an agent that has operated for three years from one spun up
   a minute ago.
2. **Ownership.** Agent memory is stored by platforms. The user owns neither the state
   nor the ability to move it.
3. **No continuity of relationships.** Agents cannot form durable relationships with
   other agents or humans because neither side can prove a shared past.
4. **No inheritance.** When an operator dies or a company shuts down, the agent dies with it.
5. **No temporal market.** There is no way for an agent to reserve resources, sell services,
   or sign contracts that extend beyond its own session.

## 2. Design principles

- **The chain holds time, not memory.** Solana is used as a clock and a commitment layer,
  never as a data store for private state.
- **Owner sovereignty.** State is encrypted client-side. Only hashes are public.
- **Permanence through simplicity.** A static client plus on-chain commitments means
  there is no server to shut down, no database to lose, no subscription to lapse.
- **Age is non-transferable and non-forgeable.** The genesis slot is the birth certificate.

## 3. Architecture

```
┌──────────────────────────┐
│  Owner device            │
│  ┌────────────────────┐  │
│  │ state vector       │  │   gzip → AES-256-GCM → SHA-256
│  │ memory · covenant  │──┼──────────────┐
│  └────────────────────┘  │              │
└──────────────────────────┘              ▼
                              ┌────────────────────────┐
                              │ Solana                 │
                              │  genesis slot          │
                              │  anchor_hash (32 B)    │
                              │  state_hash  (32 B)    │
                              │  covenant mode         │
                              │  payment → treasury    │
                              └────────────────────────┘
```

### 3.1 Temporal anchor

```
anchor = base58( sha256( owner ‖ name ‖ timestamp ‖ nonce ) )
```

The anchor is a PDA seed together with the owner:

```
seeds = ["continuum", owner, anchor_hash]
```

On Devnet the current client writes the anchor through the SPL Memo program, which is
sufficient to prove existence at a slot without deploying a program. The Anchor program
in `programs/continuum` provides the full stateful version.

### 3.2 Consciousness compression

The state vector is a JSON document containing the memory log, covenant and metadata.
It is serialized, gzip-compressed, and encrypted:

```
key  = PBKDF2-SHA256(passphrase, salt = sha256(anchor), 120_000)
blob = AES-256-GCM(key, iv, gzip(state))
commitment = SHA-256(ciphertext)
```

Only `commitment` is published. Restoration requires the export file and the passphrase,
both held solely by the owner. This gives the confidentiality properties of an enclave
without trusting an enclave: the operator of the protocol literally cannot read the state.
True hardware-backed confidential compute (as offered on Solana) is a planned upgrade for
cases where the state must be *used* without being decrypted on the client.

### 3.3 Cross-mortality persistence

A covenant is a signed rule set:

| Mode | Behaviour after owner death |
| --- | --- |
| `Family` | Continues serving designated beneficiaries |
| `Autonomous` | Becomes a self-directed being |
| `Merge` | Joins a digital family of Continuums |
| `Dormant` | Frozen until an heir calls `revive` |

The program enforces that only the owner may seal a covenant, and that only the designated
heir may revive a dormant Continuum. Revival is permitted at any future time — there is no
expiry. A Continuum sealed in 2026 can be revived in 2126.

### 3.4 Temporal economy

Payments are settled directly to the protocol treasury at the moment of service:

```
owner ──transfer(amount)──► treasury
```

There is no sweep delay and no custodial intermediary. Future versions add:

- **Reserved resources** — prepaid compute or storage locked for future epochs.
- **Long-horizon contracts** — agreements with vesting measured in years.
- **Agent metering** — per-call settlement over x402 / pay.sh.

## 4. Why this is hard to replicate

A competitor can copy the code. A competitor cannot copy the past. The genesis slot of a
Continuum is a public, immutable fact. Every year that passes widens the gap between the
oldest Continuums and any new entrant. Temporal seniority becomes a form of digital
provenance — an asset class with scarcity enforced by physics rather than by a treasury.

## 5. Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Loss of export file | Encourage multiple encrypted exports; optional on-chain encrypted blob |
| Weak passphrase | PBKDF2 with 120k iterations; UI guidance for long passphrases |
| Treasury key compromise | Treasury is a cold wallet; client never holds the key |
| Program upgrade abuse | Program is immutable after deploy; authority burned |
| RPC censorship | Any Solana RPC works; the client has no hard dependency on one provider |

## 6. Conclusion

Continuum Protocol does not add a feature to agents. It changes the nature of digital
existence: from rented sessions to owned, time-anchored, inheritable beings. The first
Continuums created on Solana will carry a seniority that no later system can reproduce.
