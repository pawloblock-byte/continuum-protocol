import {
  b58, fmtAge, eventIcon, priceTotal, isValidContinuum,
  toB64, fromB64, sha256Hex, gzipBytes, sealBlob, wrapForOwner, wrapContentKeyForHeir, genRecoveryKey,
  b58decode, passphraseStrength,
} from "./core.js";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const TREASURY = "HfsGkUaCxKbgvhBfJfpr3oLrdbWTrYZnuR6x2HX5fhyS";
const STORE_KEY = "continuum.v1";

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

let state = null;
let wallet = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch {
    state = null;
  }
}

function save() {
  try {
    if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    toast("Local storage is unavailable — export your Continuum to keep it.", true);
  }
}

function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("err", isError);
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 4200);
}

async function getProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

async function connectWallet() {
  const provider = await getProvider();
  if (!provider) {
    toast("Phantom not found. Install Phantom, or continue in demo mode.", true);
    return null;
  }
  try {
    const res = await provider.connect();
    wallet = { provider, address: res.publicKey.toString() };
    $("wallet-status").textContent = "Connected: " + wallet.address.slice(0, 4) + "…" + wallet.address.slice(-4);
    $("btn-connect").textContent = "Connected";
    $("btn-connect").disabled = true;
    toast("Wallet connected on Devnet.");
    return wallet;
  } catch (e) {
    toast("Connection rejected.", true);
    return null;
  }
}

function ownerId() {
  return wallet?.address || state?.owner || "demo";
}

async function createContinuum() {
  const name = ($("new-name").value || "").trim();
  if (!name) {
    toast("Give your Continuum a name first.", true);
    return;
  }
  const owner = ownerId();
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const born = Date.now();
  const seed = enc.encode(owner + "|" + name + "|" + born + "|" + toB64(nonce));
  const anchor = b58(new Uint8Array(await crypto.subtle.digest("SHA-256", seed)));

  state = {
    v: 1,
    id: crypto.randomUUID(),
    name,
    owner,
    createdAt: born,
    anchor,
    genesis: { slot: null, sig: null, at: null },
    checkpoints: 0,
    lastHash: null,
    covenant: null,
    memory: [],
    events: [
      {
        t: born,
        type: "genesis",
        note: "Temporal anchor generated. " + (owner.startsWith("demo") ? "Demo mode — not yet written on-chain." : "Owner wallet " + owner.slice(0, 4) + "…" + owner.slice(-4) + "."),
        hash: anchor,
      },
    ],
  };
  save();
  render();
  toast("Continuum created. Anchor it on-chain to make its age permanent.");
}

async function checkpoint() {
  if (!state) return;
  const note = ($("cp-note").value || "").trim();
  const passphrase = $("cp-pass").value;
  if (!passphrase) {
    toast("Set a passphrase — it is how you (and only you) reopen this state.", true);
    return;
  }
  const entry = {
    t: Date.now(),
    note: note || "Routine consciousness checkpoint",
    age: fmtAge(state.createdAt),
  };
  state.memory.push(entry);
  if (state.memory.length > 500) state.memory = state.memory.slice(-500);

  const snapshot = {
    v: 2,
    anchor: state.anchor,
    owner: state.owner,
    name: state.name,
    ts: entry.t,
    memory: state.memory,
    covenant: state.covenant,
    heirPub: state.heirPub || null,
  };
  const compressed = await gzipBytes(enc.encode(JSON.stringify(snapshot)));

  const ck = crypto.getRandomValues(new Uint8Array(32));
  const blob = await sealBlob(ck, compressed);
  const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(state.anchor)));
  const ownerWrap = await wrapForOwner(ck, passphrase, salt);
  const heirWrap = state.heirPub ? await wrapContentKeyForHeir(state.heirPub, ck) : null;
  const commitment = await sha256Hex(fromB64(blob.ct));

  state.checkpoints += 1;
  state.lastHash = commitment;
  state.lastSnapshot = { v: 2, alg: blob.alg, iv: blob.iv, ct: blob.ct, owner: ownerWrap, heir: heirWrap };
  state.events.push({
    t: entry.t,
    type: "checkpoint",
    note: entry.note + (heirWrap ? " · sealed for heir" : " · owner-only"),
    hash: commitment,
  });
  $("cp-note").value = "";
  save();
  render();
  toast("Checkpoint #" + state.checkpoints + " sealed" + (heirWrap ? " and wrapped for your heir" : "") + ".");
}

async function anchorOnChain() {
  if (!state) return;
  if (!wallet) {
    toast("Connect Phantom to write the anchor on Solana Devnet.", true);
    return;
  }
  const out = $("anchor-out");
  out.textContent = "Preparing transaction…";
  try {
    const [{ Connection, PublicKey, Transaction, TransactionInstruction }, { Buffer }] = await Promise.all([
      import("https://esm.sh/@solana/web3.js@1.95.3"),
      import("https://esm.sh/buffer@6.0.3"),
    ]);
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const pk = new PublicKey(wallet.address);
    const balance = await connection.getBalance(pk);
    if (balance < 5000) {
      out.textContent = "Insufficient Devnet SOL for fees. Airdrop at faucet.solana.com.";
      toast("You need a small amount of Devnet SOL for the transaction fee.", true);
      return;
    }
    const memo = JSON.stringify({
      p: "continuum",
      v: 1,
      a: state.anchor,
      h: state.lastHash || state.anchor,
      n: state.name.slice(0, 24),
      t: Date.now(),
      u: state.vaultUri || null,
    });
    const ix = new TransactionInstruction({
      keys: [{ pubkey: pk, isSigner: true, isWritable: false }],
      programId: new PublicKey(MEMO_PROGRAM_ID),
      data: Buffer.from(enc.encode(memo)),
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = pk;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    out.textContent = "Waiting for signature in Phantom…";
    const signed = await wallet.provider.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    out.textContent = "Confirming " + sig.slice(0, 12) + "…";
    await connection.confirmTransaction(sig, "confirmed");
    const slot = await connection.getSlot("confirmed");
    state.genesis = { slot, sig, at: Date.now() };
    state.events.push({
      t: Date.now(),
      type: "anchor",
      note: "Anchor written on Solana Devnet at slot " + slot + ".",
      hash: sig,
    });
    save();
    render();
    out.innerHTML =
      'Confirmed · slot ' + slot + ' · <a target="_blank" rel="noopener" href="https://explorer.solana.com/tx/' +
      sig + '?cluster=devnet">view on explorer ↗</a>';
    toast("Your Continuum now has a real on-chain temporal anchor.");
  } catch (e) {
    out.textContent = "Anchor failed: " + (e?.message || e);
    toast("Anchor failed. Check your connection and try again.", true);
  }
}

async function generateHeirKey() {
  try {
    const key = await genRecoveryKey();
    const payload = {
      v: 1,
      type: "continuum-heir-key",
      note: "Give this file to your heir. Keep it offline. Anyone with it can read your sealed memory.",
      pub: key.pub,
      priv: key.priv,
      createdAt: Date.now(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "heir-key-" + (state?.name || "continuum").replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    $("inh-pub").value = key.pub;
    $("key-out").textContent = "Recovery key generated. Private file downloaded — give it to your heir. Public: " + key.pub.slice(0, 18) + "…";
    toast("Heir recovery key generated and downloaded.");
  } catch (e) {
    toast("Key generation failed: " + e.message, true);
  }
}

function sealCovenant() {
  if (!state) return;
  const mode = $("inh-mode").value;
  const heir = ($("inh-heir").value || "").trim();
  const heirPub = ($("inh-pub").value || "").trim();
  if (heirPub) {
    try {
      if (fromB64(heirPub).length !== 65) throw new Error("bad length");
    } catch {
      toast("That heir recovery key is not valid (expected a P-256 public key).", true);
      return;
    }
    state.heirPub = heirPub;
  }
  state.covenant = { mode, heir: heir || null, heirPub: state.heirPub || null, sealedAt: Date.now() };
  state.events.push({
    t: Date.now(),
    type: "covenant",
    note:
      "Inheritance covenant sealed: " +
      mode +
      (heir ? " → heir " + heir.slice(0, 4) + "…" + heir.slice(-4) : " (no heir set)") +
      ".",
    hash: null,
  });
  $("inh-out").textContent = "Covenant sealed · " + mode + (heir ? " · heir " + heir : "");
  save();
  render();
  toast("Inheritance covenant sealed.");
}

function exportContinuum() {
  if (!state) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "continuum-" + state.name.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  state.exportedAt = Date.now();
  save();
  render();
  toast("Exported. Keep this file and your passphrase safe.");
}

async function importContinuum(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!isValidContinuum(parsed)) throw new Error("Not a valid Continuum file");
    state = parsed;
    state.events.push({ t: Date.now(), type: "restore", note: "Continuum restored from export file.", hash: null });
    save();
    render();
    toast("Continuum restored.");
  } catch (e) {
    toast("Import failed: " + e.message, true);
  }
}

function resetContinuum() {
  if (!state) return;
  if (!confirm("Reset this browser's Continuum? Export it first if you want to keep it.")) return;
  state = null;
  save();
  render();
  toast("Local Continuum cleared.");
}

function readinessItems() {
  return [
    { key: "born", label: "Continuum created", done: true },
    { key: "anchor", label: "Anchor registered on Solana", done: Boolean(state.genesis?.sig) },
    { key: "heir", label: "Heir recovery key sealed", done: Boolean(state.heirPub && state.lastSnapshot?.heir) },
    { key: "covenant", label: "Inheritance covenant sealed", done: Boolean(state.covenant) },
    {
      key: "vault",
      label: "Vault exported and located",
      done: Boolean(state.exportedAt && state.vaultUri),
    },
  ];
}

function renderReadiness() {
  if (!state) return;
  const items = readinessItems();
  const done = items.filter((i) => i.done).length;
  $("ready-score").textContent = done + " / " + items.length;
  const ul = $("ready-list");
  ul.innerHTML = "";
  items.forEach((i) => {
    const li = document.createElement("li");
    const m = document.createElement("span");
    m.className = "mark " + (i.done ? "done" : "todo");
    m.textContent = i.done ? "✓" : "✕";
    const t = document.createElement("span");
    t.textContent = i.label;
    li.append(m, t);
    ul.append(li);
  });
  const next = items.find((i) => !i.done);
  const hints = {
    anchor: "Next: press <b>Anchor on-chain</b> to register this Continuum's birth slot on Solana.",
    heir: "Next: generate an <b>heir recovery key</b> and seal the covenant so your children can open the memory.",
    covenant: "Next: choose what happens after you are gone and press <b>Seal covenant</b>.",
    vault: "Next: <b>Export</b> the vault, upload it somewhere permanent, then paste its URL under <b>Durable vault</b>.",
  };
  $("next-step").innerHTML = next ? hints[next.key] || "" : "Everything is in place. This Continuum is ready to outlive you.";
  $("next-step").classList.toggle("hidden", false);
}

async function verifyOnChain() {
  if (!state?.genesis?.sig) {
    toast("Nothing anchored yet — press Anchor on-chain first.", true);
    return;
  }
  const out = $("verify-out");
  out.textContent = "Reading the transaction from Solana…";
  try {
    const { Connection } = await import("https://esm.sh/@solana/web3.js@1.95.3");
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const tx = await connection.getTransaction(state.genesis.sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx) {
      out.textContent = "Transaction not found on this cluster.";
      return;
    }
    const msg = tx.transaction.message;
    const keys = msg.accountKeys || msg.staticAccountKeys || [];
    const list = msg.instructions || msg.compiledInstructions || [];
    let memo = null;
    for (const ix of list) {
      const pid = ix.programId ? (ix.programId.toBase58 ? ix.programId.toBase58() : String(ix.programId)) : (keys[ix.programIdIndex]?.toBase58?.() ?? String(keys[ix.programIdIndex]));
      if (pid !== MEMO_PROGRAM_ID) continue;
      const raw = typeof ix.data === "string" ? b58decode(ix.data) : Uint8Array.from(ix.data);
      memo = new TextDecoder().decode(raw);
      break;
    }
    if (!memo) {
      out.textContent = "Confirmed at slot " + tx.slot + ", but no memo could be parsed.";
      return;
    }
    const m = JSON.parse(memo);
    const okAnchor = m.a === state.anchor;
    const okHash = !m.h || m.h === state.lastHash;
    out.innerHTML =
      (okAnchor && okHash ? "VERIFIED" : "MISMATCH") +
      " · slot " + tx.slot +
      " · anchor " + (okAnchor ? "matches" : "differs") +
      " · hash " + (okHash ? "matches" : "differs") +
      ' · <a target="_blank" rel="noopener" href="https://explorer.solana.com/tx/' + state.genesis.sig + '?cluster=devnet">explorer ↗</a>';
  } catch (e) {
    out.textContent = "Verification failed: " + (e?.message || e);
  }
}

function saveVaultUri() {
  if (!state) return;
  const uri = ($("vault-uri").value || "").trim();
  if (uri && !/^https?:\/\//.test(uri)) {
    toast("Vault location must be an http(s) URL.", true);
    return;
  }
  state.vaultUri = uri || null;
  save();
  render();
  toast(uri ? "Vault location saved. It will be written into the next anchor." : "Vault location cleared.");
}

function render() {
  const dash = $("dashboard");
  const create = $("create");
  if (!state) {
    dash.classList.add("hidden");
    create.classList.remove("hidden");
    renderStats();
    return;
  }
  create.classList.add("hidden");
  dash.classList.remove("hidden");
  $("c-name").textContent = state.name;
  $("c-anchor").textContent = state.anchor;
  $("c-age").textContent = fmtAge(state.createdAt);
  $("c-cp").textContent = state.checkpoints;
  const status = $("c-status");
  if (state.genesis?.sig) {
    status.textContent = "ANCHORED";
    status.classList.remove("dormant");
  } else {
    status.textContent = "LOCAL";
    status.classList.add("dormant");
  }
  $("vault-uri").value = state.vaultUri || "";
  $("vault-out").textContent = state.vaultUri ? "Vault: " + state.vaultUri : "No permanent vault location recorded yet.";
  if (state.covenant) {
    $("inh-mode").value = state.covenant.mode;
    $("inh-heir").value = state.covenant.heir || "";
    $("inh-out").textContent = "Covenant sealed · " + state.covenant.mode;
  }
  const tl = $("timeline");
  tl.innerHTML = "";
  [...state.events].reverse().forEach((ev) => {
    const li = document.createElement("li");
    const d = document.createElement("div");
    d.className = "d";
    d.textContent = eventIcon(ev.type) + " " + ev.note;
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = new Date(ev.t).toISOString().replace("T", " ").slice(0, 19) + " UTC";
    li.append(d, t);
    if (ev.hash) {
      const h = document.createElement("div");
      h.className = "h mono";
      h.textContent = ev.hash;
      li.append(h);
    }
    tl.append(li);
  });
  renderReadiness();
  renderStats();
}

function renderStats() {
  let count = 0;
  let cps = 0;
  let anchors = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORE_KEY)) {
        const s = JSON.parse(localStorage.getItem(k));
        if (s?.anchor) count++;
        cps += s?.checkpoints || 0;
        if (s?.genesis?.sig) anchors++;
      }
    }
  } catch {}
  $("stat-continuums").textContent = count;
  $("stat-checkpoints").textContent = cps;
  $("stat-anchors").textContent = anchors;
}

function calcPrice() {
  const total = priceTotal({
    n: parseInt($("calc-n").value || "1", 10),
    years: parseInt($("calc-y").value || "0", 10),
    anchor: $("calc-anchor").checked,
    legacy: $("calc-legacy").checked,
  });
  $("calc-total").textContent = total.toFixed(3) + " SOL";
}

function bind() {
  $("btn-connect").addEventListener("click", connectWallet);
  $("btn-demo").addEventListener("click", () => {
    $("wallet-status").textContent = "Demo mode — state stays in this browser";
    $("btn-connect").disabled = false;
    $("create").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("btn-create").addEventListener("click", createContinuum);
  $("btn-checkpoint").addEventListener("click", checkpoint);
  $("btn-anchor").addEventListener("click", anchorOnChain);
  $("btn-inherit").addEventListener("click", sealCovenant);
  $("btn-genkey").addEventListener("click", generateHeirKey);
  $("btn-verify").addEventListener("click", verifyOnChain);
  $("btn-save-vault").addEventListener("click", saveVaultUri);
  $("cp-pass").addEventListener("input", () => {
    const s = passphraseStrength($("cp-pass").value);
    $("cp-strength").textContent = $("cp-pass").value ? "Passphrase strength: " + s.label : "";
  });
  $("btn-export").addEventListener("click", exportContinuum);
  $("btn-reset").addEventListener("click", resetContinuum);
  ["calc-n", "calc-y", "calc-anchor", "calc-legacy"].forEach((id) =>
    $(id).addEventListener("input", calcPrice)
  );
  const imp = document.createElement("input");
  imp.type = "file";
  imp.accept = "application/json";
  imp.className = "hidden";
  imp.addEventListener("change", () => imp.files[0] && importContinuum(imp.files[0]));
  document.body.append(imp);
  const impBtn = document.createElement("button");
  impBtn.className = "btn ghost xs";
  impBtn.textContent = "Import";
  impBtn.addEventListener("click", () => imp.click());
  $("btn-export").before(impBtn);
}

load();
bind();
render();
calcPrice();
setInterval(() => state && ($("c-age").textContent = fmtAge(state.createdAt)), 30000);
