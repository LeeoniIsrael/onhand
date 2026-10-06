import assert from "node:assert/strict";
import test from "node:test";
import { sessionChunks } from "../src/services/session-chunks";

test("secure session chunks respect byte limits without splitting Unicode", () => {
  const value = JSON.stringify({ name: "山田🙂é".repeat(500), token: "x".repeat(2500) });
  const chunks = sessionChunks(value);
  assert.equal(chunks.join(""), value);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk, "utf8") <= 1800));
  assert.ok(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)));
});

test("secure session chunking handles empty and exact boundary values", () => {
  assert.deepEqual(sessionChunks(""), []);
  assert.deepEqual(sessionChunks("abcd", 4), ["abcd"]);
  assert.deepEqual(sessionChunks("🙂🙂", 4), ["🙂", "🙂"]);
  assert.throws(() => sessionChunks("a", 3));
});
