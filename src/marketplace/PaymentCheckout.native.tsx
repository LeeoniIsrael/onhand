import React, { useState } from "react";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { marketplace, friendlyError } from "./api";
import { Action, Notice, Stack } from "./ui";
export default function PaymentCheckout(props: {
  jobId: string;
  onAuthorized: () => void;
}) {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key ? (
    <StripeProvider publishableKey={key} urlScheme="onhand">
      <NativeCheckout {...props} />
    </StripeProvider>
  ) : (
    <LocalCheckout {...props} />
  );
}
function LocalCheckout({
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
    try {
      const result = await marketplace.payment(jobId, "authorize");
      if (result.mode !== "local")
        throw new Error("Payment configuration is incomplete.");
      onAuthorized();
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
function NativeCheckout({
  jobId,
  onAuthorized,
}: {
  jobId: string;
  onAuthorized: () => void;
}) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const result = await marketplace.payment(jobId, "authorize");
      if (result.mode === "local") {
        onAuthorized();
        return;
      }
      if (!result.clientSecret)
        throw new Error("Payment authorization is unavailable.");
      const setup = await initPaymentSheet({
        merchantDisplayName: "OnHand",
        paymentIntentClientSecret: result.clientSecret,
        returnURL: "onhand://job",
        allowsDelayedPaymentMethods: false,
      });
      if (setup.error) throw new Error(setup.error.message);
      const presented = await presentPaymentSheet();
      if (presented.error) {
        if (presented.error.code === "Canceled") return;
        throw new Error(presented.error.message);
      }
      onAuthorized();
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
