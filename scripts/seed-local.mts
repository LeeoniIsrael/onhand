import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.API_URL))
  throw new Error("Fixtures are restricted to local Supabase");
const api = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const db = new Client({ connectionString: config.DB_URL });
await db.connect();
const password = "LocalOnHand-2026!";
const fixtureWorkers: string[] = [];
let fixtureCustomer = "";
try {
  const { data: existing, error } = await api.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  for (const [email, name, role] of [
    ["customer@onhand.test", "Alex Morgan", "customer"],
    ["worker@onhand.test", "Sam Rivera", "worker"],
    ["worker2@onhand.test", "Jordan Lee", "worker"],
  ]) {
    let user = existing.users.find((u) => u.email === email);
    if (!user) {
      const result = await api.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, display_name: name },
      });
      if (result.error) throw result.error;
      user = result.data.user!;
    }
    await db.query(
      "insert into public.profiles(id,display_name,role) values($1,$2,$3) on conflict(id) do nothing",
      [user.id, name, role],
    );
    await db.query(
      "insert into public.account_settings(id) values($1) on conflict do nothing",
      [user.id],
    );
    if (role === "worker")
      await db.query(
        "insert into public.workers(id) values($1) on conflict do nothing",
        [user.id],
      );
    if (role === "worker") {
      fixtureWorkers.push(user.id);
      await db.query(
        "update public.workers set account_standing='good',identity_verified=true,payouts_ready=true,available=true,stripe_account_id='acct_local_fixture',minimum_pay_cents=2000 where id=$1",
        [user.id],
      );
      await db.query(
        "insert into public.worker_skills(worker_id,skill,confidence) values($1,'assembly.furniture',0.9),($1,'general.repair',0.9),($1,'mounting.tv',0.9),($1,'moving.help',0.8) on conflict do nothing",
        [user.id],
      );
      await db.query(
        "insert into public.worker_locations(worker_id,position) values($1,extensions.st_setsrid(extensions.st_makepoint(-73.96,40.71),4326)::extensions.geography) on conflict(worker_id) do update set position=excluded.position,updated_at=now()",
        [user.id],
      );
    } else {
      fixtureCustomer = user.id;
      const { rows } = await db.query(
        "select id from public.saved_addresses where owner_id=$1",
        [user.id],
      );
      if (!rows.length)
        await db.query(
          "insert into public.saved_addresses(owner_id,label,street,city,zone,latitude,longitude) values($1,'Local test address','101 Local Test Street','Brooklyn','NY',40.71,-73.96)",
          [user.id],
        );
    }
  }
  await db.query(
    "insert into public.blocked_pairs(customer_id,worker_id) select $1,id from public.workers where id<>all($2::uuid[]) on conflict do nothing",
    [fixtureCustomer, fixtureWorkers],
  );
  console.log(
    "Local fixtures ready: customer@onhand.test, worker@onhand.test, worker2@onhand.test. Password: LocalOnHand-2026! (local only).",
  );
} finally {
  await db.end();
}
