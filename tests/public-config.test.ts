import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicKey,
  isPrivateHost,
  validatePublicConfig,
} from "../src/services/public-config";
const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
test("public configuration rejects privileged, malformed and secret keys", () => {
  assert.ok(isPublicKey(jwt("anon")));
  assert.ok(isPublicKey("sb_publishable_example"));
  for (const key of [
    jwt("service_role"),
    jwt("authenticated"),
    "sb_secret_example",
    "not-a-key",
  ])
    assert.equal(isPublicKey(key), false);
});
test("HTTP development URLs are limited to exact loopback or private network addresses", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "10.0.0.3",
    "172.16.0.1",
    "192.168.1.2",
  ])
    assert.ok(isPrivateHost(host));
  for (const host of [
    "127.0.0.1.attacker.com",
    "localhost.attacker.com",
    "10.attacker.com",
    "172.32.0.1",
    "192.168.999.1",
    "8.8.8.8",
  ])
    assert.equal(isPrivateHost(host), false);
  assert.equal(
    validatePublicConfig("http://127.0.0.1:54321", jwt("anon"), true),
    null,
  );
  assert.ok(validatePublicConfig("http://127.0.0.1:54321", jwt("anon"), false));
  assert.ok(
    validatePublicConfig("http://127.0.0.1.attacker.com", jwt("anon"), true),
  );
});
test("URLs cannot carry credentials, query strings or fragments", () => {
  for (const url of [
    "https://user:password@project.supabase.co",
    "https://project.supabase.co?token=secret",
    "https://project.supabase.co#token",
  ])
    assert.ok(validatePublicConfig(url, jwt("anon"), false));
  assert.equal(
    validatePublicConfig("https://project.supabase.co", jwt("anon"), false),
    null,
  );
});
