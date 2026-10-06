import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = process.env.ONHAND_OPERATOR_URL;
const key = process.env.ONHAND_OPERATOR_KEY;
if (!url || !key)
  throw new Error(
    "Set ONHAND_OPERATOR_URL and a server-only ONHAND_OPERATOR_KEY in a protected shell environment",
  );
const api = createClient(url, key, { auth: { persistSession: false } });
const [command, id, ...args] = process.argv.slice(2);
async function rpc(name: string, values: Record<string, unknown> = {}) {
  const { data, error } = await api.rpc(name, values);
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data ?? { ok: true }, null, 2));
}
if (command === "health") await rpc("health_snapshot");
else if (command === "workers") {
  const { data, error } = await api
    .from("workers")
    .select("id,identity_verified,payouts_ready,account_standing")
    .eq("account_standing", "pending")
    .limit(100);
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
} else if (command === "reports") {
  const { data, error } = await api
    .from("safety_reports")
    .select("id,job_id,body,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
} else if (
  command === "review-worker" &&
  ["approve", "suspend"].includes(args[0])
) {
  await rpc("review_worker", {
    p_worker: id,
    p_approved: args[0] === "approve",
    p_insured: args[1] === "insured",
    p_operator: args[2],
    p_note: args.slice(3).join(" "),
  });
} else if (command === "configure-region") {
  await rpc("configure_service_region", {
    p_zone: id,
    p_geometry: JSON.parse(readFileSync(args[0], "utf8")),
    p_operator: args[1],
    p_note: args.slice(2).join(" "),
  });
} else if (command === "review-license") {
  await rpc("review_license", {
    p_worker: id,
    p_skill: args[0],
    p_zone: args[1],
    p_expires: args[2],
    p_operator: args[3],
    p_note: args.slice(4).join(" "),
  });
} else if (command === "open-dispute") {
  await rpc("open_dispute", { p_job: id, p_note: args.join(" ") });
} else if (
  command === "resolve-dispute" &&
  ["completed", "cancelled"].includes(args[0])
) {
  await rpc("resolve_dispute", {
    p_job: id,
    p_resolution: args[0],
    p_note: args.slice(1).join(" "),
  });
} else
  throw new Error(
    "Use health | workers | reports | review-worker ID approve|suspend insured|uninsured OPERATOR NOTE | configure-region ZONE GEOJSON_FILE OPERATOR NOTE | review-license ID SKILL ZONE ISO_EXPIRY OPERATOR NOTE | open-dispute JOB NOTE | resolve-dispute JOB completed|cancelled NOTE",
  );
