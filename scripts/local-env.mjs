import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.API_URL))
  throw new Error("This helper is restricted to local Supabase");
if (existsSync(".env.local") && !process.argv.includes("--replace"))
  throw new Error(
    ".env.local already exists. Pass --replace to replace the local development configuration.",
  );
writeFileSync(
  ".env.local",
  `EXPO_PUBLIC_SUPABASE_URL=${config.API_URL}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${config.ANON_KEY}\nEXPO_PUBLIC_LOCAL_BACKEND=true\n`,
);
writeFileSync(
  "supabase/.env.local",
  "ONHAND_LOCAL_TESTS=true\nPAYMENTS_MODE=disabled\nAPP_ORIGIN=http://localhost:8081\nOPERATIONS_SECRET=onhand-local-operations-only\n",
);
console.log(
  "Local app and Edge Function configuration written. No hosted service or paid provider enabled.",
);
