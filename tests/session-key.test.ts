import test from "node:test";
import assert from "node:assert/strict";
import { logicalSessionKey } from "../src/services/session-key";
test("tab-scoped sessions survive reload without sharing Auth broadcast channels", () => {
  const first =
    "onhand.web.https://one.supabase.co.11111111-1111-1111-1111-111111111111";
  const next =
    "onhand.web.https://one.supabase.co.22222222-2222-2222-2222-222222222222";
  assert.notEqual(first, next);
  assert.equal(logicalSessionKey(first), logicalSessionKey(next));
  assert.notEqual(
    logicalSessionKey(first),
    logicalSessionKey(next.replace("one.supabase.co", "two.supabase.co")),
  );
});
test("verifier keys stay separate and native keys are preserved", () => {
  const key =
    "onhand.web.http://127.0.0.1:54321.11111111-1111-1111-1111-111111111111";
  assert.equal(
    logicalSessionKey(key + "-code-verifier"),
    logicalSessionKey(key) + "-code-verifier",
  );
  assert.equal(
    logicalSessionKey("sb-project-auth-token"),
    "sb-project-auth-token",
  );
});
