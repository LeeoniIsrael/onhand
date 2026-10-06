import React, { useState } from "react";
import { marketplace, friendlyError } from "./api";
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
      const result = await marketplace.payment(jobId, "authorize");
      if (result.mode === "local") onAuthorized();
      else throw new Error("Use the native app to authorize this payment.");
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
