import { rpc } from "../_shared/server.ts";
import { paymentProvider, syncIntent } from "../_shared/payments.ts";
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return new Response("Too large", { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 262144) return new Response("Too large", { status: 413 });
    const signature = request.headers.get("stripe-signature");
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!signature || !secret)
      return new Response("Signature required", { status: 400 });
    const stripe = paymentProvider();
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        text,
        signature,
        secret,
      );
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }
    if (event.type.startsWith("payout.") && event.account) {
      const stripePayout = event.data.object as { id: string };
      const payout = await stripe.payouts.retrieve(stripePayout.id, {
        stripeAccount: event.account,
      });
      await rpc("record_bank_payout", {
        p_account: event.account,
        p_id: payout.id,
        p_amount: payout.amount,
        p_currency: payout.currency,
        p_status: payout.status,
        p_arrival: new Date(payout.arrival_date * 1000).toISOString(),
        p_failure: payout.failure_code,
      });
    } else if (event.type === "account.updated") {
      const account = event.data.object as {
        id: string;
        metadata: Record<string, string>;
        charges_enabled: boolean;
        payouts_enabled: boolean;
      };
      if (account.metadata.worker_id)
        await rpc("update_payout_readiness", {
          p_worker: account.metadata.worker_id,
          p_account: account.id,
          p_ready: account.charges_enabled && account.payouts_enabled,
        });
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        currency: string;
        amount: number;
        amount_refunded: number;
        payment_intent: string | null;
      };
      if (
        charge.currency === "usd" &&
        charge.amount === charge.amount_refunded &&
        charge.payment_intent
      )
        await rpc("record_full_refund", {
          p_intent: charge.payment_intent,
          p_event: event.id,
          p_amount: charge.amount,
        });
    } else if (event.type.startsWith("payment_intent.")) {
      const intent = event.data.object as { id: string };
      await syncIntent(stripe, intent.id, event.id);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as { payment_intent: string | null };
      if (session.payment_intent)
        await syncIntent(stripe, session.payment_intent, event.id);
    }
    return new Response("OK");
  } catch {
    return new Response("Retry later", { status: 500 });
  }
});
