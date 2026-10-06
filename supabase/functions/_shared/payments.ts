import Stripe from "npm:stripe@18.5.0";
import { db, localTests, rpc } from "./server.ts";
interface Plan {
  job: {
    id: string;
    customer_id: string;
    offer_cents: number;
    title: string;
    status: string;
  };
  payment: { stripe_intent_id: string; state: string } | null;
  operation: {
    operation_id: string;
    provider_id: string | null;
    provider_url: string | null;
    expires_at: string | null;
  };
  destination: string | null;
  fee_cents: number;
}
export function paymentProvider() {
  const mode = Deno.env.get("PAYMENTS_MODE") || "disabled";
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (mode === "disabled" || !secret)
    throw new Error("Payments are not configured yet.");
  if (
    (mode === "test" && !secret.startsWith("sk_test_")) ||
    (mode === "live" && !secret.startsWith("sk_live_")) ||
    !["test", "live"].includes(mode)
  )
    throw new Error("Payment mode and provider key do not match.");
  return new Stripe(secret, { maxNetworkRetries: 2, timeout: 15000 });
}
export async function syncIntent(
  stripe: Stripe,
  intentId: string,
  eventId?: string,
) {
  const intent = await stripe.paymentIntents.retrieve(intentId);
  await rpc("mark_reconciled", { p_provider: intentId });
  if (!/^[0-9a-f-]{36}$/.test(intent.metadata.job_id || "")) return;
  const state =
    intent.status === "requires_capture"
      ? "authorized"
      : intent.status === "succeeded"
        ? "captured"
        : intent.status === "canceled"
          ? "cancelled"
          : null;
  if (!state) return;
  if (intent.currency !== "usd") throw new Error("Payment currency mismatch");
  await rpc("record_payment", {
    p_job: intent.metadata.job_id,
    p_intent: intent.id,
    p_amount: intent.amount,
    p_currency: intent.currency,
    p_state: "pending",
  });
  await rpc("apply_stripe_event", {
    p_event: eventId || `reconcile:${intent.id}:${intent.status}`,
    p_type: "provider_reconciliation",
    p_intent: intent.id,
    p_amount: intent.amount,
    p_state: state,
  });
}
export async function localPayment(
  actor: string,
  jobId: string,
  action: string,
) {
  if (!localTests) throw new Error("Local payment tests unavailable");
  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("customer_id", actor)
    .single();
  if (error || !job) throw new Error("Job unavailable");
  const { data: payment } = await db
    .from("payments")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  if (["authorize", "checkout"].includes(action)) {
    if (job.status !== "matched") throw new Error("A match is required");
    await rpc("record_payment", {
      p_job: jobId,
      p_intent: `pi_local_${jobId}`,
      p_amount: job.offer_cents,
      p_currency: "usd",
      p_state: "pending",
    });
    await rpc("apply_stripe_event", {
      p_event: `local-authorize:${jobId}`,
      p_type: "local_fixture",
      p_intent: `pi_local_${jobId}`,
      p_amount: job.offer_cents,
      p_state: "authorized",
    });
    return { mode: "local", status: "authorized" };
  }
  if (action === "capture") {
    if (!payment) throw new Error("Authorize the payment first");
    await rpc("apply_stripe_event", {
      p_event: `local-capture:${jobId}`,
      p_type: "local_fixture",
      p_intent: payment.stripe_intent_id,
      p_amount: job.offer_cents,
      p_state: "captured",
    });
    return { mode: "local", status: "captured" };
  }
  if (action === "cancel" && payment) {
    await rpc("apply_stripe_event", {
      p_event: `local-cancel:${jobId}`,
      p_type: "local_fixture",
      p_intent: payment.stripe_intent_id,
      p_amount: job.offer_cents,
      p_state: "cancelled",
    });
  }
  return { mode: "local", status: "cancelled" };
}
export async function processPayment(
  actor: string,
  jobId: string,
  action: string,
) {
  if (!["authorize", "checkout", "capture", "cancel"].includes(action))
    throw new Error("Unsupported action");
  if (localTests) return localPayment(actor, jobId, action);
  const stripe = paymentProvider();
  const plan = await rpc<Plan>("payment_plan", {
    p_actor: actor,
    p_job: jobId,
    p_action: action,
  });
  const idempotencyKey = `onhand:${plan.operation.operation_id}`;
  if (["authorize", "checkout"].includes(action)) {
    const account = await stripe.accounts.retrieve(plan.destination!);
    if (!account.charges_enabled || !account.payouts_enabled)
      throw new Error("Worker payouts are not ready.");
  }

  if (action === "authorize") {
    const intent = plan.payment?.stripe_intent_id
      ? await stripe.paymentIntents.retrieve(plan.payment.stripe_intent_id)
      : await stripe.paymentIntents.create(
          {
            amount: plan.job.offer_cents,
            currency: "usd",
            capture_method: "manual",
            payment_method_types: ["card"],
            application_fee_amount: plan.fee_cents,
            transfer_data: { destination: plan.destination! },
            metadata: { job_id: jobId },
          },
          { idempotencyKey },
        );
    await rpc("record_payment", {
      p_job: jobId,
      p_intent: intent.id,
      p_amount: intent.amount,
      p_currency: intent.currency,
      p_state: "pending",
    });
    await rpc("record_payment_operation", {
      p_job: jobId,
      p_action: action,
      p_provider_id: intent.id,
    });
    await syncIntent(stripe, intent.id);
    return { clientSecret: intent.client_secret, status: intent.status };
  }
  if (action === "checkout") {
    const origin = Deno.env.get("APP_ORIGIN");
    if (!origin?.startsWith("https://"))
      throw new Error("Secure checkout origin is not configured");
    const session = plan.operation.provider_id
      ? await stripe.checkout.sessions.retrieve(plan.operation.provider_id)
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: plan.job.offer_cents,
                  product_data: { name: plan.job.title },
                },
                quantity: 1,
              },
            ],
            payment_intent_data: {
              capture_method: "manual",
              application_fee_amount: plan.fee_cents,
              transfer_data: { destination: plan.destination! },
              metadata: { job_id: jobId },
            },
            success_url: `${origin}/job?id=${jobId}`,
            cancel_url: `${origin}/job?id=${jobId}`,
            client_reference_id: jobId,
          },
          { idempotencyKey },
        );
    if (session.payment_intent) {
      const intentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent.id;
      await syncIntent(stripe, intentId);
    }
    await rpc("record_payment_operation", {
      p_job: jobId,
      p_action: action,
      p_provider_id: session.id,
      p_url: session.url,
      p_expires: new Date(session.expires_at * 1000).toISOString(),
    });
    if (session.status === "expired")
      throw new Error(
        "Checkout expired. Contact support to restart this payment.",
      );
    return { url: session.url, status: session.status };
  }
  if (!plan.payment) return { status: "no_payment" };
  let intent = await stripe.paymentIntents.retrieve(
    plan.payment.stripe_intent_id,
  );
  if (action === "capture" && intent.status === "requires_capture")
    intent = await stripe.paymentIntents.capture(
      intent.id,
      { amount_to_capture: plan.job.offer_cents },
      { idempotencyKey },
    );
  if (action === "cancel" && !["canceled", "succeeded"].includes(intent.status))
    intent = await stripe.paymentIntents.cancel(
      intent.id,
      {},
      { idempotencyKey },
    );
  await syncIntent(stripe, intent.id);
  return { status: intent.status };
}
