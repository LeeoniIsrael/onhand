import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.API_URL))
  throw new Error(
    "Auth tests require local Supabase and its intercepted test mail",
  );
const api = createClient(config.API_URL, config.ANON_KEY, {
  auth: { persistSession: false },
});
const email = `auth-${randomUUID()}@onhand.test`;
const password = `Initial-${randomUUID()}`;
const mail = "http://127.0.0.1:54324";
async function code(subject: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const inbox = await (await fetch(`${mail}/api/v1/messages`)).json();
    const message = inbox.messages.find(
      (m: { Subject: string; To: { Address: string }[] }) =>
        m.Subject.includes(subject) && m.To.some((to) => to.Address === email),
    );
    if (message) {
      const content = await (
        await fetch(`${mail}/api/v1/message/${message.ID}`)
      ).json();
      const token = (content.HTML || content.Text).match(/\b\d{6,8}\b/)?.[0];
      assert.ok(token, "Email must contain a usable confirmation code");
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Local confirmation email did not arrive");
}
const signed = await api.auth.signUp({
  email,
  password,
  options: { data: { role: "worker", display_name: "Auth test worker" } },
});
assert.ifError(signed.error);
assert.ok(!signed.data.session, "Signup must require email verification");
assert.ok((await api.auth.signInWithPassword({ email, password })).error);
assert.ifError(
  (
    await api.auth.verifyOtp({
      email,
      token: await code("Confirm"),
      type: "email",
    })
  ).error,
);
const home = await api.rpc("marketplace_home");
assert.ifError(home.error);
assert.equal(home.data.profile.role, "worker");
assert.equal(home.data.worker.identity_verified, false);
console.log(
  "PASS email verification gates sign-in and creates an unverified worker",
);
await api.auth.signOut({ scope: "local" });
assert.ifError((await api.auth.resetPasswordForEmail(email)).error);
assert.ifError(
  (
    await api.auth.verifyOtp({
      email,
      token: await code("Recover"),
      type: "recovery",
    })
  ).error,
);
const replacement = `Replaced-${randomUUID()}`;
assert.ifError((await api.auth.updateUser({ password: replacement })).error);
await api.auth.signOut({ scope: "local" });
assert.ok((await api.auth.signInWithPassword({ email, password })).error);
assert.ifError(
  (await api.auth.signInWithPassword({ email, password: replacement })).error,
);
console.log(
  "PASS recovery code permits password replacement and invalidates the old password",
);
console.log(
  "2 local authentication integration checks passed; no external emails sent",
);
