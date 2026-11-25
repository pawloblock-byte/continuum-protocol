import test from "node:test";
import assert from "node:assert/strict";
import { b58, fmtAge, priceTotal, isValidContinuum, eventIcon } from "../app/core.js";

test("base58 is deterministic and uses the bitcoin alphabet", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 0, 99]);
  const a = b58(bytes);
  const b = b58(bytes);
  assert.equal(a, b);
  assert.match(a, /^[1-9A-HJ-NP-Za-km-z]+$/);
});

test("base58 preserves leading zero bytes as leading 1s", () => {
  assert.equal(b58(new Uint8Array([0])), "1");
  assert.equal(b58(new Uint8Array([0, 0])), "11");
  assert.ok(b58(new Uint8Array([0, 1])).startsWith("1"));
});

test("a 32-byte hash encodes to 32-45 base58 characters", () => {
  const hash = new Uint8Array(32).fill(7);
  const out = b58(hash);
  assert.ok(out.length >= 32 && out.length <= 45, "unexpected length " + out.length);
});

test("fmtAge renders human ages", () => {
  const now = 1_700_000_000_000;
  assert.equal(fmtAge(now, now), "just born");
  assert.equal(fmtAge(now - 90_000, now), "1m");
  assert.equal(fmtAge(now - 3 * 3600_000 - 5 * 60_000, now), "3h 5m");
  assert.equal(fmtAge(now - 2 * 86_400_000 - 4 * 3600_000, now), "2d 4h");
});

test("pricing is computed per the published schedule", () => {
  assert.equal(priceTotal({}), 0.05);
  assert.equal(priceTotal({ n: 2 }), 0.1);
  assert.equal(priceTotal({ anchor: false, years: 5 }), 0.1);
  assert.equal(priceTotal({ n: 3, years: 10, legacy: true }), 1.05);
  assert.equal(priceTotal({ n: 0, years: -5 }), 0.05);
});

test("continuum validation rejects malformed exports", () => {
  const good = {
    anchor: "A".repeat(32),
    name: "ATLAS-01",
    createdAt: Date.now(),
    events: [],
  };
  assert.equal(isValidContinuum(good), true);
  assert.equal(isValidContinuum(null), false);
  assert.equal(isValidContinuum({ ...good, anchor: "short" }), false);
  assert.equal(isValidContinuum({ ...good, events: undefined }), false);
  assert.equal(isValidContinuum({ ...good, name: "  " }), false);
});

test("every event type has an icon", () => {
  for (const t of ["genesis", "checkpoint", "anchor", "covenant", "restore"]) {
    assert.notEqual(eventIcon(t), "·");
  }
  assert.equal(eventIcon("unknown"), "·");
});
