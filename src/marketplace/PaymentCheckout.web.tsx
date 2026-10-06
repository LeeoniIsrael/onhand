import React, { useState } from "react";
import { friendlyError } from "./api";
import { requireDatabase } from "../services/supabase";
import { Action, Notice, Stack } from "./ui";
export default function PaymentCheckout({
  jobId,
  onAuthorized,
}: {
  jobId: string;
  onAuthorized: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await requireDatabase().functions.invoke(
        "payments",
        { body: { jobId, action: "checkout" } },
      );
      if (error) {
        let detail = "Payment is unavailable.";
        try {
          detail = (await error.context.json()).error;
        } catch {}
        throw new Error(detail);
      }
      if (data.mode === "local") {
        onAuthorized();
        return;
      }
      if (!data.url || !/^https:\/\/checkout\.stripe\.com\//.test(data.url))
        throw new Error("Secure checkout is unavailable.");
      window.location.assign(data.url);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack>
      {error && <Notice error>{error}</Notice>}
      <Action
        title="Authorize agreed payment"
        busy={busy}
        onPress={() => void pay()}
      />
    </Stack>
  );
}
