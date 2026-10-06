import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
test("Router query parsing retains Unicode, plus signs and repeated parameters", () => {
  const query = require("query-string");
  const result = query.parse("name=Sam+Rivera&word=%E2%9C%93&id=a&id=b");
  assert.equal(result.name, "Sam Rivera");
  assert.equal(result.word, "✓");
  assert.deepEqual(result.id, ["a", "b"]);
});
test("malformed percent-encoded links decode within a bounded process timeout", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "const query=require('query-string'); query.parse('id='+('%E0%A4%'.repeat(15000))); console.log('ok');",
    ],
    { timeout: 2000, encoding: "utf8" },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "ok");
});
