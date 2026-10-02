import test from "node:test";
import assert from "node:assert/strict";
import { makeDraft, workers } from "../src/domain/seed";
import {
  allocateBatch,
  dispatch,
  eligible,
  heuristicAcceptance,
  pricing,
  qualityScore,
  rankCandidates,
  simulatedRouting,
} from "../src/domain/marketplace";
import { transition } from "../src/domain/lifecycle";
import { demoPayments } from "../src/services/adapters";
import { Job, WorkerProfile } from "../src/domain/models";
const job = (): Job => ({
  ...makeDraft(),
  title: "Leaking sink",
  status: "matching",
  offer: 145,
});
test("seeded marketplace has varied skills and at least 20 workers", () => {
  assert.ok(workers.length >= 20);
  assert.ok(new Set(workers.map((w) => w.minimumPay)).size > 5);
  assert.ok(
    new Set(workers.flatMap((w) => w.skills.map((s) => s.skill))).size >= 10,
  );
});
test("a mature 4.93 track record outweighs two perfect reviews", () => {
  const veteran = {
    ...workers[0],
    metrics: {
      ...workers[0].metrics,
      rating: 4.93,
      reviews: 800,
      completed: 800,
    },
  };
  const rookie = {
    ...veteran,
    metrics: { ...veteran.metrics, rating: 5, reviews: 2, completed: 2 },
  };
  assert.ok(qualityScore(veteran) > qualityScore(rookie));
});
test("hard constraints reject unavailable, suspended, blocked, and out-of-area workers", () => {
  const w = workers[0],
    j = job();
  assert.equal(eligible(w, j), true);
  assert.equal(eligible({ ...w, available: false }, j), false);
  assert.equal(eligible({ ...w, standing: "suspended" }, j), false);
  assert.equal(eligible(w, j, [w.id]), false);
  assert.equal(
    eligible({ ...w, location: { latitude: 42, longitude: -73 } }, j),
    false,
  );
  assert.equal(eligible({ ...w, skills: [] }, j), false);
});
test("license eligibility checks skill, jurisdiction, verification and expiry", () => {
  const w = workers[0],
    j = { ...job(), requiresLicense: true };
  assert.equal(eligible(w, j), false);
  const licensed: WorkerProfile = {
    ...w,
    licenses: [
      {
        id: "license",
        skill: j.skill,
        jurisdiction: "NY",
        expiresAt: "2099-01-01",
        verified: true,
      },
    ],
  };
  assert.equal(eligible(licensed, j), true);
  assert.equal(
    eligible(
      {
        ...licensed,
        licenses: [{ ...licensed.licenses[0], expiresAt: "2000-01-01" }],
      },
      j,
    ),
    false,
  );
  assert.equal(
    eligible(
      {
        ...licensed,
        licenses: [{ ...licensed.licenses[0], jurisdiction: "CA" }],
      },
      j,
    ),
    false,
  );
});
test("higher offers monotonically improve individual and aggregate probability", () => {
  let previous = 0;
  for (let offer = 50; offer <= 250; offer += 5) {
    const p = pricing({ ...job(), offer }, workers);
    assert.ok(p.probability >= previous);
    assert.ok(p.probability <= 0.98);
    previous = p.probability;
  }
  const w = workers[0];
  assert.ok(
    heuristicAcceptance.predict(w, { ...job(), offer: 175 }, 8) >
      heuristicAcceptance.predict(w, { ...job(), offer: 85 }, 8),
  );
});
test("blocked candidates never contribute to estimates", () => {
  const allBlocked = workers.map((w) => w.id);
  assert.equal(pricing(job(), workers, allBlocked).eligible, 0);
  assert.equal(pricing(job(), workers, allBlocked).probability, 0);
});
test("ranking is explainable, bounded and not just nearest-first", () => {
  const ranked = rankCandidates(job(), workers);
  assert.ok(ranked.length > 3);
  for (const c of ranked) {
    assert.ok(c.score >= 0 && c.score <= 1);
    assert.ok(c.eta >= 3);
    assert.equal(Object.keys(c.components).length, 9);
  }
  assert.ok(ranked.every((c, i) => i === 0 || c.score <= ranked[i - 1].score));
  const w = workers[0];
  assert.ok(
    simulatedRouting.estimate(
      { ...w, location: { latitude: 40.72, longitude: -73.98 } },
      job().address.coordinates,
    ) > simulatedRouting.estimate(w, job().address.coordinates),
  );
});
test("batch allocation does not assign a worker twice", () => {
  const result = allocateBatch(
    Array.from({ length: 8 }, (_, i) => ({ ...job(), id: `j-${i}` })),
    workers,
  );
  const ids = result.flatMap((r) =>
    r.candidate ? [r.candidate.worker.id] : [],
  );
  assert.equal(ids.length, new Set(ids).size);
});
test("dispatch accepts an actual ranked candidate and expires competing offers", async () => {
  const result = await dispatch(job(), workers, {
    delay: 1,
    random: () => 0,
    onStage: () => {},
  });
  assert.equal(result.reason, "accepted");
  assert.ok(result.candidate);
  assert.equal(result.offers.filter((o) => o.status === "accepted").length, 1);
  assert.equal(result.offers.filter((o) => o.status === "pending").length, 0);
});
test("dispatch expands waves and can expire without a fabricated match", async () => {
  const stages: number[] = [];
  const result = await dispatch(job(), workers, {
    delay: 1,
    random: () => 1,
    onStage: (_, w) => stages.push(w),
  });
  assert.equal(result.reason, "expired");
  assert.equal(result.candidate, undefined);
  assert.ok(stages.includes(3));
});
test("dispatch cancellation cannot produce a late acceptance", async () => {
  const controller = new AbortController();
  const p = dispatch(job(), workers, {
    signal: controller.signal,
    delay: 20,
    random: () => 0,
    onStage: () => {},
  });
  controller.abort();
  const result = await p;
  assert.equal(result.reason, "cancelled");
  assert.equal(result.candidate, undefined);
});
test("new worker exploration preserves eligibility and gives first-wave exposure", async () => {
  const newcomer = {
    ...workers[0],
    id: "newcomer",
    metrics: { ...workers[0].metrics, completed: 2, reviews: 2 },
    minimumPay: 60,
  };
  const result = await dispatch(job(), [...workers, newcomer], {
    delay: 1,
    random: () => 1,
    onStage: () => {},
  });
  assert.ok(
    result.offers.some((o) => o.workerId === "newcomer" && o.wave === 1),
  );
});
test("state machine rejects payment-skipping and terminal transitions", () => {
  assert.throws(() => transition({ ...job(), status: "draft" }, "completed"));
  assert.throws(() => transition({ ...job(), status: "cancelled" }, "matched"));
  let j = { ...job(), status: "draft" as const } as Job;
  for (const state of [
    "pricing",
    "requested",
    "matching",
    "offered",
    "matched",
    "worker_en_route",
    "worker_arrived",
    "in_progress",
    "awaiting_completion_confirmation",
    "completed",
  ] as const)
    j = transition(j, state);
  assert.equal(j.status, "completed");
});
test("payment capture requires completion approval and unchanged agreed price", async () => {
  const j = job(),
    payment = await demoPayments.authorize(j);
  await assert.rejects(() => demoPayments.capture(j, payment));
  const ready = { ...j, status: "awaiting_completion_confirmation" as const };
  await assert.rejects(() =>
    demoPayments.capture({ ...ready, offer: 200 }, payment),
  );
  const paid = await demoPayments.capture({ ...ready, tip: 20 }, payment);
  assert.equal(paid.state, "captured");
  assert.equal(paid.tip, 20);
  assert.equal(paid.amount, j.offer);
  assert.deepEqual(await demoPayments.capture(ready, paid), paid);
  assert.equal((await demoPayments.refund(paid)).state, "refunded");
});

test("every offered category has an eligible worker at a sustainable price", () => {
  const skills = [
    "plumbing.leak",
    "electrical.fixture",
    "assembly.furniture",
    "mounting.tv",
    "appliances.repair",
    "painting.interior",
    "hvac.service",
    "carpentry.repair",
    "general.repair",
    "moving.help",
    "outdoor.help",
    "other.help",
  ] as const;
  for (const skill of skills)
    assert.ok(
      rankCandidates(
        {
          ...job(),
          skill,
          offer: 200,
          requiresLicense:
            skill.startsWith("electrical") || skill.startsWith("hvac"),
        },
        workers,
      ).length > 0,
      skill,
    );
});
