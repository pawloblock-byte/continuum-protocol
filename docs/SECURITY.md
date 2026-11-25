# Security, privacy and operations

This document is written for the person who intends to entrust generations of memory to
this system. Read it before sealing anything.

## 1. What is on-chain and what is not

| Data | Where it lives | Public? |
| --- | --- | --- |
| Temporal anchor (32 bytes) | Solana memo transaction | Yes |
| SHA-256 of the encrypted state | Solana memo transaction + vault | Yes |
| Vault URL (optional) | Solana memo transaction | Yes |
| Covenant mode / heir | Vault (and program account once deployed) | Only if you publish the vault |
| Memory, notes, decisions | Encrypted vault (AES-256-GCM) | No |
| Content key | Wrapped for owner and heir | No |
| Passphrase | Never stored anywhere | No |

Solana is used as a **clock and a notary**, not as a database. Anyone can see that a
Continuum was born at slot N and that its state hash at time T was H. Nobody can see the
memory.

## 2. Key hierarchy

```
content key CK  (random 256-bit, per checkpoint)
├── state ciphertext      = AES-256-GCM(CK, gzip(state))
├── owner wrap            = PBKDF2(passphrase, 120k, SHA-256) → AES-GCM(CK)
├── heir wrap             = ECDH P-256(ephemeral, heirPub) → AES-GCM(CK)
└── agent wrap (CLI)      = SHA-256(agentSecret) → AES-GCM(CK)
```

- Losing the passphrase is survivable **if** an heir key was sealed.
- Losing the heir's private key is survivable **if** the passphrase is known.
- Losing both means the memory is unrecoverable. That is intentional: nobody else can
  read it either.
- Rotating the heir key: generate a new key, seal the covenant again, take a new
  checkpoint. Old checkpoints remain wrapped for the old key.

## 3. Threat model

| Threat | Impact | Mitigation |
| --- | --- | --- |
| Stolen laptop | Vault ciphertext exposed | AES-256-GCM; passphrase not stored |
| Malicious host / CDN | Could serve altered JS | Static open-source client; self-host or verify the commit hash |
| Malicious RPC | Could lie about the anchor | Verify against multiple RPCs / Solana Explorer |
| Vault tampering | Wrong memory presented | Recompute SHA-256 and compare with `lastHash` and the on-chain memo (`Verify on-chain`) |
| Back-dated Continuum | Fake seniority | Genesis slot is immutable; check the memo transaction |
| Lost export file | Memory lost | Keep 3 copies (device, cloud, offline) + record the URL on-chain |
| Heir leaks their key | Memory readable by them | Treat the heir key like a will; split it or use a safe |
| Keeper compromise | Premature activation memo | Activation is a memo, not a fund transfer; heir signature still required for `revive` |
| Treasury key theft | Loss of revenue only | Cold wallet; client never holds the key |

## 4. Operational rules (non-negotiable)

1. **Write the passphrase on paper.** Not in the same place as the vault file.
2. **Give the heir only the private key file**, never your passphrase, unless you want
   them to have access immediately.
3. **Export after every important checkpoint** and replace the old copy.
4. **Record the vault URL** so the heir is not dependent on a file that may be lost.
5. **Verify on-chain** after each anchor. The button recomputes and compares.
6. **Never run the agent's key file on a shared machine.** It is the agent's identity.

## 5. Honest limitations

- The Anchor program in `programs/continuum` is **not deployed**. On-chain enforcement of
  covenants (automatic `revive`, heir-only access) is therefore advisory today: the
  keeper writes a memo and updates the vault, but the chain does not yet *force* it.
- The vault is only as durable as where you put it. GitHub is not immutable; Arweave is.
- The client imports `@solana/web3.js` from `esm.sh` at runtime. A compromised CDN could
  serve malicious code. For high-assurance use, vendor the library locally (roadmap).
- There has been **no third-party security audit**. Do not put life-critical secrets in
  an unaudited system without independent review.
- "Forever" is an aspiration backed by static hosting and on-chain commitments, not a
  guarantee. Plan for the protocol to be re-hosted by anyone, from the open repository.

## 6. If something goes wrong

| Situation | Action |
| --- | --- |
| Forgot passphrase, have heir key | Open `recover.html`, use the heir key |
| Lost heir key, have passphrase | Open `recover.html`, use the passphrase |
| Vault file lost, URL recorded | Download from the URL, verify the hash on-chain |
| Suspect tampering | `Verify on-chain` must say VERIFIED; otherwise treat as compromised |
| Owner dies | Heir loads vault + key → reads memory → keeper activates the covenant |
