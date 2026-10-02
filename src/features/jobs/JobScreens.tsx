import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  MessageCircle,
  Phone,
  ShieldCheck,
  Clock3,
  MapPin,
  ArrowRight,
  Check,
  Star,
  ChevronRight,
  Plus,
  CreditCard,
  Flag,
} from "lucide-react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { colors as c } from "../../design/tokens";
import {
  Avatar,
  Button,
  Col,
  Empty,
  Field,
  haptic,
  Pill,
  Row,
  Screen,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { NeighborhoodMap } from "../../design/Map";
import { go } from "../../design/Shell";
import { useStore } from "../../state/store";
import { workers } from "../../domain/seed";
import { JobStatus } from "../../domain/models";
import { statusLabel } from "../../domain/lifecycle";
export function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === (id || s.activeId))),
    role = useStore((s) => s.role),
    [confirmCancel, setConfirmCancel] = useState(false);
  if (!job)
    return (
      <Screen narrow>
        <Empty
          title="Nothing on the way. Yet."
          text="A little help is only a few taps away."
          action="Find help"
          onPress={() => go("/request")}
        />
      </Screen>
    );
  if (["matching", "offered"].includes(job.status))
    return (
      <Screen narrow>
        <Empty
          title="Finding your person"
          text="Your request is still open."
          action="See matching"
          onPress={() => go(`/matching?id=${job.id}`)}
        />
      </Screen>
    );
  const worker = workers.find((w) => w.id === job.workerId) || workers[0];
  const progression: JobStatus[] = [
    "matched",
    "worker_en_route",
    "worker_arrived",
    "in_progress",
    "awaiting_completion_confirmation",
    "completed",
  ];
  const next = progression[progression.indexOf(job.status) + 1];
  const labels: Partial<Record<JobStatus, string>> = {
    matched: "Start heading over",
    worker_en_route: "Mark arrived",
    worker_arrived: "Start the job",
    in_progress: "Mark work complete",
    awaiting_completion_confirmation: "Review the finished work",
    completed: "View receipt",
    cancelled: "Back home",
    disputed: "View support request",
  };
  const label = labels[job.status] ?? "Continue";
  return (
    <Screen narrow>
      <Row style={{ justifyContent: "space-between" }}>
        <Pill
          text={statusLabel[job.status]}
          color={job.status === "completed" ? c.green : c.orange}
        />
        <Touch
          label="Job details"
          onPress={() => go(`/job?id=${job.id}`)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Txt color={c.muted} size={12}>
            Job details ↗
          </Txt>
        </Touch>
      </Row>
      <Col style={{ gap: 6 }}>
        <Txt size={36} weight="600">
          {job.status === "worker_en_route"
            ? `${worker.name.split(" ")[0]} is on the way.`
            : job.status === "worker_arrived"
              ? "Your helping hand is here."
              : job.status === "in_progress"
                ? "You’re in good hands."
                : job.status === "awaiting_completion_confirmation"
                  ? "Ready for a closer look?"
                  : statusLabel[job.status]}
        </Txt>
        <Txt color={c.muted}>{job.title}</Txt>
      </Col>
      <NeighborhoodMap height={310} tracking={job.status === "worker_en_route"}>
        <View style={{ position: "absolute", top: 20, left: 20 }}>
          <Pill
            text={
              job.status === "worker_en_route"
                ? `Arriving in ${job.eta} min · simulated`
                : statusLabel[job.status]
            }
            icon={Clock3}
            color={c.orange}
          />
        </View>
      </NeighborhoodMap>
      <Surface style={{ gap: 20 }}>
        <Touch
          label="View worker profile"
          onPress={() => go(`/specialist?id=${worker.id}`)}
        >
          <Row>
            <Avatar name={worker.name} uri={worker.avatar} size={56} />
            <Col style={{ flex: 1, gap: 4 }}>
              <Row style={{ gap: 8 }}>
                <Txt size={22} weight="600">
                  {worker.name}
                </Txt>
                <ShieldCheck size={16} color={c.green} />
              </Row>
              <Txt size={12} color={c.muted}>
                {job.category} specialist · ★ {worker.metrics.rating.toFixed(2)}
              </Txt>
            </Col>
            <ChevronRight size={18} color={c.subtle} />
          </Row>
        </Touch>
        <Row>
          <Button
            title="Message"
            icon={MessageCircle}
            secondary
            onPress={() => go(`/chat?id=${job.id}`)}
            style={{ flex: 1 }}
          />
          <Button
            title="Call"
            icon={Phone}
            secondary
            onPress={() =>
              useStore
                .getState()
                .notify(
                  "Demo call: a masked in-app call would connect you to your specialist.",
                )
            }
            style={{ flex: 1 }}
          />
        </Row>
        <Row
          style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: c.line }}
        >
          <MapPin size={18} color={c.orange} />
          <Col style={{ flex: 1, gap: 3 }}>
            <Txt size={13}>
              {job.address.street}, {job.address.unit}
            </Txt>
            <Txt size={11} color={c.muted}>
              {job.address.instructions}
            </Txt>
          </Col>
        </Row>
      </Surface>
      <Row style={{ alignItems: "flex-start", gap: 6 }}>
        {["Matched", "En route", "Arrived", "Working", "All fixed"].map(
          (text, i) => (
            <Col key={text} style={{ flex: 1, gap: 7 }}>
              <View
                style={{
                  height: 3,
                  backgroundColor:
                    progression.indexOf(job.status) >= i ? c.orange : c.line,
                  borderRadius: 3,
                }}
              />
              <Txt
                size={10}
                color={progression.indexOf(job.status) >= i ? c.text : c.subtle}
              >
                {text}
              </Txt>
            </Col>
          ),
        )}
      </Row>
      {!["completed", "cancelled", "disputed"].includes(job.status) && (
        <>
          <Button
            title={
              job.status === "awaiting_completion_confirmation"
                ? "Review & approve"
                : `${role === "worker" ? "" : "Demo: "}${label}`
            }
            icon={ArrowRight}
            onPress={() => {
              if (job.status === "awaiting_completion_confirmation")
                go(`/completion?id=${job.id}`);
              else if (next) {
                useStore.getState().advance(job.id, next);
                useStore.getState().addMessage({
                  id: `system-${job.id}-${next}`,
                  jobId: job.id,
                  sender: "system",
                  text: `${worker.name.split(" ")[0]}: ${statusLabel[next].toLowerCase()}.`,
                  createdAt: new Date().toISOString(),
                  state: "sent",
                });
                haptic("success");
              }
            }}
          />
          <Txt size={11} color={c.subtle} style={{ textAlign: "center" }}>
            Demo controls advance the specialist’s progress.
          </Txt>
        </>
      )}
      {["matched", "worker_en_route", "worker_arrived"].includes(
        job.status,
      ) && (
        <Button
          title={
            confirmCancel
              ? "Confirm cancellation · no charge"
              : "Cancel this job"
          }
          secondary
          onPress={() => {
            if (!confirmCancel) {
              setConfirmCancel(true);
              haptic("warning");
            } else {
              useStore.getState().advance(job.id, "cancelled");
              go("/jobs");
            }
          }}
        />
      )}
      <Button
        title="Safety & support"
        secondary
        icon={ShieldCheck}
        onPress={() => go(`/safety?id=${job.id}`)}
      />
    </Screen>
  );
}
export function JobsScreen() {
  const jobs = useStore((s) => s.jobs),
    [filter, setFilter] = useState("All");
  const shown = jobs.filter(
    (j) =>
      filter === "All" ||
      (filter === "Active"
        ? !["completed", "cancelled"].includes(j.status)
        : j.status === "completed"),
  );
  return (
    <Screen
      narrow
      title="Your home, handled."
      subtitle="The little fixes and the big sighs of relief."
    >
      <Row>
        {["All", "Active", "Completed"].map((f) => (
          <Button
            key={f}
            title={f}
            compact
            secondary={f !== filter}
            onPress={() => setFilter(f)}
          />
        ))}
      </Row>
      {!shown.length ? (
        <Empty
          title="A clean slate."
          text="Your jobs will appear here. What can we take off your list?"
          action="Find help"
          onPress={() => go("/request")}
        />
      ) : (
        <View style={{ minHeight: shown.length * 145 }}>
          <FlashList
            data={shown}
            renderItem={({ item: j }) => (
              <Touch
                label={`Open ${j.title}`}
                onPress={() =>
                  go(
                    `/${["completed", "cancelled"].includes(j.status) ? "job" : "tracking"}?id=${j.id}`,
                  )
                }
                style={{ marginBottom: 14 }}
              >
                <Surface style={{ gap: 18 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Pill
                      text={statusLabel[j.status]}
                      color={j.status === "completed" ? c.green : c.orange}
                    />
                    <Txt size={12} color={c.subtle}>
                      {new Date(j.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Txt>
                  </Row>
                  <Row>
                    <Col style={{ flex: 1, gap: 3 }}>
                      <Txt size={19} weight="500">
                        {j.title}
                      </Txt>
                      <Txt color={c.muted} size={12}>
                        {j.category} · {j.address.zone}
                      </Txt>
                    </Col>
                    <Txt size={22} weight="500">
                      ${j.offer}
                    </Txt>
                    <ChevronRight size={18} color={c.subtle} />
                  </Row>
                </Surface>
              </Touch>
            )}
            keyExtractor={(j) => j.id}
            scrollEnabled={false}
          />
        </View>
      )}
      <Button
        title="Request another fix"
        icon={Plus}
        onPress={() => {
          useStore.getState().resetDraft();
          go("/request");
        }}
      />
    </Screen>
  );
}
export function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === id)),
    payment = useStore((s) => s.payments.find((p) => p.jobId === id));
  if (!job)
    return (
      <Screen narrow>
        <Empty
          title="Job not found"
          text="Head back to your job history."
          action="My jobs"
          onPress={() => go("/jobs")}
        />
      </Screen>
    );
  const worker = workers.find((w) => w.id === job.workerId);
  return (
    <Screen
      narrow
      title={job.title}
      subtitle={`${job.category} · ${new Date(job.createdAt).toLocaleDateString()}`}
    >
      <Pill text={statusLabel[job.status]} />
      <Surface style={{ gap: 24 }}>
        <Txt color={c.muted}>
          {job.description || "A small job, properly taken care of."}
        </Txt>
        {worker && (
          <Row>
            <Avatar name={worker.name} uri={worker.avatar} />
            <Col style={{ gap: 3 }}>
              <Txt weight="600">{worker.name}</Txt>
              <Txt color={c.muted} size={12}>
                ★ {worker.metrics.rating.toFixed(2)} ·{" "}
                {worker.metrics.completed} jobs
              </Txt>
            </Col>
          </Row>
        )}
        <Row>
          <MapPin size={18} color={c.orange} />
          <Txt size={13}>
            {job.address.street}, {job.address.unit}
          </Txt>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt color={c.muted}>Agreed offer</Txt>
          <Txt>${job.offer.toFixed(2)}</Txt>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt color={c.muted}>Tip</Txt>
          <Txt>${job.tip.toFixed(2)}</Txt>
        </Row>
        <Row
          style={{
            justifyContent: "space-between",
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          <Txt size={20} weight="600">
            Total
          </Txt>
          <Txt size={28} weight="600">
            ${(job.offer + job.tip).toFixed(2)}
          </Txt>
        </Row>
        <Txt size={11} color={c.subtle}>
          {payment
            ? `${payment.state} · Demo payment`
            : "Seeded job · demo receipt"}
        </Txt>
      </Surface>
      {!["completed", "cancelled", "disputed"].includes(job.status) && (
        <Button
          title="Track job"
          icon={ArrowRight}
          onPress={() => go(`/tracking?id=${id}`)}
        />
      )}
      <Button
        title="Book something similar"
        secondary
        onPress={() => {
          useStore.getState().resetDraft();
          useStore.getState().editDraft({
            title: job.title,
            category: job.category,
            skill: job.skill,
            description: job.description,
          });
          go("/request");
        }}
      />
      <Button
        title="Get help with this job"
        icon={Flag}
        secondary
        onPress={() => go(`/safety?id=${id}`)}
      />
    </Screen>
  );
}
export function CompletionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === id)),
    [step, setStep] = useState<"approve" | "tip" | "rating" | "done">(
      "approve",
    ),
    [tip, setTip] = useState(0),
    [custom, setCustom] = useState(false),
    [ratings, setRatings] = useState({
      overall: 5,
      quality: 5,
      communication: 5,
      punctuality: 5,
    }),
    [tags, setTags] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!job)
    return (
      <Screen narrow>
        <Empty
          title="No job to approve"
          text="Choose a completed job to see the details."
          action="View jobs"
          onPress={() => go("/jobs")}
        />
      </Screen>
    );
  if (!["awaiting_completion_confirmation", "completed"].includes(job.status))
    return (
      <Screen narrow>
        <Empty
          title="Still getting it handled"
          text="You can approve the work once your specialist marks it complete."
          action="Track job"
          onPress={() => go(`/tracking?id=${id}`)}
        />
      </Screen>
    );
  const worker = workers.find((w) => w.id === job.workerId) || workers[0];
  async function pay() {
    setBusy(true);
    setError("");
    try {
      await useStore.getState().complete(id, tip);
      haptic("success");
      setStep("rating");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      key={step}
      narrow
      title={
        step === "approve"
          ? "All fixed?"
          : step === "tip"
            ? "A little extra thanks."
            : step === "rating"
              ? "How did it go?"
              : "One less thing to worry about."
      }
      subtitle={
        step === "approve"
          ? "Take a look. Make sure everything’s just right."
          : step === "tip"
            ? "Optional, always. 100% of tips go to your specialist."
            : step === "rating"
              ? "Your feedback helps good work stand out."
              : "Thanks for trusting OnHand with your home."
      }
    >
      {error ? <Txt color={c.red}>{error}</Txt> : null}
      {step === "approve" && (
        <>
          <Surface style={{ gap: 24 }}>
            <View style={{ alignItems: "center", padding: 24 }}>
              <View
                style={{
                  width: 84,
                  height: 84,
                  backgroundColor: "#25362a",
                  borderRadius: 42,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Check size={38} color={c.green} />
              </View>
            </View>
            <Txt size={22} weight="600">
              {job.title}
            </Txt>
            <Row>
              <Avatar name={worker.name} uri={worker.avatar} />
              <Txt color={c.muted}>
                Completed by {worker.name.split(" ")[0]}
              </Txt>
            </Row>
            {job.photos.filter((p) => p.kind !== "video").length > 0 && (
              <ScrollView horizontal>
                {job.photos
                  .filter((p) => p.kind !== "video")
                  .map((p) => (
                    <View key={p.id} style={{ marginRight: 10, gap: 5 }}>
                      <Image
                        source={{ uri: p.uri }}
                        style={{ width: 160, height: 120, borderRadius: 12 }}
                      />
                      <Txt size={11} color={c.muted}>
                        {p.kind === "before" ? "Before" : "After"}
                      </Txt>
                    </View>
                  ))}
              </ScrollView>
            )}
            <Row
              style={{
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: c.line,
                paddingTop: 20,
              }}
            >
              <Txt>Agreed total</Txt>
              <Txt size={32} weight="600">
                ${job.offer}
              </Txt>
            </Row>
          </Surface>
          <Button
            title="Confirm completion"
            icon={Check}
            onPress={() => setStep("tip")}
          />
          <Button
            title="Something’s not right"
            secondary
            onPress={() => go(`/safety?id=${id}`)}
          />
        </>
      )}
      {step === "tip" && (
        <>
          <Surface style={{ alignItems: "center", gap: 16, padding: 32 }}>
            <Avatar name={worker.name} uri={worker.avatar} size={80} />
            <Txt size={24} weight="600">
              {worker.name.split(" ")[0]} appreciates it.
            </Txt>
            <Txt size={56} weight="600">
              ${tip.toFixed(2)}
            </Txt>
          </Surface>
          <Row style={{ flexWrap: "wrap" }}>
            {[0, 0.1, 0.15, 0.2].map((t) => (
              <Button
                key={t}
                title={t ? `${t * 100}%` : "No tip"}
                compact
                secondary={
                  tip !== Math.round(job.offer * t * 100) / 100 || custom
                }
                onPress={() => {
                  setCustom(false);
                  setTip(Math.round(job.offer * t * 100) / 100);
                }}
              />
            ))}
            <Button
              title="Custom"
              compact
              secondary={!custom}
              onPress={() => setCustom(true)}
            />
          </Row>
          {custom && (
            <Field
              label="Custom tip ($)"
              keyboardType="decimal-pad"
              value={String(tip)}
              onChangeText={(v) => setTip(Number(v))}
            />
          )}
          <Button
            title={
              busy
                ? "Approving…"
                : `Approve $${(job.offer + tip).toFixed(2)} · demo payment`
            }
            disabled={busy || !Number.isFinite(tip) || tip < 0}
            icon={CreditCard}
            onPress={pay}
          />
          <Txt color={c.subtle} size={11} style={{ textAlign: "center" }}>
            No real payment is taken in this demo.
          </Txt>
        </>
      )}
      {step === "rating" && (
        <>
          <Surface style={{ gap: 22 }}>
            {(
              ["overall", "quality", "communication", "punctuality"] as const
            ).map((key) => (
              <Row key={key} style={{ justifyContent: "space-between" }}>
                <Txt style={{ textTransform: "capitalize" }}>{key}</Txt>
                <Row style={{ gap: 0 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Touch
                      key={n}
                      label={`${key} ${n} stars`}
                      onPress={() => setRatings((r) => ({ ...r, [key]: n }))}
                      style={{
                        width: 40,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Star
                        size={24}
                        color={n <= ratings[key] ? c.amber : c.subtle}
                        fill={n <= ratings[key] ? c.amber : "none"}
                      />
                    </Touch>
                  ))}
                </Row>
              </Row>
            ))}
          </Surface>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              "Clean work",
              "Professional",
              "Fast",
              "Knowledgeable",
              "Would hire again",
            ].map((tag) => (
              <Button
                key={tag}
                title={tag}
                compact
                secondary={!tags.includes(tag)}
                onPress={() =>
                  setTags((t) =>
                    t.includes(tag) ? t.filter((v) => v !== tag) : [...t, tag],
                  )
                }
              />
            ))}
          </View>
          <Field
            label="Anything to add? (optional)"
            multiline
            value={note}
            onChangeText={setNote}
          />
          <Button
            title="Send review"
            icon={ArrowRight}
            onPress={() => {
              useStore.getState().review({
                id: `review-${id}`,
                jobId: id,
                workerId: worker.id,
                ...ratings,
                tags,
                note,
              });
              setStep("done");
              haptic("success");
            }}
          />
        </>
      )}
      {step === "done" && (
        <>
          <Surface style={{ alignItems: "center", gap: 20, padding: 40 }}>
            <ShieldCheck color={c.green} size={64} strokeWidth={1.2} />
            <Txt size={22} weight="500">
              Good work. Good neighbors.
            </Txt>
            <Txt color={c.muted}>Your review is saved.</Txt>
          </Surface>
          <Button
            title="Back to your home"
            icon={ArrowRight}
            onPress={() => go("/")}
          />
          <Button
            title="View receipt"
            secondary
            onPress={() => go(`/job?id=${id}`)}
          />
        </>
      )}
    </Screen>
  );
}
