import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.API_URL))
  throw new Error("Integration tests are restricted to the local database");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const db = new Client({ connectionString: config.DB_URL });
await db.connect();
const users: { id: string; api: SupabaseClient; role: string }[] = [];
let passed = 0;
async function check(name: string, test: () => Promise<void>) {
  await test();
  console.log(`PASS ${name}`);
  passed++;
}
async function user(role: string) {
  const email = `onhand-${randomUUID()}@example.com`;
  const password = `OnHand-test-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, display_name: `Test ${role}` },
  });
  assert.ifError(error);
  const api = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false },
  });
  const login = await api.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const u = { id: data.user!.id, api, role };
  users.push(u);
  return u;
}
async function action(
  u: (typeof users)[number],
  name: string,
  payload: Record<string, unknown>,
  key = randomUUID(),
) {
  return u.api.rpc("marketplace_action", {
    p_action: name,
    p_payload: payload,
    p_key: key,
  });
}
try {
  const customer = await user("customer"),
    other = await user("customer"),
    w1 = await user("worker"),
    w2 = await user("worker");
  await check(
    "signup creates immutable role and private settings",
    async () => {
      const { data, error } = await customer.api.rpc("marketplace_home");
      assert.ifError(error);
      assert.equal(data.profile.role, "customer");
      assert.ok(data.settings);
      const update = await customer.api
        .from("profiles")
        .update({ role: "worker" })
        .eq("id", customer.id);
      assert.ok(update.error);
    },
  );
  await check("anonymous clients cannot call marketplace RPCs", async () => {
    const anon = createClient(config.API_URL, config.ANON_KEY);
    assert.ok((await anon.rpc("marketplace_home")).error);
  });
  await check(
    "raw credentials and worker positions are inaccessible",
    async () => {
      for (const table of ["licenses", "worker_skills", "worker_locations"])
        assert.ok((await customer.api.from(table).select("*")).error);
    },
  );
  const address = await action(customer, "save_address", {
    street: "101 Local Test Street",
    city: "Brooklyn",
    zone: "NY",
    latitude: 40.71,
    longitude: -73.96,
  });
  assert.ifError(address.error);
  const draft = {
    address_id: address.data.id,
    title: "Assemble a bookshelf",
    description: "Put together a flat pack bookshelf in my living room.",
    skill: "assembly.furniture",
    offer_cents: 15000,
    duration_minutes: 60,
    urgency: "today",
  };
  await check("cross-account address spoofing is rejected", async () => {
    assert.ok((await action(other, "create_job", draft)).error);
  });
  for (const w of [w1, w2]) {
    assert.ifError(
      (
        await action(w, "worker_setup", {
          skills: ["assembly.furniture"],
          minimum_pay_cents: 5000,
          service_radius_m: 10000,
          bio: "Test worker",
        })
      ).error,
    );
    await db.query(
      "update public.workers set account_standing='good',identity_verified=true where id=$1",
      [w.id],
    );
    assert.ifError(
      (
        await action(w, "availability", {
          available: true,
          latitude: 40.711,
          longitude: -73.961,
        })
      ).error,
    );
  }
  let jobId = "";
  await check(
    "job creation dispatches to eligible workers and retries exactly once",
    async () => {
      const key = randomUUID();
      const first = await action(customer, "create_job", draft, key);
      assert.ifError(first.error);
      jobId = first.data.id;
      const repeated = await action(customer, "create_job", draft, key);
      assert.ifError(repeated.error);
      assert.equal(repeated.data.id, jobId);
      assert.ok(
        (
          await action(
            customer,
            "create_job",
            { ...draft, offer_cents: 16000 },
            key,
          )
        ).error,
      );
      const result = await db.query(
        "select count(*)::int as n from public.job_offers where job_id=$1",
        [jobId],
      );
      assert.equal(result.rows[0].n, 2);
    },
  );
  await check(
    "offers expose only approximate location; other customers see nothing",
    async () => {
      const workerHome = await w1.api.rpc("marketplace_home");
      assert.ifError(workerHome.error);
      const offer = workerHome.data.offers.find((o: any) => o.job.id === jobId);
      assert.ok(offer);
      assert.equal(offer.job.address, null);
      assert.equal(
        (await w1.api.from("job_private").select("*").eq("job_id", jobId)).data!
          .length,
        0,
      );
      assert.ok(
        (await other.api.rpc("marketplace_job", { p_job: jobId })).error,
      );
    },
  );
  await check(
    "simultaneous acceptance assigns exactly one worker",
    async () => {
      const offers = await db.query(
        "select id,worker_id from public.job_offers where job_id=$1",
        [jobId],
      );
      const results = await Promise.all(
        offers.rows.map((o) =>
          action(
            users.find((u) => u.id === o.worker_id)!,
            "accept_offer",
            { offer_id: o.id },
          ),
        ),
      );
      assert.equal(results.filter((r) => !r.error).length, 1);
      const matches = await db.query(
        "select count(*)::int as n from public.matches where job_id=$1",
        [jobId],
      );
      assert.equal(matches.rows[0].n, 1);
    },
  );
  const assigned = (
    await db.query("select worker_id from public.jobs where id=$1", [jobId])
  ).rows[0].worker_id;
  const winner = users.find((u) => u.id === assigned)!;
  const loser = users.find((u) => u.role === "worker" && u.id !== assigned)!;
  await check(
    "assigned worker receives address, losing worker cannot inspect the job",
    async () => {
      const result = await winner.api.rpc("marketplace_job", { p_job: jobId });
      assert.ifError(result.error);
      assert.equal(result.data.job.address.street, "101 Local Test Street");
      assert.ok(
        (await loser.api.rpc("marketplace_job", { p_job: jobId })).error,
      );
    },
  );
  await check(
    "worker cannot depart without payment; customer cannot fake worker progress",
    async () => {
      assert.ok(
        (
          await action(winner, "advance", {
            job_id: jobId,
            status: "worker_en_route",
          })
        ).error,
      );
      assert.ok(
        (
          await action(customer, "advance", {
            job_id: jobId,
            status: "worker_en_route",
          })
        ).error,
      );
      assert.ok(
        (await action(customer, "approve_completion", { job_id: jobId })).error,
      );
    },
  );
  await check(
    "chat retries do not duplicate messages and outsiders cannot send",
    async () => {
      const key = randomUUID();
      const payload = {
        job_id: jobId,
        body: "Hello, can you bring your tools?",
      };
      assert.ifError(
        (await action(customer, "send_message", payload, key)).error,
      );
      assert.ifError(
        (await action(customer, "send_message", payload, key)).error,
      );
      const count = await db.query(
        "select count(*)::int as n from public.messages where job_id=$1",
        [jobId],
      );
      assert.equal(count.rows[0].n, 1);
      assert.ok((await action(other, "send_message", payload)).error);
    },
  );
  await check(
    "server payment events are authoritative and completion cannot be skipped",
    async () => {
      await db.query(
        "insert into public.payments(job_id,stripe_intent_id,amount_cents,fee_cents,state) values($1,$2,15000,2250,'authorized')",
        [jobId, `pi_local_${randomUUID()}`],
      );
      for (const status of [
        "worker_en_route",
        "worker_arrived",
        "in_progress",
        "awaiting_completion_confirmation",
      ])
        assert.ifError(
          (await action(winner, "advance", { job_id: jobId, status })).error,
        );
      assert.ifError(
        (await action(customer, "approve_completion", { job_id: jobId })).error,
      );
      const j = await customer.api.rpc("marketplace_job", { p_job: jobId });
      assert.equal(j.data.job.status, "awaiting_completion_confirmation");
      assert.ok(j.data.job.payment_approved_at);
    },
  );
  await check("rate limits reject excess successful mutations", async () => {
    let failures = 0;
    for (let i = 0; i < 35; i++)
      if ((await action(other, "profile", { name: "Test name" })).error)
        failures++;
    assert.ok(failures >= 5);
  });
  await check(
    "DB locks prevent the same worker accepting two jobs",
    async () => {
      const first = await action(customer, "create_job", draft);
      const second = await action(customer, "create_job", draft);
      assert.ifError(first.error);
      assert.ifError(second.error);
      const rows = await db.query(
        "select id from public.job_offers where worker_id=$1 and job_id=any($2::uuid[])",
        [loser.id, [first.data.id, second.data.id]],
      );
      assert.equal(rows.rows.length, 2);
      const outcomes = await Promise.all(
        rows.rows.map((o) => action(loser, "accept_offer", { offer_id: o.id })),
      );
      assert.equal(outcomes.filter((o) => !o.error).length, 1);
    },
  );
  console.log(
    `${passed} database integration checks passed against PostgreSQL ${(await db.query("show server_version")).rows[0].server_version}`,
  );
} finally {
  await db.end();
}
