import {
  authenticate,
  db,
  payload,
  preflight,
  publicError,
  reply,
} from "../_shared/server.ts";
import { paymentProvider } from "../_shared/payments.ts";
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  try {
    const actor = await authenticate(request);
    const body = await payload(request);
    if (body.action !== "onboarding")
      return reply(request, { error: "Unsupported action" }, 400);
    const { data: profile } = await db
      .from("profiles")
      .select("role,deleted_at")
      .eq("id", actor.id)
      .single();
    if (profile?.role !== "worker" || profile.deleted_at)
      return reply(request, { error: "Worker account required" }, 403);
    const { data: worker } = await db
      .from("workers")
      .select("stripe_account_id")
      .eq("id", actor.id)
      .single();
    const stripe = paymentProvider();
    let accountId = worker?.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "US",
          email: actor.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { worker_id: actor.id },
        },
        { idempotencyKey: `connect:${actor.id}` },
      );
      accountId = account.id;
      const { error } = await db
        .from("workers")
        .update({ stripe_account_id: accountId })
        .eq("id", actor.id);
      if (error) throw error;
    }
    const origin = Deno.env.get("APP_ORIGIN");
    if (!origin?.startsWith("https://"))
      throw new Error("Secure payout origin is not configured");
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/profile`,
      return_url: `${origin}/profile`,
      type: "account_onboarding",
    });
    return reply(request, { url: link.url });
  } catch (error) {
    const message = publicError(error);
    return reply(
      request,
      { error: message },
      message === "Authentication required" ? 401 : 409,
    );
  }
});
