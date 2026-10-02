import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { ArrowRight, ShieldCheck, Star, Clock3, X } from "lucide-react-native";
import {
  Avatar,
  Button,
  Col,
  Empty,
  haptic,
  Pill,
  Row,
  Screen,
  Surface,
  Txt,
} from "../../design/ui";
import { colors as c } from "../../design/tokens";
import { NeighborhoodMap } from "../../design/Map";
import { go } from "../../design/Shell";
import {
  dispatch,
  pricing,
  availableMarketplace,
} from "../../domain/marketplace";
import { workers } from "../../domain/seed";
import { useStore } from "../../state/store";
import { analytics } from "../../services/adapters";
export default function MatchingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === id)),
    blocked = useStore((s) => s.blocked),
    [stage, setStage] = useState("Finding nearby specialists"),
    [count, setCount] = useState(0),
    [wave, setWave] = useState(0),
    [expired, setExpired] = useState(false),
    [attempt, setAttempt] = useState(0),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = useStore.getState().jobs.find((j) => j.id === id);
    if (!current || !["matching", "offered"].includes(current.status)) return;
    const abort = new AbortController();
    controller.current = abort;
    analytics.track("matching_started");
    void dispatch(
      current,
      availableMarketplace(workers, useStore.getState().jobs, id),
      {
        signal: abort.signal,
        blocked,
        onStage: (text, w, n) => {
          setStage(text);
          setWave(w);
          setCount(n);
          if (n) analytics.track("candidate_generated", { count: n });
        },
        onOffer: (offer) => analytics.track("offer_sent", { wave: offer.wave }),
      },
    ).then(async (result) => {
      if (abort.signal.aborted) return;
      if (result.candidate) {
        analytics.track("offer_accepted");
        await useStore
          .getState()
          .match(id, result.candidate.worker.id, result.candidate.eta);
        haptic("success");
      } else if (result.reason === "expired") {
        setExpired(true);
        haptic("warning");
      }
    });
    return () => abort.abort();
  }, [id, attempt, blocked]);
  if (!job)
    return (
      <Screen narrow>
        <Empty
          title="Start with a request"
          text="Tell us what needs fixing and we’ll find your person."
          action="Request help"
          onPress={() => go("/request")}
        />
      </Screen>
    );
  const worker = workers.find((w) => w.id === job.workerId),
    matched = !!worker && job.status === "matched";
  if (job.status === "cancelled")
    return (
      <Screen narrow>
        <Empty
          title="Request cancelled"
          text="No payment was taken. We’re here when you’re ready."
          action="Back home"
          onPress={() => go("/")}
        />
      </Screen>
    );
  return (
    <Screen narrow>
      <Row style={{ justifyContent: "space-between" }}>
        <Pill
          text={
            matched
              ? "Match found"
              : expired
                ? "Still looking"
                : "Your request is live"
          }
          color={matched ? c.green : c.orange}
        />
        <Txt color={c.subtle} size={12}>
          ${job.offer} · {job.category}
        </Txt>
      </Row>
      <Col style={{ gap: 8 }}>
        <Txt size={38} weight="600">
          {matched
            ? "Meet your helping hand."
            : expired
              ? "A little more time?"
              : "Finding your person."}
        </Txt>
        <Txt color={c.muted}>
          {matched
            ? "A good match for your home and your job."
            : expired
              ? "No one accepted this round. Retry or adjust your offer."
              : "We’re checking skills, availability, and arrival times."}
        </Txt>
      </Col>
      <NeighborhoodMap
        height={310}
        searching={!matched && !expired}
        tracking={matched}
      >
        <View style={{ position: "absolute", top: 20, left: 20 }}>
          <Pill
            text={
              matched
                ? `${job.eta} min away`
                : `${count || pricing(job, workers, blocked).eligible} qualified specialists nearby`
            }
            color={matched ? c.orange : c.green}
          />
        </View>
      </NeighborhoodMap>
      {matched && worker ? (
        <>
          <Surface style={{ gap: 20 }}>
            <Row>
              <Avatar name={worker.name} uri={worker.avatar} size={68} />
              <Col style={{ flex: 1, gap: 5 }}>
                <Row>
                  <Txt size={25} weight="600">
                    {worker.name}
                  </Txt>
                  <ShieldCheck color={c.green} size={18} />
                </Row>
                <Txt size={13} color={c.muted}>
                  {job.category} specialist
                </Txt>
                <Row style={{ gap: 5 }}>
                  <Star size={13} color={c.amber} fill={c.amber} />
                  <Txt size={12}>{worker.metrics.rating.toFixed(2)}</Txt>
                  <Txt size={12} color={c.subtle}>
                    · {worker.metrics.completed} jobs
                  </Txt>
                </Row>
              </Col>
            </Row>
            <Row
              style={{
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: c.line,
                paddingTop: 18,
              }}
            >
              <Col style={{ gap: 3 }}>
                <Txt color={c.muted} size={11}>
                  Completion rate
                </Txt>
                <Txt weight="600">
                  {Math.round(worker.metrics.completion * 100)}%
                </Txt>
              </Col>
              <Col style={{ gap: 3 }}>
                <Txt color={c.muted} size={11}>
                  Arrival estimate
                </Txt>
                <Txt weight="600">{job.eta} min</Txt>
              </Col>
              <Col style={{ gap: 3 }}>
                <Txt color={c.muted} size={11}>
                  Agreed price
                </Txt>
                <Txt weight="600">${job.offer}</Txt>
              </Col>
            </Row>
          </Surface>
          <Button
            title={`Confirm ${worker.name.split(" ")[0]}`}
            icon={ArrowRight}
            onPress={() => {
              useStore.getState().advance(job.id, "worker_en_route");
              router.replace(`/tracking?id=${id}` as Href);
            }}
          />
          <Button
            title="View specialist profile"
            secondary
            onPress={() => go(`/specialist?id=${worker.id}`)}
          />
        </>
      ) : expired ? (
        <>
          <Button
            title="Try another round"
            icon={ArrowRight}
            onPress={() => {
              setExpired(false);
              setAttempt((a) => a + 1);
            }}
          />
          <Button
            title="Adjust offer"
            secondary
            onPress={() => {
              useStore.getState().advance(id, "cancelled");
              useStore.getState().resetDraft();
              useStore.getState().editDraft({ ...job, offer: job.offer + 20 });
              go("/request");
            }}
          />
        </>
      ) : (
        <Surface style={{ gap: 20 }}>
          <Row>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c.orangeSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock3 size={20} color={c.orange} />
            </View>
            <Col style={{ gap: 5 }}>
              <Txt size={17} weight="500">
                {stage}…
              </Txt>
              <Txt size={12} color={c.muted}>
                The right skills. A fair price. Nearby.
              </Txt>
            </Col>
          </Row>
          <Row style={{ gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  height: 3,
                  flex: 1,
                  backgroundColor: wave > i ? c.orange : c.line,
                  borderRadius: 3,
                }}
              />
            ))}
          </Row>
        </Surface>
      )}
      {!matched && (
        <Button
          title="Cancel request"
          secondary
          icon={X}
          onPress={() => {
            controller.current?.abort();
            useStore.getState().advance(id, "cancelled");
            go("/");
          }}
        />
      )}
      <Txt size={11} color={c.subtle} style={{ textAlign: "center" }}>
        Demo marketplace · no real specialist is dispatched
      </Txt>
    </Screen>
  );
}
