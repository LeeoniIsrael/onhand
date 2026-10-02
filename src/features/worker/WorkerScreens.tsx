import React, { useState } from "react";
import { View, Switch } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Award,
} from "lucide-react-native";
import { colors as c } from "../../design/tokens";
import {
  Avatar,
  Button,
  Col,
  Empty,
  Field,
  MenuRow,
  Pill,
  Row,
  Screen,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { NeighborhoodMap } from "../../design/Map";
import { go } from "../../design/Shell";
import { makeDraft, workers } from "../../domain/seed";
import { qualityScore } from "../../domain/marketplace";
import { useStore } from "../../state/store";
import { Job, Skill, taxonomy } from "../../domain/models";
export const nearbyJobs: Job[] = [
  {
    ...makeDraft(),
    id: "nearby-1",
    title: "Kitchen sink leak",
    description:
      "A slow drip under the sink. It looks like the drain connection.",
    offer: 175,
    status: "offered",
  },
  {
    ...makeDraft(),
    id: "nearby-2",
    title: "Bathroom drain needs a hand",
    description: "The water is draining slowly. No chemicals used.",
    skill: "plumbing.drain",
    offer: 135,
    status: "offered",
    duration: 40,
  },
  {
    ...makeDraft(),
    id: "nearby-3",
    title: "A door that won’t close",
    description: "Bedroom door is sticking on the frame.",
    category: "General repair",
    skill: "general.repair",
    offer: 110,
    status: "offered",
    duration: 35,
  },
];
export function WorkerHome() {
  const available = useStore((s) => s.available),
    active = useStore((s) =>
      s.jobs.find(
        (j) =>
          j.workerId === "worker-0" &&
          !["completed", "cancelled", "disputed"].includes(j.status),
      ),
    ),
    jobs = useStore((s) => s.jobs),
    earnings = jobs
      .filter((j) => j.workerId === "worker-0" && j.status === "completed")
      .reduce((sum, j) => sum + j.offer * 0.85 + j.tip, 0),
    declined = useStore((s) => s.declinedOffers),
    workerSkills = useStore((s) => s.workerSkills);
  return (
    <Screen
      title="Good work starts here."
      subtitle="Make your skills someone’s sigh of relief."
      action={
        <Touch label="Worker profile" onPress={() => go("/worker-profile")}>
          <Avatar name={workers[0].name} uri={workers[0].avatar} size={48} />
        </Touch>
      }
    >
      <Surface style={{ padding: 18 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Col style={{ gap: 5 }}>
            <Row>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 7,
                  backgroundColor: available ? c.green : c.subtle,
                }}
              />
              <Txt size={17} weight="600">
                {available ? "You’re available" : "You’re offline"}
              </Txt>
            </Row>
            <Txt size={12} color={c.muted}>
              {available
                ? "Good opportunities are heading your way."
                : "Take your time. Go online when you’re ready."}
            </Txt>
          </Col>
          <Switch
            accessibilityLabel="Available for work"
            value={available}
            onValueChange={useStore.getState().setAvailable}
            trackColor={{ false: c.line, true: c.orange }}
            thumbColor={c.text}
          />
        </Row>
      </Surface>
      <Row>
        <Surface style={{ flex: 1, gap: 7 }}>
          <Txt size={12} color={c.muted}>
            Demo earnings
          </Txt>
          <Txt size={34} weight="600">
            ${earnings.toFixed(0)}
          </Txt>
          <Touch
            label="View earnings"
            onPress={() => go("/earnings")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Txt color={c.orange} size={12}>
              View earnings ↗
            </Txt>
          </Touch>
        </Surface>
        <Surface style={{ flex: 1, gap: 7 }}>
          <Txt size={12} color={c.muted}>
            OnHand Score
          </Txt>
          <Txt size={34} weight="600">
            {Math.round(qualityScore(workers[0]) * 100)}
            <Txt size={14} color={c.subtle}>
              {" "}
              / 100
            </Txt>
          </Txt>
          <Touch
            label="View OnHand Score"
            onPress={() => go("/reputation")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Txt color={c.green} size={12}>
              Excellent · See breakdown ↗
            </Txt>
          </Touch>
        </Surface>
      </Row>
      {active && (
        <Button
          title={`Continue: ${active.title}`}
          icon={ArrowRight}
          onPress={() => go(`/tracking?id=${active.id}`)}
        />
      )}
      <NeighborhoodMap height={290} demand>
        <View style={{ position: "absolute", top: 20, left: 20 }}>
          <Pill
            text="Steady demand in Williamsburg"
            icon={TrendingUp}
            color={c.orange}
          />
        </View>
      </NeighborhoodMap>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={22} weight="600">
          Good fits nearby
        </Txt>
        <Txt size={12} color={c.subtle}>
          Based on your skills
        </Txt>
      </Row>
      {available ? (
        nearbyJobs
          .filter(
            (j) =>
              workerSkills.includes(j.skill) &&
              !declined.includes(j.id) &&
              !jobs.some((saved) => saved.id === j.id),
          )
          .map((job, i) => (
            <Surface key={job.id} style={{ gap: 18 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Pill text={job.category} color={c.muted} />
                <Txt size={11} color={c.subtle}>
                  Posted {i + 1} min ago · demo
                </Txt>
              </Row>
              <Row>
                <Col style={{ flex: 1, gap: 6 }}>
                  <Txt size={23} weight="600">
                    {job.title}
                  </Txt>
                  <Txt size={12} color={c.muted}>
                    {6 + i * 3} min away · Approx. {job.duration} min job
                  </Txt>
                  <Txt size={12} color={c.subtle}>
                    Williamsburg · exact address after acceptance
                  </Txt>
                </Col>
                <Txt size={34} weight="600">
                  ${job.offer}
                </Txt>
              </Row>
              <Row>
                <Button
                  title="View offer"
                  onPress={() => go(`/offer?id=${job.id}`)}
                  icon={ArrowUpRight}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Pass"
                  secondary
                  onPress={() => {
                    useStore.getState().declineOffer(job.id, "not a fit");
                    useStore
                      .getState()
                      .notify(
                        "Offer declined. We’ll use this feedback to improve your matches.",
                      );
                  }}
                />
              </Row>
            </Surface>
          ))
      ) : (
        <Empty
          title="A moment for you."
          text="Go available when you’re ready to see nearby opportunities."
          action="Go available"
          onPress={() => useStore.getState().setAvailable(true)}
        />
      )}
    </Screen>
  );
}
export function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    offer = nearbyJobs.find((j) => j.id === id),
    [countering, setCountering] = useState(false),
    [amount, setAmount] = useState("195"),
    [reason, setReason] = useState("Extra time and materials"),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [declining, setDeclining] = useState(false);
  if (!offer)
    return (
      <Screen narrow>
        <Empty
          title="That offer has closed"
          text="There are more good fits nearby."
          action="Worker home"
          onPress={() => go("/worker")}
        />
      </Screen>
    );
  async function accept(job: Job) {
    if (busy) return;
    setBusy(true);
    try {
      await useStore.getState().acceptWorkerJob(job);
      go(`/tracking?id=${job.id}`);
    } catch (error) {
      useStore.getState().notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      narrow
      title={
        countering ? "Make a fair counter." : "A good fit for your skills."
      }
      subtitle="A real job for a real neighbor. Demo opportunity."
    >
      <NeighborhoodMap height={210} />
      <Surface style={{ gap: 20 }}>
        <Pill text={offer.category} color={c.orange} />
        <Txt size={28} weight="600">
          {offer.title}
        </Txt>
        <Txt color={c.muted}>{offer.description}</Txt>
        <Row style={{ justifyContent: "space-between" }}>
          <Col style={{ gap: 3 }}>
            <Txt size={12} color={c.subtle}>
              Customer’s offer
            </Txt>
            <Txt size={42} weight="600">
              ${offer.offer}
            </Txt>
          </Col>
          <Col style={{ gap: 6 }}>
            <Txt>Approx. {offer.duration} min</Txt>
            <Txt color={c.muted} size={12}>
              9 min travel · Williamsburg
            </Txt>
          </Col>
        </Row>
        <Pill text="Customer identity verified · demo" icon={ShieldCheck} />
        <Txt size={12} color={c.subtle}>
          The exact address and access notes unlock after you accept. Estimated
          payout: ${(offer.offer * 0.85).toFixed(2)} after 15% platform fee.
        </Txt>
      </Surface>
      {countering ? (
        <>
          <Field
            label="Your counter offer ($)"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <Field
            label="Why the difference?"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          {sent ? (
            <>
              <Pill
                text="Counter sent · awaiting customer approval"
                color={c.amber}
              />
              <Button
                title="Demo: customer approves counter"
                onPress={() => accept({ ...offer, offer: Number(amount) })}
              />
              <Txt size={11} color={c.subtle}>
                This simulates explicit customer approval; prices never change
                silently.
              </Txt>
            </>
          ) : (
            <Button
              title="Send counter offer"
              disabled={
                !Number.isFinite(Number(amount)) ||
                Number(amount) <= 0 ||
                !reason.trim()
              }
              onPress={() => {
                useStore.getState().setCounter({
                  id: `counter-${id}`,
                  jobId: id,
                  amount: Number(amount),
                  reason,
                  status: "pending",
                });
                setSent(true);
              }}
            />
          )}
        </>
      ) : (
        <>
          <Button
            title={busy ? "Accepting…" : `Accept job · $${offer.offer}`}
            disabled={busy}
            icon={Check}
            onPress={() => accept(offer)}
          />
          <Button
            title="Suggest a different price"
            secondary
            onPress={() => setCountering(true)}
          />
          <Button
            title="Decline offer"
            secondary
            onPress={() => setDeclining(true)}
          />
          {declining && (
            <Surface style={{ gap: 12 }}>
              <Txt>What didn’t fit?</Txt>
              {["Too far", "Price too low", "Wrong skill", "Busy"].map((r) => (
                <Button
                  key={r}
                  title={r}
                  secondary
                  compact
                  onPress={() => {
                    useStore.getState().declineOffer(id, r.toLowerCase());
                    go("/worker");
                  }}
                />
              ))}
            </Surface>
          )}
        </>
      )}
    </Screen>
  );
}
export function ReputationScreen() {
  const w = workers[0],
    score = Math.round(qualityScore(w) * 100);
  return (
    <Screen
      narrow
      title="Good work opens doors."
      subtitle="Your OnHand Score reflects more than stars."
    >
      <Surface style={{ alignItems: "center", padding: 32, gap: 10 }}>
        <Award color={c.orange} size={30} />
        <Txt size={14} color={c.muted}>
          OnHand Score
        </Txt>
        <Txt size={96} weight="600" style={{ lineHeight: 115 }}>
          {score}
        </Txt>
        <Pill text="Excellent" />
        <Txt size={12} color={c.muted}>
          Based on {w.metrics.completed} completed jobs
        </Txt>
      </Surface>
      {[
        { label: "Quality", value: w.metrics.recentQuality },
        { label: "Reliability", value: 1 - w.metrics.cancellation },
        { label: "Punctuality", value: w.metrics.punctuality },
        { label: "Completion", value: w.metrics.completion },
      ].map((m) => (
        <Col key={m.label} style={{ gap: 9 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt>{m.label}</Txt>
            <Txt weight="600">{Math.round(m.value * 100)}</Txt>
          </Row>
          <View style={{ height: 6, backgroundColor: c.line, borderRadius: 4 }}>
            <View
              style={{
                width: `${m.value * 100}%`,
                backgroundColor: c.green,
                height: 6,
                borderRadius: 4,
              }}
            />
          </View>
        </Col>
      ))}
      <Surface style={{ gap: 12 }}>
        <Txt size={18} weight="600">
          Consistency gets noticed.
        </Txt>
        <Txt color={c.muted}>
          Higher performance can unlock earlier access to higher-paying jobs.
          Recent work, relevant skills, and reliability all matter.
        </Txt>
        <Txt color={c.muted} size={12}>
          New specialists get fair opportunities to build a track record. A few
          perfect reviews won’t outweigh hundreds of excellent jobs.
        </Txt>
      </Surface>
      <Button
        title="Read your reviews"
        secondary
        onPress={() => go("/reviews")}
      />
    </Screen>
  );
}
export function EarningsScreen() {
  const jobs = useStore((s) => s.jobs).filter(
    (j) => j.workerId === "worker-0" && j.status === "completed",
  );
  return (
    <Screen narrow title="Well earned." subtitle="Clear numbers. No surprises.">
      <Surface style={{ gap: 10, padding: 28 }}>
        <Txt color={c.muted}>Total demo earnings</Txt>
        <Txt size={56} weight="600">
          ${jobs.reduce((n, j) => n + j.offer * 0.85 + j.tip, 0).toFixed(2)}
        </Txt>
        <Pill
          text="Demo payouts · no bank connected"
          icon={Wallet}
          color={c.amber}
        />
      </Surface>
      {jobs.map((j) => (
        <Surface key={j.id}>
          <Col style={{ gap: 14 }}>
            <Txt size={19} weight="600">
              {j.title}
            </Txt>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt color={c.muted}>Job offer</Txt>
              <Txt>${j.offer.toFixed(2)}</Txt>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt color={c.muted}>Platform fee (15%)</Txt>
              <Txt>−${(j.offer * 0.15).toFixed(2)}</Txt>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt color={c.muted}>Tip · all yours</Txt>
              <Txt>${j.tip.toFixed(2)}</Txt>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt weight="600">Your earnings</Txt>
              <Txt color={c.green} weight="600">
                ${(j.offer * 0.85 + j.tip).toFixed(2)}
              </Txt>
            </Row>
          </Col>
        </Surface>
      ))}
      <Button
        title="Payout settings"
        secondary
        onPress={() => go("/worker-settings")}
      />
    </Screen>
  );
}
export function WorkerOnboarding() {
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState<Skill[]>(
      () => useStore.getState().workerSkills,
    ),
    [consent, setConsent] = useState(false);
  return (
    <Screen
      narrow
      title={
        [
          "Good with your hands?",
          "What do you do best?",
          "Trust starts with you.",
        ][step]
      }
      subtitle={
        [
          "Turn your skills into work on your terms.",
          "Choose the work you know. Quality beats quantity.",
          "Customers deserve to know who’s at their door.",
        ][step]
      }
    >
      {step === 0 ? (
        <>
          <NeighborhoodMap height={260} demand />
          <Surface style={{ gap: 16 }}>
            <Txt size={25} weight="600">
              Your neighborhood needs you.
            </Txt>
            <Txt color={c.muted}>
              Choose your jobs. Set your availability. Get paid for thoughtful
              work.
            </Txt>
          </Surface>
          <Button
            title="Let’s get started"
            icon={ArrowRight}
            onPress={() => setStep(1)}
          />
        </>
      ) : step === 1 ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {Object.entries(taxonomy).map(([category, skills]) => (
              <Button
                key={category}
                title={category}
                secondary={!selected.includes(skills[0])}
                onPress={() =>
                  setSelected((s) =>
                    s.includes(skills[0])
                      ? s.filter((v) => v !== skills[0])
                      : [...s, skills[0]],
                  )
                }
              />
            ))}
          </View>
          <Txt color={c.muted} size={12}>
            Regulated work requires separately verified credentials for your
            service area.
          </Txt>
          <Button
            title="Continue to verification"
            disabled={!selected.length}
            onPress={() => setStep(2)}
          />
        </>
      ) : (
        <>
          <Surface>
            <MenuRow
              icon={ShieldCheck}
              title="Identity"
              subtitle="Demo: verified identity"
              onPress={() =>
                useStore
                  .getState()
                  .notify(
                    "Production identity verification requires a verification provider.",
                  )
              }
            />
            <MenuRow
              icon={Award}
              title="Credentials & licenses"
              subtitle="Verified separately for each skill"
              onPress={() =>
                useStore
                  .getState()
                  .notify(
                    "Demo credentials are synthetic. Uploads are not sent to a verifier.",
                  )
              }
            />
            <MenuRow
              icon={ShieldCheck}
              title="Insurance"
              subtitle="Demo policy information"
              onPress={() =>
                useStore
                  .getState()
                  .notify(
                    "Insurance verification will be completed through the production provider.",
                  )
              }
            />
          </Surface>
          <Touch
            label="Acknowledge demo verification"
            onPress={() => setConsent(!consent)}
            style={{ minHeight: 52 }}
          >
            <Row>
              <View
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: consent ? c.orange : c.elevated,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {consent && <Check color={c.bg} size={18} />}
              </View>
              <Txt color={c.muted} style={{ flex: 1 }}>
                I understand this is a simulated worker account.
              </Txt>
            </Row>
          </Touch>
          <Button
            title="Explore worker mode"
            disabled={!consent}
            icon={ArrowRight}
            onPress={() => {
              useStore.getState().setWorkerSkills(selected);
              useStore.getState().setRole("worker");
              go("/worker");
            }}
          />
        </>
      )}
    </Screen>
  );
}
