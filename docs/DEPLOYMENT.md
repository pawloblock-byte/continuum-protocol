# Deployment

Two independent deployments: the **static site** (free, permanent) and the **Anchor
program** (on-chain, requires SOL for rent and fees).

## 1. Static site

The site has no build step and no server. Any static host works.

### GitHub Pages (recommended, free)

```bash
git init
git add .
git commit -m "Continuum Protocol v0.1"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The included workflow `.github/workflows/pages.yml` runs the tests and publishes `app/`.

Result: `https://<USER>.github.io/<REPO>/`

### Local

```bash
npm start        # http://localhost:8080
```

Any HTTP server works; ES modules require HTTP (not `file://`).

## 2. Anchor program

Prerequisites: Rust, Solana CLI, Anchor 0.30.1, a funded Devnet keypair.

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1 && avm use 0.30.1

solana-keygen new -o ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 5

anchor build
anchor keys sync      # rewrites declare_id! to the deployed program id
anchor deploy --provider.cluster devnet
```

After deploying, replace the Memo anchoring call in `app/app.js` with an instruction to
the program (the client already builds and signs transactions, so only the instruction
changes).

### Mainnet checklist

- [ ] Independent security review of `programs/continuum`
- [ ] Rent-exemption budget for the treasury account
- [ ] Burn the program upgrade authority after final deploy
- [ ] Point the client at a dedicated RPC
- [ ] Verify the IDL matches the deployed bytecode

## 3. Treasury

```
HfsGkUaCxKbgvhBfJfpr3oLrdbWTrYZnuR6x2HX5fhyS
```

Payments settle directly to this address. Keep the key in cold storage; it is never
needed by the client or by any server.

## 4. Verification

```bash
npm test      # 13 tests: logic, pricing, site integrity
npm run check # syntax check of the client
```
