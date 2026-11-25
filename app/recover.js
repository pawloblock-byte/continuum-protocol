import {
  fromB64,
  sha256Hex,
  gunzipBytes,
  fmtAge,
  unwrapContentKeyAsHeir,
  unwrapAsOwner,
  openBlob,
} from "./core.js";

const $ = (id) => document.getElementById(id);
let vault = null;

function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("err", isError);
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 4500);
}

async function deriveKek(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

function parseKey(text) {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t);
      return o.priv || o.privateKey || o.recoveryKey || null;
    } catch {
      return null;
    }
  }
  return t;
}

async function openVault() {
  const out = $("open-out");
  if (!vault) {
    toast("Load the vault file first.", true);
    return;
  }
  const snap = vault.lastSnapshot;
  if (!snap) {
    toast("This vault has no sealed checkpoint yet.", true);
    return;
  }
  out.textContent = "Unlocking…";
  try {
    let payload;
    const heirKey = parseKey($("heir-key").value);
    const pass = $("owner-pass").value;

    if (heirKey) {
      if (!snap.heir) throw new Error("This vault was not sealed for an heir key.");
      const ck = await unwrapContentKeyAsHeir(heirKey, snap.heir);
      payload = JSON.parse(new TextDecoder().decode(await gunzipBytes(await openBlob(ck, snap))));
      out.textContent = "Unlocked with heir recovery key.";
    } else if (pass) {
      const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vault.anchor)));
      if (snap.v >= 2 && snap.owner) {
        const ck = await unwrapAsOwner(pass, salt, snap.owner);
        payload = JSON.parse(new TextDecoder().decode(await gunzipBytes(await openBlob(ck, snap))));
      } else {
        const kek = await deriveKek(pass, salt);
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(snap.iv) }, kek, fromB64(snap.ct));
        payload = JSON.parse(new TextDecoder().decode(await gunzipBytes(new Uint8Array(pt))));
      }
      out.textContent = "Unlocked with owner passphrase.";
    } else {
      toast("Provide a recovery key or the owner passphrase.", true);
      return;
    }
    await renderResult(payload, snap);
  } catch (e) {
    out.textContent = "Failed: " + (e?.message || e);
    toast("Could not decrypt. Check the key or passphrase.", true);
  }
}

async function renderResult(payload, snap) {
  $("result").classList.remove("hidden");
  $("r-name").textContent = vault.name || payload.name || "—";
  $("r-anchor").textContent = vault.anchor;
  $("r-born").textContent = new Date(vault.createdAt).toISOString().slice(0, 10);
  $("r-age").textContent = fmtAge(vault.createdAt);
  $("r-cp").textContent = vault.checkpoints ?? "—";

  const expected = vault.lastHash;
  const actual = await sha256Hex(fromB64(snap.ct));
  const verified = expected ? actual === expected : false;
  const v = $("r-verify");
  v.textContent = verified ? "VERIFIED" : "UNVERIFIED";
  v.classList.toggle("dormant", !verified);

  const memory = Array.isArray(payload.memory) ? payload.memory : [];
  $("r-count").textContent = memory.length + " moments";
  const ol = $("r-memory");
  ol.innerHTML = "";
  [...memory].reverse().forEach((m) => {
    const li = document.createElement("li");
    const d = document.createElement("div");
    d.className = "d";
    d.textContent = m.note || "(no note)";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = new Date(m.t).toISOString().replace("T", " ").slice(0, 19) + " UTC · age " + (m.age || "—");
    li.append(d, t);
    ol.append(li);
  });
  if (!memory.length) {
    ol.innerHTML = '<li><div class="d muted">No memory recorded in this checkpoint.</div></li>';
  }

  const chain = $("r-chain");
  if (vault.genesis?.sig) {
    chain.innerHTML =
      "Anchor slot " + vault.genesis.slot + " · tx " + vault.genesis.sig.slice(0, 16) + "… · " +
      '<a target="_blank" rel="noopener" href="https://explorer.solana.com/tx/' + vault.genesis.sig +
      '?cluster=devnet">verify on Solana Explorer ↗</a>';
  } else {
    chain.textContent = "This vault was not anchored on-chain. Its age cannot be independently verified.";
  }
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("vault-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    vault = JSON.parse(await file.text());
    if (!vault.anchor || !vault.name) throw new Error("not a Continuum vault");
    $("vault-meta").textContent =
      vault.name + " · " + vault.anchor.slice(0, 12) + "… · born " + new Date(vault.createdAt).toISOString().slice(0, 10);
    toast("Vault loaded.");
  } catch (err) {
    vault = null;
    $("vault-meta").textContent = "";
    toast("Invalid vault file: " + err.message, true);
  }
});

$("btn-open").addEventListener("click", openVault);
