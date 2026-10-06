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
async function media(
  u: (typeof users)[number],
  job: string,
  bytes: Buffer,
  key = randomUUID(),
  mime = "image/png",
) {
  const token = (await u.api.auth.getSession()).data.session!.access_token;
  const response = await fetch(`${config.API_URL}/functions/v1/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
      "x-job-id": job,
      "x-photo-id": key,
    },
    body: bytes,
  });
  const result = await response.json();
  return {
    error: response.ok ? null : new Error(result.error),
    path: result.path as string,
    status: response.status,
  };
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
      "update public.workers set account_standing='good',identity_verified=true,payouts_ready=true where id=$1",
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
  await db.query(
    "insert into public.blocked_pairs(customer_id,worker_id) select $1,id from public.workers where id<>all($2::uuid[]) on conflict do nothing",
    [customer.id, [w1.id, w2.id]],
  );
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
      assert.equal("score" in offer, false);
      assert.equal("reasons" in offer, false);
      assert.equal(offer.distance_m % 1000, 0);
      assert.equal(offer.eta_seconds % 300, 0);
      assert.ok(
        (await w1.api.from("job_offers").select("score,distance_m")).error,
      );
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
    "Realtime offer updates redact precise matching columns",
    async () => {
      let resolveChange: (value: any) => void = () => {};
      const changed = new Promise<any>((resolve, reject) => {
        resolveChange = resolve;
        const timeout = setTimeout(
          () => reject(new Error("Realtime update did not arrive")),
          10000,
        );
        void new Promise<void>((resolve) => {
          const original = resolveChange;
          resolveChange = (value) => {
            clearTimeout(timeout);
            original(value);
            resolve();
          };
        });
      });
      const channel = w1.api
        .channel(`privacy-${randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "job_offers",
            filter: `worker_id=eq.${w1.id}`,
          },
          resolveChange,
        );
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Realtime subscription unavailable")),
          10000,
        );
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR") {
            clearTimeout(timer);
            reject(new Error("Realtime subscription rejected"));
          }
        });
      });
      await db.query(
        "update public.job_offers set score=score+0.000001 where job_id=$1 and worker_id=$2",
        [jobId, w1.id],
      );
      const event = await changed;
      assert.equal(event.new.job_id, jobId);
      assert.equal("score" in event.new, false);
      assert.equal("distance_m" in event.new, false);
      await w1.api.removeChannel(channel);
    },
  );
  await check(
    "private photo storage rejects outsiders and forged attachment metadata",
    async () => {
      const path = `${jobId}/${randomUUID()}.png`;
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      );
      assert.ok(
        (
          await other.api.storage
            .from("job-photos")
            .upload(path, bytes, { contentType: "image/png" })
        ).error,
      );
      assert.ok(
        (
          await action(customer, "register_photo", {
            job_id: jobId,
            path,
            kind: "before",
          })
        ).error,
      );
      assert.ok(
        (
          await customer.api.storage
            .from("job-photos")
            .upload(path, bytes, { contentType: "image/png" })
        ).error,
      );
      assert.ok(
        (
          await customer.api.storage
            .from("job-photos")
            .createSignedUploadUrl(path)
        ).error,
      );
      assert.ok((await media(other, jobId, bytes)).error);
      assert.ifError(
        (await media(customer, jobId, bytes, path.split("/")[1].split(".")[0]))
          .error,
      );
      assert.ifError(
        (
          await action(customer, "register_photo", {
            job_id: jobId,
            path,
            kind: "before",
          })
        ).error,
      );
      assert.ok(
        (await other.api.storage.from("job-photos").createSignedUrl(path, 60))
          .error,
      );
      assert.ok(
        (await w1.api.storage.from("job-photos").createSignedUrl(path, 60))
          .error,
      );
      assert.ifError(
        (
          await customer.api.storage
            .from("job-photos")
            .createSignedUrl(path, 60)
        ).error,
      );
    },
  );
  await check(
    "media admission checks content, retries and concurrent upload quotas",
    async () => {
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      );
      const key = randomUUID();
      const first = await media(customer, jobId, bytes, key);
      assert.ifError(first.error);
      assert.ok(
        (
          await customer.api.rpc("reserve_media", {
            p_actor: customer.id,
            p_job: jobId,
            p_key: randomUUID(),
            p_mime: "image/png",
            p_bytes: bytes.length,
            p_hash: "a".repeat(64),
          })
        ).error,
      );
      const invoked = await customer.api.functions.invoke("media", {
        body: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        headers: {
          "Content-Type": "image/png",
          "x-job-id": jobId,
          "x-photo-id": key,
        },
      });
      assert.ifError(invoked.error);
      assert.equal(invoked.data.path, first.path);
      assert.equal((await media(customer, jobId, bytes, key)).path, first.path);
      assert.ok(
        (await media(customer, jobId, Buffer.from("not an image"))).error,
      );
      const changed = Buffer.from(bytes);
      changed[changed.length - 1] ^= 1;
      assert.ok((await media(customer, jobId, changed, key)).error);
      const huge = Buffer.from(bytes);
      huge.writeUInt32BE(100000, 16);
      assert.ok((await media(customer, jobId, huge)).error);
      const outcomes = await Promise.all(
        Array.from({ length: 26 }, () => media(customer, jobId, bytes)),
      );
      assert.equal(outcomes.filter((result) => !result.error).length, 22);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from private.media_uploads where job_id=$1",
            [jobId],
          )
        ).rows[0].n,
        24,
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
  await check(
    "capture events commit once with the approved amount and one payout",
    async () => {
      const payment = (
        await db.query("select * from public.payments where job_id=$1", [jobId])
      ).rows[0];
      const event = `evt_${randomUUID()}`;
      const args = [
        event,
        "payment_intent.succeeded",
        payment.stripe_intent_id,
        15000,
        "captured",
      ];
      await db.query("select public.apply_stripe_event($1,$2,$3,$4,$5)", args);
      await db.query("select public.apply_stripe_event($1,$2,$3,$4,$5)", args);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.payouts where payment_id=$1",
            [payment.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (await db.query("select status from public.jobs where id=$1", [jobId]))
          .rows[0].status,
        "completed",
      );
      assert.ok(
        (
          await action(customer, "review", {
            job_id: jobId,
            overall: 5,
            quality: 5,
            communication: 5,
            punctuality: 5,
            note: "Good work",
          })
        ).error === null,
      );
      assert.ok(
        (
          await action(customer, "review", {
            job_id: jobId,
            overall: 5,
            quality: 5,
            communication: 5,
            punctuality: 5,
          })
        ).error,
      );
    },
  );
  await check(
    "agreement edits after assignment are rejected even for service writes",
    async () => {
      await assert.rejects(() =>
        db.query("update public.jobs set offer_cents=16000 where id=$1", [
          jobId,
        ]),
      );
    },
  );
  await check(
    "support refund reverses earnings and requires a matching financial resolution",
    async () => {
      const payment = (
        await db.query("select * from public.payments where job_id=$1", [jobId])
      ).rows[0];
      await db.query("select public.open_dispute($1,$2)", [
        jobId,
        "Local test support review",
      ]);
      await db.query("select public.record_full_refund($1,$2,$3)", [
        payment.stripe_intent_id,
        `refund_${randomUUID()}`,
        15000,
      ]);
      assert.equal(
        (
          await db.query(
            "select state from public.payouts where payment_id=$1",
            [payment.id],
          )
        ).rows[0].state,
        "reversed",
      );
      await db.query("select public.resolve_dispute($1,$2,$3)", [
        jobId,
        "cancelled",
        "Full refund verified in local test",
      ]);
      const workerJob = await winner.api.rpc("marketplace_job", {
        p_job: jobId,
      });
      assert.ifError(workerJob.error);
      assert.equal(workerJob.data.job.address, null);
      assert.equal(
        (await winner.api.from("job_private").select("*").eq("job_id", jobId))
          .data!.length,
        0,
      );
    },
  );
  await check(
    "deletion cannot race a new request into a deleted account",
    async () => {
      const deleting = await user("customer");
      const saved = await action(deleting, "save_address", {
        street: "201 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      assert.ifError(saved.error);
      const outcomes = await Promise.allSettled([
        db.query("select public.erase_account($1)", [deleting.id]),
        action(deleting, "create_job", { ...draft, address_id: saved.data.id }),
      ]);
      const removed = (
        await db.query("select deleted_at from public.profiles where id=$1", [
          deleting.id,
        ])
      ).rows[0].deleted_at;
      const count = (
        await db.query(
          "select count(*)::int as n from public.jobs where customer_id=$1 and status not in ('completed','cancelled')",
          [deleting.id],
        )
      ).rows[0].n;
      assert.ok(!(removed && count > 0));
      assert.ok(outcomes.length === 2);
    },
  );
  await check(
    "Edge payment and account endpoints reject anonymous requests",
    async () => {
      for (const endpoint of ["payments", "account", "connect"]) {
        const response = await fetch(
          `${config.API_URL}/functions/v1/${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: config.ANON_KEY,
            },
            body: "{}",
          },
        );
        assert.equal(response.status, 401);
      }
    },
  );
  await check(
    "concurrent bursts cap each worker at three pending offers",
    async () => {
      const requester = await user("customer"),
        workers = [await user("worker"), await user("worker")];
      const saved = await action(requester, "save_address", {
        street: "301 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      assert.ifError(saved.error);
      for (const w of workers) {
        assert.ifError(
          (
            await action(w, "worker_setup", {
              skills: ["assembly.furniture"],
              minimum_pay_cents: 5000,
              service_radius_m: 10000,
              bio: "Burst fixture",
            })
          ).error,
        );
        await db.query(
          "update public.workers set account_standing='good',identity_verified=true,payouts_ready=true where id=$1",
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
      await db.query(
        "insert into public.blocked_pairs(customer_id,worker_id) select $1,id from public.workers where id<>all($2::uuid[])",
        [requester.id, workers.map((w) => w.id)],
      );
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          action(requester, "create_job", {
            ...draft,
            address_id: saved.data.id,
            urgency: "now",
          }),
        ),
      );
      results.forEach((result) => assert.ifError(result.error));
      const pressure = await db.query(
        "select worker_id,count(*)::int as n,count(distinct slot)::int as slots from public.job_offers where worker_id=any($1::uuid[]) and state='pending' group by worker_id",
        [workers.map((w) => w.id)],
      );
      assert.equal(pressure.rows.length, 2);
      pressure.rows.forEach((row) => {
        assert.equal(row.n, 3);
        assert.equal(row.slots, 3);
      });
      const expiration = await db.query(
        "select min(extract(epoch from expires_at-created_at))::int as ttl from public.job_offers where worker_id=any($1::uuid[]) and state='pending'",
        [workers.map((w) => w.id)],
      );
      assert.equal(expiration.rows[0].ttl, 300);
      assert.ifError(
        (await action(workers[0], "profile", { name: "A changed identity" }))
          .error,
      );
      const verified = await db.query(
        "select identity_verified,available,account_standing from public.workers where id=$1",
        [workers[0].id],
      );
      assert.equal(verified.rows[0].identity_verified, false);
      assert.equal(verified.rows[0].available, false);
      assert.equal(verified.rows[0].account_standing, "pending");
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.job_offers where worker_id=$1 and state='pending'",
            [workers[0].id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "account endpoint deletes inactive accounts and protects active jobs",
    async () => {
      const disposable = await user("customer");
      const saved = await action(disposable, "save_address", {
        street: "401 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      assert.ifError(saved.error);
      const created = await action(disposable, "create_job", {
        ...draft,
        address_id: saved.data.id,
      });
      assert.ifError(created.error);
      const token = (await disposable.api.auth.getSession()).data.session!
        .access_token;
      const erase = () =>
        fetch(`${config.API_URL}/functions/v1/account`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "delete" }),
        });
      assert.equal((await erase()).status, 409);
      assert.ifError(
        (await action(disposable, "cancel", { job_id: created.data.id })).error,
      );
      const removed = await erase();
      assert.equal(removed.status, 200, await removed.text());
      assert.ok((await admin.auth.admin.getUserById(disposable.id)).error);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.saved_addresses where owner_id=$1",
            [disposable.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query("select title from public.jobs where id=$1", [
            created.data.id,
          ])
        ).rows[0].title,
        "Removed job",
      );
    },
  );
  await check(
    "account deletion removes orphaned uploads and immediately rejects stale JWTs",
    async () => {
      const disposable = await user("customer");
      const saved = await action(disposable, "save_address", {
        street: "701 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      const created = await action(disposable, "create_job", {
        ...draft,
        address_id: saved.data.id,
      });
      assert.ifError(created.error);
      const path = `${created.data.id}/${randomUUID()}.png`;
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      );
      assert.ifError(
        (
          await media(
            disposable,
            created.data.id,
            bytes,
            path.split("/")[1].split(".")[0],
          )
        ).error,
      );
      assert.ifError(
        (await action(disposable, "cancel", { job_id: created.data.id })).error,
      );
      const token = (await disposable.api.auth.getSession()).data.session!
        .access_token;
      const erased = await fetch(`${config.API_URL}/functions/v1/account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete" }),
      });
      assert.equal(erased.status, 200, await erased.text());
      assert.ok((await admin.auth.admin.getUserById(disposable.id)).error);
      assert.equal(
        (await disposable.api.from("jobs").select("id")).data!.length,
        0,
      );
      assert.equal(
        (await disposable.api.from("profiles").select("id")).data!.length,
        0,
      );
      assert.ok(
        (
          await disposable.api.storage
            .from("job-photos")
            .upload(`${created.data.id}/${randomUUID()}.png`, bytes, {
              contentType: "image/png",
            })
        ).error,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from storage.objects where bucket_id='job-photos' and name=$1",
            [path],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "Edge ingress rejects foreign origins, invalid tokens and unsigned webhooks",
    async () => {
      const endpoint = `${config.API_URL}/functions/v1/payments`;
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: {
              Origin: "https://attacker.example",
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: "Bearer invalid",
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(`${config.API_URL}/functions/v1/operations`, {
            method: "POST",
            body: "{}",
          })
        ).status,
        401,
      );
      const webhook = await fetch(
        `${config.API_URL}/functions/v1/stripe-webhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      assert.ok([400, 401, 503].includes(webhook.status));
    },
  );
  await check(
    "operator reviews are audited, private and separate from payout readiness",
    async () => {
      const candidate = await user("worker");
      const input = {
        p_worker: candidate.id,
        p_approved: true,
        p_insured: false,
        p_operator: "Local test operator",
        p_note: "Synthetic identity evidence checked in test",
      };
      assert.ok((await candidate.api.rpc("review_worker", input)).error);
      assert.ifError((await admin.rpc("review_worker", input)).error);
      const home = await candidate.api.rpc("marketplace_home");
      assert.equal(home.data.worker.identity_verified, true);
      assert.equal(home.data.worker.payouts_ready, false);
      assert.ok(
        (
          await action(candidate, "availability", {
            available: true,
            latitude: 40.71,
            longitude: -73.96,
          })
        ).error,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from private.worker_reviews where worker_id=$1",
            [candidate.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "scheduled regulated work checks credentials at current time if the appointment is late",
    async () => {
      const requester = await user("customer"),
        specialist = await user("worker");
      const saved = await action(requester, "save_address", {
        street: "501 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      assert.ifError(saved.error);
      assert.ifError(
        (
          await action(specialist, "worker_setup", {
            skills: ["electrical.fixture"],
            minimum_pay_cents: 5000,
            service_radius_m: 10000,
            bio: "Scheduled fixture",
          })
        ).error,
      );
      await db.query(
        "update public.workers set account_standing='good',identity_verified=true,payouts_ready=true where id=$1",
        [specialist.id],
      );
      assert.ifError(
        (
          await action(specialist, "availability", {
            available: true,
            latitude: 40.711,
            longitude: -73.961,
          })
        ).error,
      );
      await db.query(
        "insert into public.blocked_pairs(customer_id,worker_id) select $1,id from public.workers where id<>$2",
        [requester.id, specialist.id],
      );
      const geometry = {
        type: "Polygon",
        coordinates: [
          [
            [-73.98, 40.69],
            [-73.94, 40.69],
            [-73.94, 40.73],
            [-73.98, 40.73],
            [-73.98, 40.69],
          ],
        ],
      };
      assert.ifError(
        (
          await admin.rpc("configure_service_region", {
            p_zone: "NY",
            p_geometry: geometry,
            p_operator: "Local test operator",
            p_note:
              "Synthetic Brooklyn fixture region, not production coverage",
          })
        ).error,
      );
      const wrong = await action(requester, "save_address", {
        street: "601 Local Street",
        city: "Elsewhere",
        zone: "NY",
        latitude: 34.05,
        longitude: -118.24,
      });
      assert.ifError(wrong.error);
      assert.equal(
        (
          await requester.api.rpc("licensed_address_available", {
            p_address: wrong.data.id,
          })
        ).data,
        false,
      );
      assert.ok(
        (
          await action(requester, "create_job", {
            ...draft,
            address_id: wrong.data.id,
            skill: "electrical.fixture",
          })
        ).error,
      );
      const scheduled = await action(requester, "create_job", {
        ...draft,
        address_id: saved.data.id,
        skill: "electrical.fixture",
        urgency: "scheduled",
        scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      });
      assert.ifError(scheduled.error);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.job_offers where job_id=$1",
            [scheduled.data.id],
          )
        ).rows[0].n,
        0,
      );
      await db.query(
        "update public.jobs set scheduled_at=now()-interval '2 days' where id=$1",
        [scheduled.data.id],
      );
      await db.query(
        "insert into public.licenses(worker_id,skill,jurisdiction,verified,expires_at) values($1,'electrical.fixture','NY',true,now()-interval '1 hour')",
        [specialist.id],
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from private.ranked_candidates($1)",
            [scheduled.data.id],
          )
        ).rows[0].n,
        0,
      );
      assert.ifError(
        (
          await admin.rpc("review_license", {
            p_worker: specialist.id,
            p_skill: "electrical.fixture",
            p_zone: "NY",
            p_expires: new Date(Date.now() + 7 * 86400000).toISOString(),
            p_operator: "Local test operator",
            p_note: "Synthetic renewal checked in test",
          })
        ).error,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from private.ranked_candidates($1)",
            [scheduled.data.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "logout revokes raw-table, command and Edge access for a retained JWT",
    async () => {
      const signed = await user("customer");
      const token = (await signed.api.auth.getSession()).data.session!
        .access_token;
      assert.ifError((await signed.api.auth.signOut({ scope: "local" })).error);
      const retained = createClient(config.API_URL, config.ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const rows = await retained.from("profiles").select("id");
      assert.ifError(rows.error);
      assert.deepEqual(rows.data, []);
      assert.ok((await retained.rpc("marketplace_home")).error);
      const endpoint = await fetch(`${config.API_URL}/functions/v1/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(endpoint.status, 401);
    },
  );
  await check(
    "media reservation budget caps a customer's daily uploads across jobs",
    async () => {
      const requester = await user("customer");
      const address = await action(requester, "save_address", {
        street: "801 Local Street",
        city: "Brooklyn",
        zone: "NY",
        latitude: 40.71,
        longitude: -73.96,
      });
      assert.ifError(address.error);
      const jobs: string[] = [];
      for (let i = 0; i < 5; i++) {
        const created = await action(requester, "create_job", {
          ...draft,
          address_id: address.data.id,
        });
        assert.ifError(created.error);
        jobs.push(created.data.id);
      }
      for (let i = 0; i < 100; i++)
        assert.ifError(
          (
            await admin.rpc("reserve_media", {
              p_actor: requester.id,
              p_job: jobs[Math.min(4, Math.floor(i / 24))],
              p_key: randomUUID(),
              p_mime: "image/png",
              p_bytes: 69,
              p_hash: "a".repeat(64),
            })
          ).error,
        );
      assert.ok(
        (
          await admin.rpc("reserve_media", {
            p_actor: requester.id,
            p_job: jobs[4],
            p_key: randomUUID(),
            p_mime: "image/png",
            p_bytes: 69,
            p_hash: "a".repeat(64),
          })
        ).error,
      );
    },
  );
  console.log(
    `${passed} database integration checks passed against PostgreSQL ${(await db.query("show server_version")).rows[0].server_version}`,
  );
} finally {
  await Promise.all(users.map((user) => user.api.removeAllChannels()));
  await db.end();
}
