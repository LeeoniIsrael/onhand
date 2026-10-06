import test from "node:test";
import assert from "node:assert/strict";
import { boundedFetch } from "../src/services/bounded-fetch";
test("HTTP calls forward explicit caller cancellation", async () => {
  const original = globalThis.fetch;
  const caller = new AbortController();
  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  try {
    const pending = boundedFetch("https://example.test", {
      signal: caller.signal,
    });
    caller.abort();
    await assert.rejects(pending, /aborted/);
  } finally {
    globalThis.fetch = original;
  }
});
test("an unresponsive HTTP call reaches its deadline and releases its timer", async () => {
  const original = globalThis.fetch,
    schedule = globalThis.setTimeout;
  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener(
        "abort",
        () => reject(new Error("deadline")),
        { once: true },
      );
    });
  globalThis.setTimeout = ((
    handler: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) => schedule(handler, ms === 20000 ? 1 : ms, ...args)) as typeof setTimeout;
  try {
    await assert.rejects(boundedFetch("https://example.test"), /deadline/);
  } finally {
    globalThis.fetch = original;
    globalThis.setTimeout = schedule;
  }
});
