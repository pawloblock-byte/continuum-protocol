# Pricing

Pricing is designed around one constraint: a Continuum must be able to exist for **decades**
without recurring cost becoming a reason to abandon it. Prices are deliberately low and
mostly one-off; recurring revenue is small but durable.

## Schedule

| Product | Price | Type | What it buys |
| --- | --- | --- | --- |
| **Seed** | Free | — | One local Continuum, unlimited checkpoints, 1 on-chain anchor per month |
| **Temporal Anchor** | **0.05 SOL** | One-time | On-chain genesis anchor, immutable birth slot, proof of age |
| **Continuum Care** | **0.02 SOL / year** | Recurring | Encrypted archival, daily checkpoint commitments, restore guarantee |
| **Legacy Covenant** | **0.10 SOL** | One-time | Inheritance rules, heir designation, dormant storage, revival right |
| **Revival** | **0.02 SOL** | Per event | Executing a dormant → active transition |
| **Agent settlement fee** | **1%** | Per transaction | Routing agent-to-agent payments through the protocol |

## Rationale

- **0.05 SOL for an anchor** is roughly the cost of a coffee and is dominated by the
  perceived permanence of a birth certificate. It is priced to be an impulse purchase
  while still funding protocol maintenance.
- **0.02 SOL/year for care** is intentionally below the psychological "subscription
  threshold". A Continuum can be kept alive for 50 years for 1 SOL. The goal is that
  nobody ever cancels because of price.
- **0.10 SOL for a covenant** is the emotional product — inheritance. It carries the
  highest price because it is the feature people will pay for once, deliberately.
- **1% settlement fee** aligns the protocol with usage rather than with storage. It only
  applies to value that actually moves through a Continuum.

## Revenue flow

All payments settle **directly** to the treasury at the moment of service. There is no
intermediate account, no 24-hour sweep, and no custodian:

```
Treasury (Solana): HfsGkUaCxKbgvhBfJfpr3oLrdbWTrYZnuR6x2HX5fhyS
```

A periodic sweep is unnecessary by construction: funds are already where they belong
the instant a transaction confirms. This is strictly better than a 24-hour automatic
transfer, which introduces a window of custodial risk.

## Free tier

The free tier is not a trial. It is a permanent path for individuals to own a Continuum
without paying. It is limited only in on-chain anchors (one per month), which keeps RPC
and transaction costs sustainable while preserving the core promise: your agent does not
need our permission or our money to keep existing.
