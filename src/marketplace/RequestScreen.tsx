import { useReducedMotion } from "react-native-reanimated";
import React, { useState } from "react";
import { Pressable, View, Modal, ScrollView } from "react-native";
import { router } from "expo-router";
import { useRequestDraft } from "./draft";
import { useHome } from "./Provider";
import { taxonomy, categories, type Category } from "../domain/models";
import {
  Action,
  CommandError,
  Copy,
  Input,
  Line,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
  useCommand,
  useNow,
} from "./ui";
import { useQuery } from "@tanstack/react-query";
import { requireDatabase } from "../services/supabase";
import { money } from "./api";
import SchedulePicker from "./SchedulePicker";
export default function RequestScreen() {
  const { data } = useHome();
  const command = useCommand("create_job");
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || data?.settings?.reduced_motion;
  const draft = useRequestDraft();
  const { description, category, budget, timing, scheduled, duration } = draft;
  const plain = description.trim().replace(/\s+/g, " ");
  const first = plain.match(/^[^.!?]+[.!?]?/)?.[0] || plain;
  const title = (first.length >= 5 ? first : plain).slice(0, 80);
  const address = draft.address || data?.addresses[0]?.id || "";
  const setDescription = (description: string) => draft.edit({ description });
  const setCategory = (category: Category) => draft.edit({ category });
  const setBudget = (budget: string) => draft.edit({ budget });
  const setAddress = (address: string) => draft.edit({ address });
  const setTiming = (timing: "now" | "today" | "scheduled") =>
    draft.edit({
      timing,
      ...(timing === "scheduled" && !scheduled
        ? { scheduled: new Date(now + 3600000).toISOString() }
        : {}),
    });
  const setScheduled = (scheduled: string) => draft.edit({ scheduled });
  const setDuration = (duration: string) => draft.edit({ duration });
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [review, setReview] = useState(false);
  const [options, setOptions] = useState(timing !== "now");
  const cents = Math.round(Number(budget) * 100);
  const now = useNow(30000);
  const regulated = ["Electrical", "Plumbing", "HVAC"].includes(category);
  const coverage = useQuery({
    queryKey: ["licensed-address", data?.profile.id, address],
    enabled: Boolean(regulated && address && data?.profile.role === "customer"),
    queryFn: async () => {
      const { data, error } = await requireDatabase().rpc(
        "licensed_address_available",
        { p_address: address },
      );
      if (error) throw error;
      return Boolean(data);
    },
  });
  const valid =
    title.trim().length >= 5 &&
    description.trim().length >= 10 &&
    Number.isFinite(cents) &&
    cents >= 1000 &&
    cents <= 1000000 &&
    address &&
    (!regulated || coverage.data === true) &&
    Number.isInteger(Number(duration)) &&
    Number(duration) >= 5 &&
    Number(duration) <= 1440 &&
    (timing !== "scheduled" ||
      (Number.isFinite(Date.parse(scheduled)) &&
        Date.parse(scheduled) > now &&
        Date.parse(scheduled) <= now + 90 * 86400000));
  if (data?.profile.role !== "customer")
    return (
      <Page title="Find your next job">
        <QuietAction
          title="Back to available work"
          onPress={() => router.replace("/")}
        />
      </Page>
    );
  async function submit() {
    const result = await command.run({
      title: title.trim(),
      description: description.trim(),
      skill: taxonomy[category][0],
      offer_cents: cents,
      address_id: address,
      urgency: timing,
      duration_minutes: Number(duration),
      scheduled_at:
        timing === "scheduled" ? new Date(scheduled).toISOString() : null,
    });
    if (result) {
      draft.reset();
      router.replace({ pathname: "/job", params: { id: String(result.id) } });
    }
  }
  const selectedAddress = data.addresses.find((a) => a.id === address);
  return (
    <Page
      back
      title={review ? "Ready to post." : "Post a job."}
      subtitle={
        review
          ? "One clear job. One agreed price."
          : "A few details are all we need."
      }
    >
      <Stack style={{ gap: 24 }}>
        {review ? (
          <>
            <View style={{ paddingVertical: 12, gap: 12 }}>
              <Copy weight="700" size={26}>
                {description}
              </Copy>
              <Copy size={48} weight="700">
                {money(cents)}
              </Copy>
              <Copy color={palette.slate}>
                {category} · {duration} min estimated work
              </Copy>
              <Copy color={palette.slate}>
                {selectedAddress?.street}
                {selectedAddress?.unit ? `, ${selectedAddress.unit}` : ""},
                {selectedAddress?.city}
              </Copy>
              <Copy size={14} color={palette.slate}>
                {timing === "scheduled"
                  ? new Date(scheduled).toLocaleString()
                  : timing === "now"
                    ? "As soon as possible"
                    : "Today"}
              </Copy>
            </View>
            <Notice>
              Your exact address is shared only with the assigned worker. You
              authorize the agreed payment after a match and approve completion
              before capture.
            </Notice>
            <CommandError command={command} />
            <Action
              title="Post job"
              busy={command.busy}
              onPress={() => void submit()}
            />
            <QuietAction
              title="Edit details"
              onPress={() => setReview(false)}
              disabled={command.busy}
            />
          </>
        ) : (
          <>
            <Input
              label="What needs doing?"
              placeholder="Mount two shelves in my living room. Please bring a drill and a level."
              value={description}
              onChangeText={setDescription}
              maxLength={4000}
              multiline
            />
            <Copy size={13} color={palette.slate}>
              Keep phone numbers and exact addresses out of the description.
            </Copy>
            <Stack style={{ gap: 10 }}>
              <Copy size={14} weight="600">
                Type of work
              </Copy>
              <Action
                title={category}
                secondary
                onPress={() => setChoosingCategory(true)}
              />
              <Modal
                visible={choosingCategory}
                transparent
                animationType={reduced ? "none" : "fade"}
                onRequestClose={() => setChoosingCategory(false)}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#18233466",
                    justifyContent: "center",
                    padding: 24,
                  }}
                >
                  <View
                    style={{
                      maxHeight: "80%",
                      maxWidth: 480,
                      width: "100%",
                      alignSelf: "center",
                      backgroundColor: palette.white,
                      borderRadius: 20,
                      padding: 20,
                    }}
                  >
                    <Copy size={23} weight="700">
                      Type of work
                    </Copy>
                    <ScrollView>
                      {categories.map((cat) => (
                        <QuietAction
                          key={cat}
                          title={cat}
                          onPress={() => {
                            setCategory(cat);
                            setChoosingCategory(false);
                          }}
                        />
                      ))}
                    </ScrollView>
                    <QuietAction
                      title="Close"
                      onPress={() => setChoosingCategory(false)}
                    />
                  </View>
                </View>
              </Modal>
            </Stack>
            <Input
              label="What are you willing to pay? ($)"
              placeholder="120"
              keyboardType="decimal-pad"
              value={budget}
              onChangeText={setBudget}
              maxLength={9}
              style={{ fontSize: 32, minHeight: 74, fontWeight: "600" }}
            />
            <Copy size={13} color={palette.slate}>
              Choose $10–$10,000. No charge for posting. Materials and scope
              changes need your agreement.
            </Copy>
            <Stack style={{ gap: 10 }}>
              <Copy size={14} weight="600">
                Where
              </Copy>
              {data.addresses.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => setAddress(a.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: address === a.id }}
                  style={{
                    padding: 16,
                    backgroundColor:
                      address === a.id ? palette.wash : palette.white,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: address === a.id ? palette.blue : palette.line,
                  }}
                >
                  <Copy weight="600">{a.label}</Copy>
                  <Copy size={14} color={palette.slate}>
                    {a.street}, {a.city}
                  </Copy>
                </Pressable>
              ))}
              <QuietAction
                title={
                  data.addresses.length ? "Manage addresses" : "Add an address"
                }
                onPress={() => router.push("/addresses")}
              />
            </Stack>
            <QuietAction
              title={
                options ? "Hide timing and duration" : "Timing and duration"
              }
              onPress={() => setOptions(!options)}
            />
            {options && (
              <>
                <Stack style={{ gap: 10 }}>
                  <Copy size={14} weight="600">
                    When
                  </Copy>
                  <Line>
                    {(["now", "today", "scheduled"] as const).map((t) => (
                      <Pressable
                        key={t}
                        accessibilityRole="button"
                        accessibilityState={{ selected: timing === t }}
                        onPress={() => setTiming(t)}
                        style={{
                          flex: 1,
                          minHeight: 48,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor:
                            timing === t ? palette.wash : palette.white,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            timing === t ? palette.blue : palette.line,
                        }}
                      >
                        <Copy
                          size={14}
                          color={timing === t ? palette.blue : palette.ink}
                        >
                          {t === "now"
                            ? "Now"
                            : t === "today"
                              ? "Today"
                              : "Schedule"}
                        </Copy>
                      </Pressable>
                    ))}
                  </Line>
                  {timing === "scheduled" && (
                    <SchedulePicker value={scheduled} onChange={setScheduled} />
                  )}
                </Stack>
                <Input
                  label="Estimated minutes of work"
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </>
            )}
            {regulated && (
              <Notice>
                {coverage.isPending
                  ? "Checking availability for licensed work…"
                  : coverage.data
                    ? "This work is offered only to workers with current, verified credentials for your area."
                    : "Licensed work is not available at this address yet. Choose another type of work or another address."}
              </Notice>
            )}
            <Action
              title="Review job"
              disabled={!valid}
              onPress={() => setReview(true)}
            />
          </>
        )}
      </Stack>
    </Page>
  );
}
