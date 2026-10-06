import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (
  !/^postgresql:\/\/postgres:postgres@(127\.0\.0\.1|localhost):/.test(
    config.DB_URL,
  )
)
  throw new Error("Load fixture is local only");
const db = new Client({ connectionString: config.DB_URL });
await db.connect();
const customer = randomUUID();
const job = randomUUID();
const population = 5000;
try {
  await db.query("BEGIN");
  await db.query("set local statement_timeout='20s'");
  await db.query(
    "create temporary table benchmark_workers(id uuid primary key,i integer) on commit drop",
  );
  await db.query(
    "insert into benchmark_workers select gen_random_uuid(),generate_series(1,$1)",
    [population],
  );
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) select id,'load-'||id||'@example.invalid',jsonb_build_object('role','worker','display_name','Load fixture') from benchmark_workers",
  );
  await db.query(
    "update public.workers w set account_standing='good',identity_verified=true,payouts_ready=true,available=true,minimum_pay_cents=5000 from benchmark_workers b where w.id=b.id",
  );
  await db.query(
    "insert into public.worker_locations(worker_id,position) select id,extensions.st_setsrid(extensions.st_makepoint(-73.96+(i%100)*0.001,40.71+(i/100)*0.001),4326)::extensions.geography from benchmark_workers",
  );
  await db.query(
    "insert into public.worker_skills(worker_id,skill,confidence) select id,'assembly.furniture',0.8 from benchmark_workers",
  );
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,jsonb_build_object('role','customer','display_name','Load customer'))",
    [customer, `load-${customer}@example.invalid`],
  );
  await db.query(
    "insert into public.jobs(id,customer_id,title,description,skill,category,status,approximate_zone,offer_cents,duration_minutes,urgency) values($1,$2,'Load fixture job','Synthetic SQL benchmark only','assembly.furniture','Assembly','matching','NY',15000,60,'today')",
    [job, customer],
  );
  await db.query(
    "insert into public.job_private(job_id,street,city,position) values($1,'Local load fixture','Brooklyn',extensions.st_setsrid(extensions.st_makepoint(-73.96,40.71),4326)::extensions.geography)",
    [job],
  );
  await db.query("analyze public.worker_locations");
  await db.query("analyze public.worker_skills");
  await db.query("analyze public.workers");
  const timings: number[] = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    const result = await db.query(
      "select * from private.candidates($1) order by score desc,worker_id limit 12",
      [job],
    );
    if (result.rows.length !== 12)
      throw new Error("Candidate list was not complete");
    timings.push(performance.now() - start);
  }
  const plan = await db.query(
    "explain (analyze,buffers,format json) select * from private.candidates($1) order by score desc,worker_id limit 12",
    [job],
  );
  const start = performance.now();
  const dispatched = await db.query("select private.dispatch($1) as sent", [
    job,
  ]);
  const dispatchMs = performance.now() - start;
  timings.sort((a, b) => a - b);
  const report = {
    date: new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    }),
    population,
    iterations: timings.length,
    matching_ms: {
      p50: Number(timings[19].toFixed(2)),
      p95: Number(timings[37].toFixed(2)),
      max: Number(timings.at(-1)!.toFixed(2)),
    },
    dispatch_ms: Number(dispatchMs.toFixed(2)),
    offers_created: dispatched.rows[0].sent,
    limitations:
      "Local SQL benchmark with 5,000 synthetic workers, not an end-to-end concurrent-user capacity guarantee. Fixtures rolled back.",
  };
  writeFileSync("docs/LOAD_TEST.json", JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    "docs/LOAD_QUERY_PLAN.json",
    JSON.stringify(plan.rows[0]["QUERY PLAN"], null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
