import {
  validatePublicConfig,
  isPrivateHost,
} from "../src/services/public-config.ts";
import { readFileSync } from "node:fs";
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
const errors = [];
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const configurationError = validatePublicConfig(url, key, false);
if (configurationError) errors.push(configurationError);
if (url) {
  try {
    if (isPrivateHost(new URL(url).hostname))
      errors.push("Use a hosted database for release.");
  } catch {
    /* validatePublicConfig reports malformed endpoints. */
  }
}
if (process.env.EXPO_PUBLIC_LOCAL_BACKEND === "true")
  errors.push("Disable EXPO_PUBLIC_LOCAL_BACKEND for release.");
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "",
  )
)
  errors.push("Configure the support/privacy contact.");
if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_"))
  errors.push(
    "Live payment configuration is required for a money-taking public release. Use pk_test_ for preview testing.",
  );
if (!app.extra?.eas?.projectId)
  errors.push("Link the app to the operator’s EAS project.");
if (!app.ios?.bundleIdentifier || !app.android?.package)
  errors.push("Configure store bundle identifiers.");
if (errors.length) {
  console.error(
    "Release configuration is incomplete:\n" +
      errors.map((x, i) => `${i + 1}. ${x}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Release configuration checks passed. Hosted integration, provider tests, device QA, signed builds and store review are separate gates.",
  );
