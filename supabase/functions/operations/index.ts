import { notifyBatch, receiptBatch } from "../_shared/notifications.ts";
import { db, reply, rpc } from "../_shared/server.ts";
import {
  processPayment,
  paymentProvider,
  syncIntent,
} from "../_shared/payments.ts";
interface Outbox {
  id: string;
  topic: string;
  aggregate_id: string;
  payload: Record<string, string>;
}
Deno.serve(async (request) => {
  const secret = Deno.env.get("OPERATIONS_SECRET");
  if (
    request.method !== "POST" ||
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}`
  )
    return reply(request, { error: "Unauthorized" }, 401);
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "refund") {
      const plan = await rpc<{
        payment: { id: string; stripe_intent_id: string; amount_cents: number };
      }>("refund_plan", { p_job: body.jobId });
      const stripe = paymentProvider();
      const refund = await stripe.refunds.create(
        {
          payment_intent: plan.payment.stripe_intent_id,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `refund:${plan.payment.id}` },
      );
      if (refund.status === "succeeded")
        await rpc("record_full_refund", {
          p_intent: plan.payment.stripe_intent_id,
          p_event: `refund:${refund.id}`,
          p_amount: plan.payment.amount_cents,
        });
      return reply(request, { refund: refund.id, status: refund.status });
    }
    const dispatched = await rpc<number>("dispatch_tick", {});
    const events = await rpc<Outbox[]>("claim_outbox", { p_limit: 1000 });
    let handled = 0;
    async function handle(event: Outbox) {
      let error: string | null = null;
      try {
        if (
          event.topic === "capture_payment" ||
          event.topic === "cancel_payment"
        ) {
          const { data: job } = await db
            .from("jobs")
            .select("customer_id")
            .eq("id", event.aggregate_id)
            .single();
          if (job)
            await processPayment(
              job.customer_id,
              event.aggregate_id,
              event.topic === "capture_payment" ? "capture" : "cancel",
            );
        } else if (event.topic === "delete_account_media") {
          const { data: photos } = await db
            .from("job_photos")
            .select("storage_path")
            .eq("owner_id", event.aggregate_id)
            .limit(100);
          if (photos?.length) {
            const { error } = await db.storage
              .from("job-photos")
              .remove(photos.map((p) => p.storage_path));
            if (error) throw error;
            const { error: deleteError } = await db
              .from("job_photos")
              .delete()
              .eq("owner_id", event.aggregate_id)
              .in(
                "storage_path",
                photos.map((p) => p.storage_path),
              );
            if (deleteError) throw deleteError;
            if (photos.length === 100) {
              await rpc("continue_outbox", { p_id: event.id });
              handled++;
              return;
            }
          }
        } else throw new Error("Unsupported outbox event");
        handled++;
      } catch (e) {
        error = e instanceof Error ? e.message : "Operation failed";
      }
      await rpc("finish_outbox", { p_id: event.id, p_error: error });
    }
    const notifications = events.filter((e) =>
      ["offer_notification", "message_notification", "job_matched"].includes(
        e.topic,
      ),
    );
    await notifyBatch(notifications);
    handled += notifications.length;
    const receipts = events.filter((e) => e.topic === "push_receipt");
    await receiptBatch(receipts);
    handled += receipts.length;
    const operations = events.filter(
      (e) => !notifications.includes(e) && !receipts.includes(e),
    );
    for (let i = 0; i < operations.length; i += 10)
      await Promise.all(operations.slice(i, i + 10).map(handle));
    await rpc("cleanup_operations", {});
    if (
      !Deno.env.get("ONHAND_LOCAL_TESTS") &&
      ["test", "live"].includes(Deno.env.get("PAYMENTS_MODE") || "disabled")
    ) {
      const stripe = paymentProvider();
      const batch = await rpc<{ payments: string[]; checkouts: string[] }>(
        "reconciliation_batch",
        {},
      );
      for (const intent of batch.payments)
        try {
          await syncIntent(stripe, intent);
        } catch {}
      for (const id of batch.checkouts)
        try {
          const session = await stripe.checkout.sessions.retrieve(id);
          if (session.payment_intent) {
            await syncIntent(
              stripe,
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent.id,
            );
            await rpc("finish_checkout", { p_provider: id });
          } else if (session.status === "expired")
            await rpc("finish_checkout", { p_provider: id });
        } catch {}
    }
    return reply(request, {
      dispatched,
      handled,
      health: await rpc("health_snapshot", {}),
    });
  } catch {
    return reply(request, { error: "Operations failed" }, 500);
  }
});
