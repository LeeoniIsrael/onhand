import React, { useState, useEffect } from "react";
import { View, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { useAuth, useJob } from "./Provider";
import {
  Action,
  CommandError,
  Copy,
  Divider,
  Failure,
  Input,
  Line,
  Loading,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
  useCommand,
  useNow,
} from "./ui";
import { money, friendlyError, marketplace, requestKey } from "./api";
import {
  requireDatabase,
  uploadJobPhoto,
  isLocalBackend,
} from "../services/supabase";
import { statusLabel } from "../domain/lifecycle";
import type { JobStatus } from "../domain/models";
import PaymentCheckout from "./PaymentCheckout";
export default function JobScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const query = useJob(id);
  const { session } = useAuth();
  const now = useNow(30000);
  const advance = useCommand("advance");
  const cancel = useCommand("cancel");
  const approve = useCommand("approve_completion");
  const chat = useCommand("send_message");
  const review = useCommand("review");
  const report = useCommand("report");
  const block = useCommand("block");
  const redispatch = useCommand("redispatch");
  const counter = useCommand("respond_counter");
  const photo = useCommand("register_photo");
  const [message, setMessage] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [olderMessages, setOlderMessages] = useState<
    NonNullable<typeof query.data>["messages"]
  >([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    let active = true;
    const photos = query.data?.photos ?? [];
    if (!photos.length) return;
    function refresh() {
      void requireDatabase()
        .storage.from("job-photos")
        .createSignedUrls(
          photos.map((p) => p.storage_path),
          300,
        )
        .then(({ data }) => {
          if (active && data)
            setPhotoUrls(
              Object.fromEntries(
                data
                  .filter((p) => p.signedUrl && p.path)
                  .map((p) => [p.path!, p.signedUrl!]),
              ),
            );
        });
    }
    refresh();
    const interval = setInterval(refresh, 240000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [query.data?.photos]);
  if (query.isPending) return <Loading text="Loading this job…" />;
  if (query.error || !query.data)
    return (
      <Failure
        error={query.error || new Error("Choose a job from your list.")}
        retry={() => void query.refetch()}
      />
    );
  const { job, payment, counters, matching } = query.data;
  const customer = job.customer_id === session?.user.id;
  const worker = job.worker_id === session?.user.id;
  const next: Partial<Record<JobStatus, JobStatus>> = {
    matched: "worker_en_route",
    worker_en_route: "worker_arrived",
    worker_arrived: "in_progress",
    in_progress: "awaiting_completion_confirmation",
  };
  const nextLabel: Record<string, string> = {
    worker_en_route: "Head to job",
    worker_arrived: "Confirm arrival",
    in_progress: "Start work",
    awaiting_completion_confirmation: "Mark work complete",
  };
  const terminal = ["completed", "cancelled"].includes(job.status);
  const messages = [...olderMessages, ...query.data.messages]
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  async function upload() {
    setUploading(true);
    setUploadError(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow photo access to attach an image.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      const side = Math.max(asset.width, asset.height);
      if (side > 1600)
        context.resize({
          width: Math.max(1, Math.round((asset.width * 1600) / side)),
        });
      const rendered = await context.renderAsync();
      const compressed = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.82,
      });
      const bytes =
        Platform.OS === "web"
          ? await (await fetch(compressed.uri)).arrayBuffer()
          : await new File(compressed.uri).arrayBuffer();
      const path = await uploadJobPhoto(id, requestKey(), bytes, "image/jpeg");
      await photo.run({
        job_id: id,
        path,
        kind: job.status === "in_progress" ? "after" : "before",
      });
    } catch (e) {
      setUploadError(friendlyError(e));
    } finally {
      setUploading(false);
    }
  }
  async function capture() {
    setCapturing(true);
    setUploadError(null);
    try {
      const result = await approve.run({ job_id: id });
      if (!result) return;
      await marketplace.payment(id, "capture");
      await query.refetch();
    } catch (e) {
      setUploadError(friendlyError(e));
    } finally {
      setCapturing(false);
    }
  }
  return (
    <Page back title={job.title} subtitle={statusLabel[job.status]}>
      <Stack style={{ gap: 24 }}>
        <Line
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Stack style={{ gap: 4, flex: 1 }}>
            <Copy color={palette.slate}>{job.category}</Copy>
            <Copy size={14} color={palette.slate}>
              {job.urgency === "scheduled" && job.scheduled_at
                ? new Date(job.scheduled_at).toLocaleString()
                : job.urgency === "now"
                  ? "As soon as possible"
                  : "Today"}
            </Copy>
          </Stack>
          <Copy size={38} weight="700">
            {money(job.offer_cents)}
          </Copy>
        </Line>
        <Copy color={palette.slate}>{job.description}</Copy>
        {job.address && (
          <Stack style={{ gap: 5 }}>
            <Copy weight="600">
              {job.address.street}
              {job.address.unit ? `, ${job.address.unit}` : ""}
            </Copy>
            <Copy color={palette.slate}>{job.address.city}</Copy>
            {Boolean(job.address.instructions) && (
              <Copy size={14} color={palette.slate}>
                {job.address.instructions}
              </Copy>
            )}
          </Stack>
        )}
        {job.worker && (
          <Stack
            style={{
              padding: 20,
              backgroundColor: palette.white,
              borderRadius: 16,
              gap: 8,
            }}
          >
            <Copy size={21} weight="600">
              {customer ? job.worker.name : job.customer_name}
            </Copy>
            <Copy color={palette.slate} size={14}>
              {customer
                ? job.worker.reviews
                  ? `${Number(job.worker.rating).toFixed(1)} from ${job.worker.reviews} ${job.worker.reviews === 1 ? "review" : "reviews"}`
                  : "New to OnHand"
                : "Customer"}
            </Copy>
            {customer && job.worker.identity_verified && (
              <Copy size={13} color={palette.green}>
                Identity verified
              </Copy>
            )}
            {customer && job.eta_seconds && job.status === "matched" && (
              <Copy color={palette.slate} size={13}>
                Approximate travel time: {Math.ceil(job.eta_seconds / 60)} min.
                Confirm the arrival time in chat.
              </Copy>
            )}
          </Stack>
        )}
        {["matching", "offered"].includes(job.status) && (
          <Stack>
            <Notice>
              {job.scheduled_at && Date.parse(job.scheduled_at) > now + 86400000
                ? "Matching begins within 24 hours of your appointment."
                : matching.pending
                  ? `Your request is with ${matching.pending} suitable ${matching.pending === 1 ? "worker" : "workers"}. We’ll update this screen when someone accepts.`
                  : matching.sent
                    ? "This offer round has closed. Request another round or cancel and revise your budget."
                    : "No available worker fits yet. Request another round or revise your job."}
            </Notice>
            <CommandError command={redispatch} />
            <Action
              secondary
              title="Check for more matches"
              busy={redispatch.busy}
              onPress={() => void redispatch.run({ job_id: id })}
            />
          </Stack>
        )}
        {customer &&
          counters.map((c) => (
            <Stack
              key={c.id}
              style={{
                padding: 18,
                backgroundColor: palette.wash,
                borderRadius: 14,
              }}
            >
              <Copy weight="600">
                {c.worker_name} proposes {money(c.amount_cents)}
              </Copy>
              <Copy color={palette.slate}>{c.reason}</Copy>
              <Action
                title="Accept revised price"
                busy={counter.busy}
                onPress={() =>
                  void counter.run({
                    job_id: id,
                    counter_id: c.id,
                    accept: true,
                  })
                }
              />
              <QuietAction
                title="Keep original price"
                onPress={() =>
                  void counter.run({
                    job_id: id,
                    counter_id: c.id,
                    accept: false,
                  })
                }
              />
            </Stack>
          ))}
        <CommandError command={counter} />
        {job.status === "matched" &&
          customer &&
          payment?.state !== "authorized" && (
            <>
              <Notice>
                {isLocalBackend
                  ? "Local payment test. No money moves."
                  : "Authorize the agreed amount to reserve it on your card. It is captured only after you approve the completed work."}
              </Notice>
              <PaymentCheckout
                jobId={id}
                onAuthorized={() => void query.refetch()}
              />
            </>
          )}
        {job.status === "matched" && payment?.state === "authorized" && (
          <Notice>
            Payment authorized.
            {customer
              ? "Your worker can now begin the trip."
              : "You can head to the job."}
          </Notice>
        )}
        {worker && next[job.status] && (
          <>
            <CommandError command={advance} />
            <Action
              title={nextLabel[next[job.status]!]}
              busy={advance.busy}
              disabled={
                job.status === "matched" && payment?.state !== "authorized"
              }
              onPress={() =>
                void advance.run({ job_id: id, status: next[job.status] })
              }
            />
          </>
        )}
        {customer && job.status === "awaiting_completion_confirmation" && (
          <>
            <Notice>
              Check the finished work before approving. If something needs
              fixing, discuss it in chat or send a support report.
            </Notice>
            <CommandError command={approve} />
            <Action
              title={
                job.payment_approved_at
                  ? "Retry payment confirmation"
                  : `Approve completion · ${money(job.offer_cents)}`
              }
              busy={approve.busy || capturing}
              onPress={() => void capture()}
            />
          </>
        )}
        {job.status === "completed" && (
          <Notice>
            {isLocalBackend
              ? "Local test completed. No money moved."
              : "Completed. "}
            {!isLocalBackend && customer
              ? `${money(job.offer_cents)} paid for this job.`
              : !isLocalBackend
                ? `Your share is ${money(job.offer_cents - Math.round(job.offer_cents * 0.15))} before any provider payout fees.`
                : null}
          </Notice>
        )}
        {uploadError && <Notice error>{uploadError}</Notice>}
        <Divider />
        {query.data.photos.length > 0 && (
          <Line style={{ flexWrap: "wrap" }}>
            {query.data.photos.map((p) =>
              photoUrls[p.storage_path] ? (
                <Image
                  key={p.id}
                  source={{ uri: photoUrls[p.storage_path] }}
                  accessibilityLabel="Job photo"
                  style={{ width: 120, height: 120, borderRadius: 12 }}
                  contentFit="cover"
                  cachePolicy="none"
                />
              ) : null,
            )}
          </Line>
        )}
        {!terminal && (
          <>
            <CommandError command={photo} />
            <QuietAction
              title={uploading ? "Uploading photo…" : "Attach a job photo"}
              disabled={uploading || photo.busy}
              onPress={() => void upload()}
            />
          </>
        )}
        {job.worker_id && (
          <Stack>
            <Copy size={23} weight="700">
              Conversation
            </Copy>
            {query.data.messages.length >= 50 && (
              <QuietAction
                title={loadingOlder ? "Loading…" : "Load earlier messages"}
                disabled={loadingOlder}
                onPress={() => {
                  setLoadingOlder(true);
                  void marketplace
                    .job(id, messages[0])
                    .then((data) =>
                      setOlderMessages((old) => [...data.messages, ...old]),
                    )
                    .catch((e) => setUploadError(friendlyError(e)))
                    .finally(() => setLoadingOlder(false));
                }}
              />
            )}
            {!messages.length && (
              <Copy color={palette.slate}>
                Coordinate timing, tools and any questions here.
              </Copy>
            )}
            {messages.map((m) => (
              <View
                key={m.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor:
                    m.sender_id === session?.user.id
                      ? palette.wash
                      : palette.white,
                  alignSelf:
                    m.sender_id === session?.user.id
                      ? "flex-end"
                      : "flex-start",
                  maxWidth: "90%",
                }}
              >
                <Copy size={12} color={palette.slate}>
                  {m.sender_id === session?.user.id
                    ? "You"
                    : customer
                      ? job.worker?.name
                      : job.customer_name}
                </Copy>
                <Copy selectable>{m.body}</Copy>
                <Copy size={11} color={palette.slate}>
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Copy>
              </View>
            ))}
            {!terminal && (
              <>
                <Input
                  label="Message"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={4000}
                  placeholder="Ask a question or share a detail"
                />
                <CommandError command={chat} />
                <Action
                  title="Send message"
                  busy={chat.busy}
                  disabled={!message.trim()}
                  onPress={() =>
                    void chat.run({ job_id: id, body: message.trim() }, () =>
                      setMessage(""),
                    )
                  }
                />
              </>
            )}
          </Stack>
        )}
        {customer && job.status === "completed" && !query.data.review && (
          <Stack>
            <Divider />
            <Copy size={23} weight="700">
              How did it go?
            </Copy>
            <Line>
              {[1, 2, 3, 4, 5].map((n) => (
                <Action
                  key={n}
                  title={String(n)}
                  secondary={n !== rating}
                  style={{ flex: 1 }}
                  onPress={() => setRating(n)}
                />
              ))}
            </Line>
            <Input
              label="Review (optional)"
              value={note}
              onChangeText={setNote}
              maxLength={2000}
              multiline
            />
            <CommandError command={review} />
            <Action
              title="Save review"
              busy={review.busy}
              onPress={() =>
                void review.run({
                  job_id: id,
                  overall: rating,
                  quality: rating,
                  communication: rating,
                  punctuality: rating,
                  note,
                })
              }
            />
          </Stack>
        )}
        {query.data.review && (
          <Copy color={palette.slate}>
            Your review: {query.data.review.overall}/5
            {query.data.review.note ? ` · ${query.data.review.note}` : ""}
          </Copy>
        )}
        <Divider />
        {[
          "matching",
          "offered",
          "matched",
          "worker_en_route",
          "worker_arrived",
        ].includes(job.status) && (
          <>
            <CommandError command={cancel} />
            <QuietAction
              danger
              title={confirmCancel ? "Confirm cancellation" : "Cancel job"}
              disabled={cancel.busy}
              onPress={() =>
                confirmCancel
                  ? void cancel.run({ job_id: id }, () =>
                      router.replace("/jobs"),
                    )
                  : setConfirmCancel(true)
              }
            />
          </>
        )}
        <QuietAction
          title={reporting ? "Close support report" : "Report an issue"}
          onPress={() => setReporting(!reporting)}
        />
        {reporting && (
          <Stack>
            <Copy color={palette.slate} size={14}>
              Reports are saved for the support team. For immediate danger,
              contact your local emergency services.
            </Copy>
            <Input
              label="What happened?"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={4000}
            />
            <CommandError command={report} />
            <Action
              title="Send support report"
              busy={report.busy}
              disabled={reason.trim().length < 10}
              onPress={() =>
                void report.run({ job_id: id, body: reason.trim() }, () => {
                  setReason("");
                  setReporting(false);
                })
              }
            />
            {customer && job.worker_id && (
              <>
                <CommandError command={block} />
                <QuietAction
                  danger
                  title="Block this worker from future jobs"
                  onPress={() => void block.run({ job_id: id })}
                />
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
