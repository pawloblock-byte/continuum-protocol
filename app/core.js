export const PRICE = { anchor: 0.05, careYear: 0.02, legacy: 0.1 };
export const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58(bytes) {
  let x = 0n;
  for (const b of bytes) x = x * 256n + BigInt(b);
  let out = "";
  while (x > 0n) {
    out = ALPHABET[Number(x % 58n)] + out;
    x /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}

export function fmtAge(from, now = Date.now()) {
  const ms = Math.max(0, now - from);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just born";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h " + (m % 60) + "m";
  const d = Math.floor(h / 24);
  return d + "d " + (h % 24) + "h";
}

export function eventIcon(type) {
  return { genesis: "◉", checkpoint: "▣", anchor: "⛓", covenant: "∞", restore: "↺" }[type] || "·";
}

export function priceTotal({ n = 1, years = 0, anchor = true, legacy = false } = {}) {
  const count = Math.max(1, Math.floor(n || 1));
  const yrs = Math.max(0, Math.floor(years || 0));
  let per = 0;
  if (anchor) per += PRICE.anchor;
  per += yrs * PRICE.careYear;
  if (legacy) per += PRICE.legacy;
  return Number((per * count).toFixed(6));
}

export function isValidContinuum(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.anchor !== "string" || obj.anchor.length < 20) return false;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (!Array.isArray(obj.events)) return false;
  if (typeof obj.createdAt !== "number") return false;
  return true;
}

const TEXT = new TextEncoder();

export function toB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function gzipBytes(bytes) {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipBytes(bytes) {
  if (typeof DecompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function genRecoveryKey() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { pub: toB64(pub), priv: toB64(priv) };
}

async function ecdhAesKey(privKey, pubKey) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pubKey }, privKey, 256);
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function wrapContentKeyForHeir(heirPubB64, ck) {
  const heirPub = await crypto.subtle.importKey("raw", fromB64(heirPubB64), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const kek = await ecdhAesKey(eph.privateKey, heirPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, ck);
  const ephPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  return { alg: "ECDH-P256/AES-GCM", ephPub: toB64(ephPub), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function unwrapContentKeyAsHeir(privB64, wrap) {
  const priv = await crypto.subtle.importKey("pkcs8", fromB64(privB64), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const ephPub = await crypto.subtle.importKey("raw", fromB64(wrap.ephPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const kek = await ecdhAesKey(priv, ephPub);
  const ck = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(wrap.iv) }, kek, fromB64(wrap.ct));
  return new Uint8Array(ck);
}

export async function sealBlob(ck, bytes) {
  const key = await crypto.subtle.importKey("raw", ck, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { alg: "AES-GCM-256", iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function openBlob(ck, rec) {
  const key = await crypto.subtle.importKey("raw", ck, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
  return new Uint8Array(pt);
}

async function passKek(passphrase, saltBytes) {
  const base = await crypto.subtle.importKey("raw", TEXT.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 120000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapForOwner(ck, passphrase, saltBytes) {
  const kek = await passKek(passphrase, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, ck);
  return { alg: "PBKDF2-AES-GCM", iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function unwrapAsOwner(passphrase, saltBytes, wrap) {
  const kek = await passKek(passphrase, saltBytes);
  const ck = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(wrap.iv) }, kek, fromB64(wrap.ct));
  return new Uint8Array(ck);
}

export async function wrapForAgent(ck, agentSecret) {
  const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", TEXT.encode(agentSecret)));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ck);
  return { alg: "AGENT-SHA256-AES-GCM", iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function unwrapAsAgent(agentSecret, wrap) {
  const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", TEXT.encode(agentSecret)));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const ck = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(wrap.iv) }, key, fromB64(wrap.ct));
  return new Uint8Array(ck);
}
