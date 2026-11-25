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
