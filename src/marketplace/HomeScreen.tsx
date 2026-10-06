import React, { useEffect, useState } from "react";
import { View, Switch, AppState } from "react-native";
import { router } from "expo-router";
import { ArrowRight, Clock3, MapPin } from "lucide-react-native";
import * as Location from "expo-location";
import { useHome } from "./Provider";
import {
  Action,
  CommandError,
  Copy,
  Divider,
  JobRow,
  Line,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
  useCommand,
  useNow,
  Input,
} from "./ui";
import { money, marketplace } from "./api";
import type { IncomingOffer } from "./types";
export default function HomeScreen() {
  const { data } = useHome();
  return data?.profile.role === "worker" ? <WorkerHome /> : <CustomerHome />;
}
function CustomerHome() {
  const { data } = useHome();
  const active =
    data?.jobs.filter((j) => !["completed", "cancelled"].includes(j.status)) ??
    [];
  return (
    <Page>
      <Stack style={{ gap: 28 }}>
        <Copy color={palette.slate}>
          Hi, {data?.profile.display_name.split(" ")[0]}.
        </Copy>
        <Stack style={{ gap: 12 }}>
          <Copy size={38} weight="700">
            {"What do you need\nhandled?"}
          </Copy>
          <Copy color={palette.slate} size={18}>
            Small repairs. Heavy lifting. The jobs on your list.
          </Copy>
        </Stack>
        <Action
          title="Post a job"
          icon={ArrowRight}
          onPress={() => router.push("/request")}
        />
        <Line
          style={{ alignItems: "flex-start", gap: 20, paddingVertical: 14 }}
        >
          <View
            style={{
              width: 4,
              alignSelf: "stretch",
              backgroundColor: palette.blue,
              borderRadius: 3,
            }}
          />
          <Stack style={{ gap: 8, flex: 1 }}>
            <Copy weight="600">Your job. Your price.</Copy>
            <Copy color={palette.slate} size={15}>
              Tell us what needs doing and what you’re willing to pay. We’ll
              send it to available workers who fit.
            </Copy>
          </Stack>
        </Line>
        {active.length > 0 && (
          <Stack style={{ gap: 0 }}>
            <Copy size={23} weight="700">
              In motion
            </Copy>
            {active.slice(0, 3).map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onPress={() =>
                  router.push({ pathname: "/job", params: { id: j.id } })
                }
              />
            ))}
          </Stack>
        )}
        <Divider />
        <Copy color={palette.slate} size={14}>
          Confirm the agreed price before work starts. Approve completion when
          you’re happy with the result.
        </Copy>
      </Stack>
    </Page>
  );
}
async function position() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Allow location in device settings to receive nearby work.",
    );
  return (
    await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
  ).coords;
}
function WorkerHome() {
  const { data, refetch } = useHome();
  const available = useCommand("availability");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const active = data?.jobs.find(
    (j) => !["completed", "cancelled", "disputed"].includes(j.status),
  );
  async function toggle(value: boolean) {
    setLocationError(null);
    if (!value) {
      await available.run({ available: false });
      return;
    }
    setGettingLocation(true);
    try {
      const coords = await position();
      await available.run({
        available: true,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch (e) {
      setLocationError((e as Error).message);
    } finally {
      setGettingLocation(false);
    }
  }
  useEffect(() => {
    if (!data?.worker?.available) return;
    let refreshing = false;
    let mounted = true;
    async function refreshLocation() {
      if (AppState.currentState !== "active" || refreshing) return;
      refreshing = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return;
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted)
          await marketplace.action("availability", {
            available: true,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
      } catch {
        /* Keep the last server location; stale positions are excluded from matching. */
      } finally {
        refreshing = false;
      }
    }
    const interval = setInterval(() => void refreshLocation(), 240000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshLocation();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [data?.worker?.available]);
  const approved =
    data?.worker?.account_standing === "good" &&
    data.worker.identity_verified &&
    data.worker.payouts_ready;
  return (
    <Page
      title="Work that fits."
      subtitle={`Good to see you, ${data?.profile.display_name.split(" ")[0]}.`}
    >
      <Stack style={{ gap: 24 }}>
        <Line style={{ justifyContent: "space-between", paddingVertical: 12 }}>
          <Stack style={{ gap: 4, flex: 1 }}>
            <Copy weight="600" size={20}>
              {data?.worker?.available ? "You’re available" : "You’re off duty"}
            </Copy>
            <Copy size={14} color={palette.slate}>
              {approved
                ? "Receive jobs near your current location."
                : "Set up your skills, then complete verification."}
            </Copy>
          </Stack>
          <Switch
            accessibilityLabel="Available for work"
            disabled={
              !approved || available.busy || gettingLocation || Boolean(active)
            }
            value={Boolean(data?.worker?.available)}
            onValueChange={(value) => void toggle(value)}
            trackColor={{ false: palette.line, true: palette.blue }}
          />
        </Line>
        <CommandError command={available} />
        {locationError && <Notice error>{locationError}</Notice>}
        {!approved && (
          <Notice>
            Your worker account is awaiting identity and credential review. You
            can configure your skills in Account.
          </Notice>
        )}
        {!approved && (
          <Action
            title="Set up worker account"
            secondary
            onPress={() => router.push("/profile")}
          />
        )}
        {active ? (
          <Stack>
            <Copy size={23} weight="700">
              Your current job
            </Copy>
            <JobRow
              job={active}
              onPress={() =>
                router.push({ pathname: "/job", params: { id: active.id } })
              }
            />
          </Stack>
        ) : (
          <Stack>
            {data?.offers.length ? (
              <>
                <Copy size={23} weight="700">
                  Suitable jobs
                </Copy>
                {data.offers.map((o) => (
                  <Offer key={o.id} offer={o} />
                ))}
              </>
            ) : (
              <View style={{ paddingVertical: 32, gap: 12 }}>
                <Clock3 size={32} color={palette.blue} />
                <Copy size={23} weight="600">
                  {data?.worker?.available
                    ? "Ready for the right job."
                    : "Make room for your next job."}
                </Copy>
                <Copy color={palette.slate}>
                  {data?.worker?.available
                    ? "Offers appear here when your skills, price and location fit. Keep the app open while you’re available."
                    : "Go available when you’re ready to take work."}
                </Copy>
                <QuietAction
                  title="Refresh offers"
                  onPress={() => void refetch()}
                />
              </View>
            )}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
function Offer({ offer }: { offer: IncomingOffer }) {
  const accept = useCommand("accept_offer");
  const decline = useCommand("decline_offer");
  const counter = useCommand("counter_offer");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const expired = Date.parse(offer.expires_at) <= useNow();
  return (
    <Stack
      style={{
        backgroundColor: palette.white,
        padding: 22,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Line
        style={{ alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Copy size={21} weight="700" style={{ flex: 1 }}>
          {offer.job.title}
        </Copy>
        <Copy size={29} weight="700">
          {money(offer.job.offer_cents)}
        </Copy>
      </Line>
      <Copy color={palette.slate}>{offer.job.description}</Copy>
      <Line>
        <MapPin size={16} color={palette.slate} />
        <Copy size={14} color={palette.slate}>
          {offer.job.approximate_zone} · within {offer.distance_m / 1000} km
        </Copy>
      </Line>
      <Copy size={13} color={palette.slate}>
        {offer.job.duration_minutes} min estimated work ·
        {offer.job.urgency === "scheduled"
          ? "Scheduled job"
          : offer.job.urgency === "today"
            ? "Today"
            : "As soon as possible"}
      </Copy>
      <Copy size={13} color={palette.slate}>
        Approximate travel: {Math.ceil(offer.eta_seconds / 60)} min. Exact
        address after acceptance. A 15% service fee is deducted from the job
        price.
      </Copy>
      <CommandError command={accept} />
      <CommandError command={decline} />
      <CommandError command={counter} />
      {open && (
        <Stack>
          <OfferCounter
            amount={amount}
            reason={reason}
            setAmount={setAmount}
            setReason={setReason}
          />
          <Action
            title="Propose price"
            busy={counter.busy}
            disabled={
              !reason.trim() ||
              !Number.isFinite(Number(amount)) ||
              Number(amount) < 10
            }
            onPress={() =>
              void counter.run(
                {
                  job_id: offer.job.id,
                  amount_cents: Math.round(Number(amount) * 100),
                  reason,
                },
                () => setOpen(false),
              )
            }
          />
        </Stack>
      )}
      <Action
        title={expired ? "Offer expired" : "Accept job"}
        busy={accept.busy}
        disabled={expired || decline.busy || counter.busy}
        onPress={() =>
          void accept.run({ offer_id: offer.id }).then((result) => {
            if (result)
              router.push({
                pathname: "/job",
                params: { id: String(result.id) },
              });
          })
        }
      />
      <Line style={{ justifyContent: "space-between" }}>
        <QuietAction
          title={open ? "Keep original price" : "Propose another price"}
          onPress={() => setOpen(!open)}
          disabled={accept.busy}
        />
        <QuietAction
          title="Pass"
          onPress={() => void decline.run({ offer_id: offer.id })}
          disabled={accept.busy || decline.busy}
        />
      </Line>
    </Stack>
  );
}

function OfferCounter({
  amount,
  reason,
  setAmount,
  setReason,
}: {
  amount: string;
  reason: string;
  setAmount: (value: string) => void;
  setReason: (value: string) => void;
}) {
  return (
    <>
      <Input
        label="Proposed price ($)"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <Input
        label="Reason"
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        multiline
      />
    </>
  );
}
