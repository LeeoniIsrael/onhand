import { localTests, rpc, db } from "./server.ts";
interface NotificationEvent {
  id: string;
  topic: string;
  aggregate_id: string;
  payload: Record<string, string>;
}
export async function notifyBatch(events: NotificationEvent[]) {
  if (!events.length) return;
  const ids = events.map((e) => e.id);
  if (localTests) {
    await rpc("complete_outbox_batch", { p_ids: ids });
    return;
  }
  try {
    const offered = events.filter((e) => e.topic === "offer_notification");
    const valid = new Set<string>();
    for (let i = 0; i < offered.length; i += 100) {
      const { data, error } = await db
        .from("job_offers")
        .select("id")
        .in(
          "id",
          offered.slice(i, i + 100).map((e) => e.aggregate_id),
        )
        .eq("state", "pending")
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      data?.forEach((offer) => valid.add(offer.id));
    }
    const messages: {
      actor: string;
      title: string;
      jobId: string;
      kind?: string;
    }[] = [];
    for (const event of events) {
      if (event.topic === "offer_notification" && valid.has(event.aggregate_id))
        messages.push({
          actor: event.payload.actor,
          title: "A job fits your skills",
          kind: "offer",
          jobId: event.payload.job_id,
        });
      else if (event.topic === "message_notification")
        messages.push({
          actor: event.payload.actor,
          title: "New job message",
          jobId: event.payload.job_id,
        });
      else if (event.topic === "job_matched") {
        messages.push({
          actor: event.payload.customer_id,
          title: "A worker accepted your job",
          jobId: event.aggregate_id,
        });
        messages.push({
          actor: event.payload.worker_id,
          title: "Your job is confirmed",
          jobId: event.aggregate_id,
        });
      }
    }
    const actors = [...new Set(messages.map((m) => m.actor))];
    const tokens = new Map<string, string[]>();
    for (let i = 0; i < actors.length; i += 1000) {
      const recipients = await rpc<{ actor: string; token: string }[]>(
        "push_recipients_many",
        { p_actors: actors.slice(i, i + 1000) },
      );
      for (const recipient of recipients)
        tokens.set(recipient.actor, [
          ...(tokens.get(recipient.actor) || []),
          recipient.token,
        ]);
    }
    const packets = messages.flatMap((message) =>
      (tokens.get(message.actor) || []).map((token) => ({
        to: token,
        title: message.title,
        body: "Open OnHand to see the update.",
        data: { jobId: message.jobId, kind: message.kind || "job" },
        sound: "default",
        channelId: "jobs",
      })),
    );
    const receipts: { ticket: string; token: string }[] = [];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const accessToken = Deno.env.get("EXPO_PUSH_ACCESS_TOKEN");
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    // Expo accepts at most 100 notifications per request. One batch per ~200ms stays below 600/sec.
    for (let i = 0; i < packets.length; i += 100) {
      const slice = packets.slice(i, i + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(slice),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(`Push delivery HTTP ${response.status}`);
      const result = await response.json();
      if (result.errors?.length)
        throw new Error("Push provider rejected the batch");
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        if (ticket.status === "error") {
          if (ticket.details?.error === "DeviceNotRegistered")
            await rpc("remove_push_token", { p_token: slice[j].to });
          else throw new Error("Push provider rejected a device");
        } else if (ticket.id)
          receipts.push({ ticket: ticket.id, token: slice[j].to });
      }
      if (i + 100 < packets.length)
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    for (let i = 0; i < receipts.length; i += 1000)
      await rpc("queue_push_receipts", {
        p_tickets: receipts.slice(i, i + 1000),
      });
    await rpc("complete_outbox_batch", { p_ids: ids });
  } catch (error) {
    await rpc("complete_outbox_batch", {
      p_ids: ids,
      p_error: error instanceof Error ? error.message : "Push batch failed",
    });
  }
}

export async function receiptBatch(events: NotificationEvent[]) {
  if (!events.length) return;
  const ids = events.map((e) => e.id);
  if (localTests) {
    await rpc("complete_outbox_batch", { p_ids: ids });
    return;
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = Deno.env.get("EXPO_PUSH_ACCESS_TOKEN");
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: events.map((e) => e.payload.ticket) }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Push receipts are unavailable");
    const result = await response.json();
    const ready: string[] = [];
    const waiting: string[] = [];
    for (const event of events) {
      const receipt = result.data?.[event.payload.ticket];
      if (!receipt) {
        waiting.push(event.id);
        continue;
      }
      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      )
        await rpc("remove_push_token", { p_token: event.payload.token });
      else if (receipt.status === "error") {
        waiting.push(event.id);
        continue;
      }
      ready.push(event.id);
    }
    if (ready.length) await rpc("complete_outbox_batch", { p_ids: ready });
    if (waiting.length)
      await rpc("complete_outbox_batch", {
        p_ids: waiting,
        p_error: "Push receipt is not ready or delivery needs review",
      });
  } catch (error) {
    await rpc("complete_outbox_batch", {
      p_ids: ids,
      p_error: error instanceof Error ? error.message : "Receipt batch failed",
    });
  }
}
