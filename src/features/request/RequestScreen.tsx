import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Platform } from "react-native";
import { router, type Href } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Image } from "expo-image";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Video,
  PencilLine,
  Sparkles,
  Check,
  Clock3,
  MapPin,
  ShieldCheck,
  CalendarDays,
  Zap,
  ImagePlus,
  Droplets,
  CreditCard,
  ScanLine,
} from "lucide-react-native";
import { colors as c } from "../../design/tokens";
import {
  Button,
  Col,
  Field,
  haptic,
  IconButton,
  Pill,
  Row,
  Screen,
  Skeleton,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { AnimatedNumber } from "../../design/AnimatedNumber";
import { PriceSlider } from "../../design/PriceSlider";
import { NeighborhoodMap } from "../../design/Map";
import { go } from "../../design/Shell";
import { useStore } from "../../state/store";
import { categories, taxonomy, Urgency } from "../../domain/models";
import { pricing, availableMarketplace } from "../../domain/marketplace";
import { workers } from "../../domain/seed";
import { analytics, classifier } from "../../services/adapters";
const steps = [
  "method",
  "analysis",
  "details",
  "location",
  "timing",
  "price",
  "summary",
] as const;
type Step = (typeof steps)[number];
export default function RequestScreen() {
  const [step, setStep] = useState<Step>("method"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    draft = useStore((s) => s.draft),
    edit = useStore((s) => s.editDraft),
    blocked = useStore((s) => s.blocked),
    jobs = useStore((s) => s.jobs),
    [schedule, setSchedule] = useState(draft.scheduledAt || ""),
    [submitting, setSubmitting] = useState(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const estimate = useMemo(
    () => pricing(draft, availableMarketplace(workers, jobs), blocked),
    [draft, blocked, jobs],
  );
  const to = (s: Step) => {
    setError("");
    setStep(s);
    haptic();
  };
  async function analyze() {
    to("analysis");
    setBusy(true);
    try {
      const result = await classifier.analyze(draft.photos, draft.description);
      if (!mounted.current) return;
      edit({
        title: result.title,
        description: result.description,
        category: result.category,
        skill: taxonomy[result.category][0],
        duration: result.duration,
        requiresLicense: result.category === "Electrical",
      });
      haptic("success");
    } catch {
      setError("We couldn’t check that photo. Describe the problem instead.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function photo(camera: boolean, video = false) {
    setError("");
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            "Camera access is off. Choose a photo or describe the problem instead.",
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: video ? ["videos"] : ["images"],
        quality: 0.8,
        videoMaxDuration: 20,
      };
      const result =
        camera && Platform.OS !== "web"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        edit({
          photos: [
            ...draft.photos,
            {
              id: `photo-${Date.now()}`,
              uri: result.assets[0].uri,
              kind: video ? "video" : "before",
            },
          ],
        });
        void analyze();
      }
    } catch {
      setError(
        "The camera isn’t available here. You can choose a photo or describe it.",
      );
    }
  }
  async function locate() {
    setBusy(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Location permission is off. Enter your address below.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      edit({ address: { ...draft.address, coordinates: position.coords } });
      useStore
        .getState()
        .notify(
          "Location updated. Check the street address before continuing.",
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn’t locate you. Enter your address below.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const id = useStore.getState().submit();
      router.replace(`/matching?id=${id}` as Href);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }
  const title = {
    method: "What’s going on?",
    analysis: busy ? "A closer look." : "Does this look right?",
    details: "A little more detail.",
    location: "Where’s the fix?",
    timing: "When do you need help?",
    price: "Your home. Your price.",
    summary: "Let’s get it handled.",
  }[step];
  return (
    <Screen narrow key={step}>
      <Row style={{ justifyContent: "space-between" }}>
        <IconButton
          icon={ArrowLeft}
          label="Previous step"
          onPress={() =>
            steps.indexOf(step) > 0
              ? to(steps[steps.indexOf(step) - 1])
              : router.canGoBack()
                ? router.back()
                : go("/")
          }
        />
        <Txt size={12} color={c.muted}>
          Request help
        </Txt>
        <Txt size={12} color={c.subtle}>
          {Math.max(1, steps.indexOf(step))} / 6
        </Txt>
      </Row>
      <View style={{ height: 3, backgroundColor: c.line, borderRadius: 4 }}>
        <View
          style={{
            height: 3,
            borderRadius: 4,
            width: `${(Math.max(1, steps.indexOf(step)) / 6) * 100}%`,
            backgroundColor: c.orange,
          }}
        />
      </View>
      <Col style={{ gap: 8 }}>
        <Txt size={36} weight="600">
          {title}
        </Txt>
        <Txt color={c.muted}>
          {step === "method"
            ? "Show us the problem. We’ll take it from here."
            : step === "price"
              ? "You set the offer. We find the right specialist."
              : step === "summary"
                ? "One last look before we find your person."
                : "Just the essentials. You can always make changes."}
        </Txt>
      </Col>
      {error ? (
        <Surface style={{ backgroundColor: "#382320" }}>
          <Txt color={c.red}>{error}</Txt>
        </Surface>
      ) : null}
      {step === "method" && (
        <>
          <Touch
            label="Take a photo of the problem"
            onPress={() => photo(true)}
            style={{
              backgroundColor: c.surface,
              borderRadius: 22,
              minHeight: 230,
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              borderWidth: 1,
              borderColor: "#3c3027",
            }}
          >
            <View
              style={{
                width: 82,
                height: 82,
                backgroundColor: c.orangeSoft,
                borderRadius: 27,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={38} color={c.orange} strokeWidth={1.4} />
            </View>
            <Txt size={22} weight="600">
              Take a photo
            </Txt>
            <Txt color={c.muted} size={12}>
              {Platform.OS === "web"
                ? "Choose a photo from this device"
                : "The easiest way to explain it"}
            </Txt>
          </Touch>
          <Row>
            <Button
              title="Short video"
              icon={Video}
              secondary
              style={{ flex: 1 }}
              onPress={() => photo(true, true)}
            />
            <Button
              title="Describe it"
              icon={PencilLine}
              secondary
              style={{ flex: 1 }}
              onPress={() => to("details")}
            />
          </Row>
          <Touch
            label="Try a sample sink leak"
            onPress={() => {
              edit({
                description: "The drain under my kitchen sink is leaking.",
              });
              void analyze();
            }}
            style={{
              minHeight: 50,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Row style={{ gap: 8 }}>
              <Sparkles size={15} color={c.orange} />
              <Txt size={13} color={c.muted}>
                Try it with a sample sink leak
              </Txt>
              <ArrowRight size={15} color={c.muted} />
            </Row>
          </Touch>
          <Txt color={c.subtle} size={11} style={{ textAlign: "center" }}>
            Demo analysis uses a sample classification, not image recognition.
          </Txt>
        </>
      )}
      {step === "analysis" && (
        <>
          {busy ? (
            <>
              <Surface style={{ alignItems: "center", gap: 24, padding: 40 }}>
                <ScanLine size={60} color={c.orange} strokeWidth={1} />
                <Txt size={22} weight="500">
                  Looking at the problem…
                </Txt>
                <Txt color={c.muted} size={12}>
                  Checking likely service and complexity
                </Txt>
              </Surface>
              <Skeleton height={90} />
              <Skeleton height={55} />
            </>
          ) : (
            <>
              <Surface style={{ gap: 20 }}>
                {draft.photos[0] && draft.photos[0].kind !== "video" && (
                  <Image
                    source={{ uri: draft.photos[0].uri }}
                    style={{ height: 190, borderRadius: 13 }}
                    contentFit="cover"
                  />
                )}
                <Pill
                  text="Suggested issue · please confirm"
                  icon={Sparkles}
                  color={c.orange}
                />
                <Txt size={27} weight="600">
                  {draft.title || "Tell us what you see"}
                </Txt>
                <Txt color={c.muted}>{draft.description}</Txt>
                <Row
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: c.line,
                    paddingTop: 18,
                    justifyContent: "space-between",
                  }}
                >
                  <Col style={{ gap: 4 }}>
                    <Txt size={11} color={c.subtle}>
                      Likely service
                    </Txt>
                    <Txt>{draft.category}</Txt>
                  </Col>
                  <Col style={{ gap: 4 }}>
                    <Txt size={11} color={c.subtle}>
                      Complexity
                    </Txt>
                    <Txt>Small repair</Txt>
                  </Col>
                  <Col style={{ gap: 4 }}>
                    <Txt size={11} color={c.subtle}>
                      Typical time
                    </Txt>
                    <Txt>30–60 min</Txt>
                  </Col>
                </Row>
              </Surface>
              <Txt size={11} color={c.subtle}>
                Sample analysis. Your specialist confirms the issue and scope.
              </Txt>
              <Button
                title="Looks right"
                icon={Check}
                onPress={() => to("details")}
              />
              <Button
                title="Let me correct that"
                secondary
                onPress={() => to("details")}
              />
            </>
          )}
        </>
      )}
      {step === "details" && (
        <>
          <Field
            label="What needs fixing?"
            placeholder="e.g. Leaking kitchen sink"
            value={draft.title}
            onChangeText={(title) => edit({ title })}
          />
          <Field
            label="Anything else we should know?"
            multiline
            placeholder="When did it start? What have you tried?"
            value={draft.description}
            onChangeText={(description) => edit({ description })}
          />
          <Txt color={c.muted} size={12}>
            Service
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categories.map((category) => (
              <Touch
                label={category}
                key={category}
                onPress={() =>
                  edit({
                    category,
                    skill: taxonomy[category][0],
                    requiresLicense:
                      category === "Electrical" || category === "HVAC",
                  })
                }
                style={{
                  paddingHorizontal: 15,
                  minHeight: 44,
                  justifyContent: "center",
                  backgroundColor:
                    draft.category === category ? c.orangeSoft : c.surface,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor:
                    draft.category === category ? c.orange : "transparent",
                }}
              >
                <Txt
                  size={12}
                  color={draft.category === category ? c.orange : c.muted}
                >
                  {category}
                </Txt>
              </Touch>
            ))}
          </View>
          <Button
            title={
              draft.photos.length
                ? `${draft.photos.length} attachment(s) · Add another`
                : "Add a photo"
            }
            icon={ImagePlus}
            secondary
            onPress={() => photo(false)}
          />
          {draft.requiresLicense && (
            <Pill
              text="We’ll look for appropriately licensed specialists"
              icon={ShieldCheck}
            />
          )}
          <Button
            title="Continue"
            icon={ArrowRight}
            disabled={!draft.title.trim()}
            onPress={() => to("location")}
          />
        </>
      )}
      {step === "location" && (
        <>
          <NeighborhoodMap height={215} />
          <Button
            title={busy ? "Finding your location…" : "Use my current location"}
            icon={MapPin}
            secondary
            disabled={busy}
            onPress={locate}
          />
          <Field
            label="Street address"
            value={draft.address.street}
            onChangeText={(street) =>
              edit({ address: { ...draft.address, street } })
            }
          />
          <Row>
            <View style={{ flex: 1 }}>
              <Field
                label="Apartment / unit"
                value={draft.address.unit}
                onChangeText={(unit) =>
                  edit({ address: { ...draft.address, unit } })
                }
              />
            </View>
            <View style={{ flex: 2 }}>
              <Field
                label="City and ZIP"
                value={draft.address.city}
                onChangeText={(city) =>
                  edit({ address: { ...draft.address, city } })
                }
              />
            </View>
          </Row>
          <Field
            label="Getting inside"
            multiline
            value={draft.address.instructions}
            onChangeText={(instructions) =>
              edit({ address: { ...draft.address, instructions } })
            }
          />
          <Row>
            <ShieldCheck size={18} color={c.green} />
            <Txt size={12} color={c.muted} style={{ flex: 1 }}>
              Your exact address is shared only with your accepted specialist.
            </Txt>
          </Row>
          <Button
            title="Continue"
            icon={ArrowRight}
            disabled={
              !draft.address.street.trim() || !draft.address.city.trim()
            }
            onPress={() => to("timing")}
          />
        </>
      )}
      {step === "timing" && (
        <>
          {(
            [
              {
                id: "now",
                title: "As soon as possible",
                sub: "Let’s get it sorted now",
                icon: Zap,
              },
              {
                id: "today",
                title: "Sometime today",
                sub: "A little flexibility goes a long way",
                icon: Clock3,
              },
              {
                id: "scheduled",
                title: "Pick a time",
                sub: "Plan around your day",
                icon: CalendarDays,
              },
            ] as const
          ).map((option) => (
            <Touch
              key={option.id}
              label={option.title}
              onPress={() => edit({ urgency: option.id as Urgency })}
            >
              <Surface
                style={{
                  borderWidth: 1,
                  borderColor: draft.urgency === option.id ? c.orange : c.line,
                  backgroundColor:
                    draft.urgency === option.id ? "#28211c" : c.surface,
                }}
              >
                <Row>
                  <option.icon
                    color={draft.urgency === option.id ? c.orange : c.muted}
                    size={24}
                  />
                  <Col style={{ flex: 1, gap: 4 }}>
                    <Txt size={16} weight="500">
                      {option.title}
                    </Txt>
                    <Txt size={12} color={c.muted}>
                      {option.sub}
                    </Txt>
                  </Col>
                  <View
                    style={{
                      height: 22,
                      width: 22,
                      borderRadius: 15,
                      borderColor:
                        draft.urgency === option.id ? c.orange : c.subtle,
                      borderWidth: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {draft.urgency === option.id && (
                      <Check color={c.orange} size={14} />
                    )}
                  </View>
                </Row>
              </Surface>
            </Touch>
          ))}
          {draft.urgency === "scheduled" && (
            <Field
              label="Date and time (e.g. 2026-10-08T10:00)"
              placeholder="YYYY-MM-DDTHH:mm"
              value={schedule}
              onChangeText={(v) => {
                setSchedule(v);
                edit({ scheduledAt: v });
              }}
            />
          )}
          <Button
            title="Set my price"
            icon={ArrowRight}
            onPress={() => {
              if (
                draft.urgency === "scheduled" &&
                (!schedule ||
                  !Number.isFinite(Date.parse(schedule)) ||
                  new Date(schedule) <= new Date())
              ) {
                setError("Choose a valid future date and time.");
                return;
              }
              edit({ offer: estimate.recommended });
              to("price");
            }}
          />
        </>
      )}
      {step === "price" && (
        <>
          <Surface style={{ padding: 28, gap: 20 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt size={12} color={c.muted}>
                Your offer
              </Txt>
              <Pill
                text="You’re in control"
                icon={ShieldCheck}
                color={c.muted}
              />
            </Row>
            <Row
              style={{
                alignItems: "baseline",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <Txt size={38} color={c.subtle} weight="500">
                $
              </Txt>
              <Txt
                size={84}
                weight="600"
                style={{ letterSpacing: -5, lineHeight: 108 }}
              >
                {draft.offer}
              </Txt>
            </Row>
            <PriceSlider
              value={draft.offer}
              onChange={(offer) => {
                if (Math.floor(offer / 25) !== Math.floor(draft.offer / 25))
                  haptic();
                edit({ offer });
                analytics.track("pricing_slider_changed", { offer });
              }}
            />
            <Row style={{ justifyContent: "space-between", marginTop: -15 }}>
              <Txt size={11} color={c.subtle}>
                $50
              </Txt>
              <Txt size={11} color={c.muted}>
                Typical nearby: ${estimate.low}–${estimate.high}
              </Txt>
              <Txt size={11} color={c.subtle}>
                $250
              </Txt>
            </Row>
            <Row>
              {[
                {
                  label: "Save",
                  value: Math.max(50, estimate.recommended - 35),
                },
                { label: "Recommended", value: estimate.recommended },
                {
                  label: "Fastest",
                  value: Math.min(250, estimate.recommended + 35),
                },
              ].map((preset) => (
                <Touch
                  key={preset.label}
                  label={preset.label}
                  onPress={() => edit({ offer: preset.value })}
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    alignItems: "center",
                    backgroundColor:
                      draft.offer === preset.value ? c.orangeSoft : c.elevated,
                    borderRadius: 12,
                    gap: 3,
                  }}
                >
                  <Txt
                    size={12}
                    color={draft.offer === preset.value ? c.orange : c.muted}
                  >
                    {preset.label}
                  </Txt>
                  <Txt size={16} weight="600">
                    ${preset.value}
                  </Txt>
                </Touch>
              ))}
            </Row>
          </Surface>
          <Surface style={{ gap: 20 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Col style={{ gap: 3, flex: 1 }}>
                <Txt size={13} weight="500">
                  Estimated match likelihood
                </Txt>
                <Txt color={c.subtle} size={11}>
                  Based on this demo’s available specialists
                </Txt>
              </Col>
              <AnimatedNumber
                value={Math.round(estimate.probability * 100)}
                suffix="%"
                color={estimate.probability > 0.65 ? c.green : c.amber}
              />
            </Row>
            <View
              style={{ backgroundColor: c.line, height: 5, borderRadius: 4 }}
            >
              <View
                style={{
                  backgroundColor: c.green,
                  height: 5,
                  borderRadius: 4,
                  width: `${estimate.probability * 100}%`,
                }}
              />
            </View>
            <Row style={{ justifyContent: "space-between" }}>
              <Col style={{ gap: 4 }}>
                <Txt size={11} color={c.subtle}>
                  Expected match
                </Txt>
                <Txt size={15} weight="500">
                  {estimate.minutes}
                </Txt>
              </Col>
              <Col style={{ gap: 4 }}>
                <Txt size={11} color={c.subtle}>
                  Worker quality
                </Txt>
                <Txt size={15} weight="500">
                  {estimate.tier}
                </Txt>
              </Col>
              <Col style={{ gap: 4 }}>
                <Txt size={11} color={c.subtle}>
                  Eligible nearby
                </Txt>
                <Txt size={15} weight="500">
                  {estimate.eligible} specialists
                </Txt>
              </Col>
            </Row>
          </Surface>
          <Txt size={12} color={c.muted}>
            Higher offers usually match faster. Estimates aren’t guarantees.
            Parts and additional work always need your approval.
          </Txt>
          <Button
            title={`Continue with $${draft.offer}`}
            icon={ArrowRight}
            disabled={!estimate.eligible}
            onPress={() => to("summary")}
          />
        </>
      )}
      {step === "summary" && (
        <>
          <Surface style={{ gap: 22 }}>
            <Row>
              <View
                style={{
                  padding: 14,
                  backgroundColor: c.orangeSoft,
                  borderRadius: 14,
                }}
              >
                <Droplets color={c.orange} size={24} />
              </View>
              <Col style={{ flex: 1, gap: 3 }}>
                <Txt size={20} weight="600">
                  {draft.title}
                </Txt>
                <Txt size={12} color={c.muted}>
                  {draft.category} · Approx. {draft.duration} min
                </Txt>
              </Col>
              <IconButton
                icon={PencilLine}
                label="Edit job details"
                onPress={() => to("details")}
              />
            </Row>
            <Txt color={c.muted}>
              {draft.description ||
                "Your specialist will confirm the scope before starting."}
            </Txt>
            <Row>
              <MapPin size={18} color={c.muted} />
              <Col style={{ flex: 1, gap: 2 }}>
                <Txt>
                  {draft.address.street}, {draft.address.unit}
                </Txt>
                <Txt size={12} color={c.subtle}>
                  {draft.address.city}
                </Txt>
              </Col>
              <IconButton
                icon={PencilLine}
                label="Edit location"
                onPress={() => to("location")}
              />
            </Row>
            <Row>
              <Clock3 size={18} color={c.muted} />
              <Txt style={{ flex: 1 }}>
                {draft.urgency === "now"
                  ? "As soon as possible"
                  : draft.urgency === "today"
                    ? "Today, whenever works"
                    : draft.scheduledAt}
              </Txt>
              <IconButton
                icon={PencilLine}
                label="Edit timing"
                onPress={() => to("timing")}
              />
            </Row>
            <View style={{ height: 1, backgroundColor: c.line }} />
            <Row style={{ justifyContent: "space-between" }}>
              <Col style={{ gap: 2 }}>
                <Txt weight="500">Your total offer</Txt>
                <Txt size={11} color={c.subtle}>
                  Platform fee included · before optional tip
                </Txt>
              </Col>
              <Txt size={34} weight="600">
                ${draft.offer}
              </Txt>
            </Row>
            <Row>
              <CreditCard color={c.muted} size={18} />
              <Txt color={c.muted} size={12}>
                Demo Visa •••• 4242 · No real charge
              </Txt>
            </Row>
          </Surface>
          <Row>
            <ShieldCheck color={c.green} size={20} />
            <Txt size={12} color={c.muted} style={{ flex: 1 }}>
              Authorized when matched. Payment is captured only after you
              approve the finished work.
            </Txt>
          </Row>
          <Button
            title={submitting ? "Sending your request…" : "Find my specialist"}
            icon={ArrowUpRight}
            onPress={submit}
            disabled={submitting}
          />
          <Button
            title="Adjust my offer"
            secondary
            onPress={() => to("price")}
          />
        </>
      )}
    </Screen>
  );
}
