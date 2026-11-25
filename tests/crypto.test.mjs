import test from "node:test";
import assert from "node:assert/strict";
import {
  genRecoveryKey,
  wrapContentKeyForHeir,
  unwrapContentKeyAsHeir,
  sealBlob,
  openBlob,
  wrapForOwner,
  unwrapAsOwner,
  wrapForAgent,
  unwrapAsAgent,
  sha256Hex,
  gzipBytes,
  gunzipBytes,
  toB64,
  fromB64,
} from "../app/core.js";

const CK = () => crypto.getRandomValues(new Uint8Array(32));
const SALT = () => new Uint8Array(32).fill(3);

test("base64 round-trips arbitrary bytes", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(200));
  assert.deepEqual([...fromB64(toB64(bytes))], [...bytes]);
});

test("sha256 matches the known digest of empty input", async () => {
  assert.equal(
    await sha256Hex(new Uint8Array(0)),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});

test("a checkpoint sealed with a content key opens only with that key", async () => {
  const ck = CK();
  const plaintext = new TextEncoder().encode(JSON.stringify({ memory: ["born", "first thought"] }));
  const rec = await sealBlob(ck, plaintext);
  assert.equal(rec.alg, "AES-GCM-256");
  const opened = await openBlob(ck, rec);
  assert.equal(new TextDecoder().decode(opened), new TextDecoder().decode(plaintext));
  await assert.rejects(() => openBlob(CK(), rec));
});

test("the owner can recover the content key with the passphrase", async () => {
  const ck = CK();
  const wrap = await wrapForOwner(ck, "correct horse battery staple", SALT());
  const back = await unwrapAsOwner("correct horse battery staple", SALT(), wrap);
  assert.deepEqual([...back], [...ck]);
  await assert.rejects(() => unwrapAsOwner("wrong passphrase", SALT(), wrap));
});

test("a heir can recover the content key with their private recovery key", async () => {
  const heir = await genRecoveryKey();
  const ck = CK();
  const wrap = await wrapContentKeyForHeir(heir.pub, ck);
  const back = await unwrapContentKeyAsHeir(heir.priv, wrap);
  assert.deepEqual([...back], [...ck]);

  const stranger = await genRecoveryKey();
  await assert.rejects(() => unwrapContentKeyAsHeir(stranger.priv, wrap));
});

test("an agent can recover its own content key from its secret", async () => {
  const ck = CK();
  const wrap = await wrapForAgent(ck, "agent-secret-material");
  const back = await unwrapAsAgent("agent-secret-material", wrap);
  assert.deepEqual([...back], [...ck]);
  await assert.rejects(() => unwrapAsAgent("other-agent", wrap));
});

test("gzip round-trips when the platform supports it", async () => {
  const bytes = new TextEncoder().encode("x".repeat(1000));
  const zipped = await gzipBytes(bytes);
  const back = await gunzipBytes(zipped);
  assert.equal(new TextDecoder().decode(back), new TextDecoder().decode(bytes));
});
