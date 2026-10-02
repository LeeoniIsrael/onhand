import React, { useState } from "react";
import { View, Switch, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  ArrowLeftRight,
  ShieldCheck,
  MapPin,
  CreditCard,
  Settings,
  Bell,
  UserRound,
  ChevronRight,
  Star,
  Award,
  Check,
  Plus,
  Wrench,
  Droplets,
  Zap,
  Armchair,
  Frame,
  Paintbrush,
  Wind,
  Truck,
  Leaf,
  LifeBuoy,
  Flag,
  Phone,
  Ban,
  Hand,
  Wallet,
  Sparkles,
} from "lucide-react-native";
import {
  Avatar,
  Button,
  Col,
  Empty,
  Field,
  IconButton,
  MenuRow,
  Pill,
  Row,
  Screen,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { colors as c } from "../../design/tokens";
import { go } from "../../design/Shell";
import { NeighborhoodMap } from "../../design/Map";
import { useStore } from "../../state/store";
import { categories, taxonomy } from "../../domain/models";
import { workers } from "../../domain/seed";
import { qualityScore } from "../../domain/marketplace";
export function ProfileScreen() {
  const name = useStore((s) => s.name),
    role = useStore((s) => s.role),
    [editing, setEditing] = useState(false),
    [value, setValue] = useState(name);
  return (
    <Screen narrow title="Make yourself at home.">
      <Surface style={{ gap: 18 }}>
        <Row>
          <Avatar name={`${name} Morgan`} size={72} color="#56665b" />
          <Col style={{ gap: 4, flex: 1 }}>
            <Txt size={28} weight="600">
              {role === "worker" ? "Mike Rivera" : `${name} Morgan`}
            </Txt>
            <Txt color={c.muted} size={12}>
              {role === "worker"
                ? "Your worker account"
                : "Your personal account"}
            </Txt>
            <Pill text="Demo account" color={c.muted} />
          </Col>
          <IconButton
            icon={UserRound}
            label="Edit profile"
            onPress={() => setEditing(!editing)}
          />
        </Row>
        {editing && (
          <>
            <Field label="First name" value={value} onChangeText={setValue} />
            <Button
              title="Save name"
              disabled={!value.trim()}
              onPress={() => {
                useStore.getState().updateProfile(value.trim());
                setEditing(false);
              }}
            />
          </>
        )}
      </Surface>
      <Surface>
        <MenuRow
          icon={CreditCard}
          title="Payment methods"
          subtitle="Pay only when the work is done"
          onPress={() => go("/payments")}
        />
        <MenuRow
          icon={MapPin}
          title="Your places"
          subtitle="Saved addresses and access notes"
          onPress={() => go("/addresses")}
        />
        <MenuRow
          icon={ShieldCheck}
          title="Safety & support"
          subtitle="A little peace of mind"
          onPress={() => go("/safety")}
        />
        <MenuRow
          icon={Settings}
          title="Settings"
          subtitle="Make OnHand yours"
          onPress={() => go("/settings")}
        />
        <MenuRow
          icon={Sparkles}
          title="Meet OnHand"
          subtitle="A quick tour of how it works"
          onPress={() => go("/onboarding")}
        />
      </Surface>
      <Surface>
        <MenuRow
          icon={Wrench}
          title={
            role === "customer"
              ? "Put your skills to work"
              : "Your professional profile"
          }
          subtitle={
            role === "customer"
              ? "Explore becoming an OnHand specialist"
              : "Credentials, reputation, and reviews"
          }
          onPress={() =>
            go(role === "customer" ? "/worker-onboarding" : "/worker-profile")
          }
        />
      </Surface>
      <Button
        title={
          role === "customer"
            ? "Switch to worker mode"
            : "Switch to customer mode"
        }
        icon={ArrowLeftRight}
        secondary
        onPress={() => {
          useStore
            .getState()
            .setRole(role === "customer" ? "worker" : "customer");
          go(role === "customer" ? "/worker" : "/");
        }}
      />
      <Txt color={c.subtle} size={11} style={{ textAlign: "center" }}>
        OnHand 1.0 · Capable help, nearby, now.
      </Txt>
    </Screen>
  );
}
export function AddressesScreen() {
  const addresses = useStore((s) => s.addresses),
    [editing, setEditing] = useState(false),
    [address, setAddress] = useState(addresses[0]);
  return (
    <Screen narrow title="Your places." subtitle="Home is where we can help.">
      {!editing ? (
        <>
          {addresses.map((a) => (
            <Touch
              label={`Edit ${a.label}`}
              key={a.id}
              onPress={() => {
                setAddress(a);
                setEditing(true);
              }}
            >
              <Surface>
                <Row>
                  <MapPin color={c.orange} size={24} />
                  <Col style={{ flex: 1, gap: 4 }}>
                    <Txt size={19} weight="600">
                      {a.label}
                    </Txt>
                    <Txt color={c.muted}>
                      {a.street}, {a.unit}
                    </Txt>
                    <Txt color={c.subtle} size={12}>
                      {a.city}
                    </Txt>
                  </Col>
                  <ChevronRight color={c.subtle} size={18} />
                </Row>
              </Surface>
            </Touch>
          ))}
          <Button
            title="Add a place"
            icon={Plus}
            onPress={() => {
              setAddress({
                ...addresses[0],
                id: `address-${Date.now()}`,
                label: "",
                street: "",
                unit: "",
                instructions: "",
              });
              setEditing(true);
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="Place name"
            placeholder="Home, work, or somewhere else"
            value={address.label}
            onChangeText={(label) => setAddress((a) => ({ ...a, label }))}
          />
          <Field
            label="Street address"
            value={address.street}
            onChangeText={(street) => setAddress((a) => ({ ...a, street }))}
          />
          <Field
            label="Apartment / unit"
            value={address.unit}
            onChangeText={(unit) => setAddress((a) => ({ ...a, unit }))}
          />
          <Field
            label="City and ZIP"
            value={address.city}
            onChangeText={(city) => setAddress((a) => ({ ...a, city }))}
          />
          <Field
            label="Access instructions"
            multiline
            value={address.instructions}
            onChangeText={(instructions) =>
              setAddress((a) => ({ ...a, instructions }))
            }
          />
          <Button
            title="Save place"
            disabled={
              !address.label.trim() ||
              !address.street.trim() ||
              !address.city.trim()
            }
            onPress={() => {
              useStore.getState().saveAddress(address);
              useStore.getState().editDraft({ address });
              setEditing(false);
              useStore
                .getState()
                .notify("Place saved and selected for your next request.");
            }}
          />
          <Button title="Cancel" secondary onPress={() => setEditing(false)} />
        </>
      )}
      <Row>
        <ShieldCheck size={17} color={c.green} />
        <Txt style={{ flex: 1 }} size={12} color={c.muted}>
          Exact addresses stay private until a specialist accepts.
        </Txt>
      </Row>
    </Screen>
  );
}
export function PaymentMethodsScreen() {
  const method = useStore((s) => s.paymentMethod),
    setMethod = useStore((s) => s.setPaymentMethod),
    [adding, setAdding] = useState(false);
  return (
    <Screen
      narrow
      title="Simple. Secure. Settled."
      subtitle="Your payment methods."
    >
      <Surface
        style={{
          padding: 28,
          minHeight: 195,
          justifyContent: "space-between",
          backgroundColor: "#292c29",
        }}
      >
        <Row style={{ justifyContent: "space-between" }}>
          <CreditCard size={30} color={c.muted} />
          <Pill text="Default · demo" color={c.green} />
        </Row>
        <Col style={{ gap: 5 }}>
          <Txt size={23} weight="600">
            •••• •••• •••• {method === "Visa" ? "4242" : "5556"}
          </Txt>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt color={c.muted} size={12}>
              ALEX MORGAN
            </Txt>
            <Txt size={19} weight="700">
              {method}
            </Txt>
          </Row>
        </Col>
      </Surface>
      {adding && (
        <Surface style={{ gap: 16 }}>
          <Txt>Choose a test payment method</Txt>
          {["Visa", "Mastercard"].map((m) => (
            <Button
              key={m}
              title={`Demo ${m}`}
              secondary
              onPress={() => {
                setMethod(m);
                setAdding(false);
                useStore
                  .getState()
                  .notify("Test payment method selected for this demo.");
              }}
            />
          ))}
        </Surface>
      )}
      <Button
        title="Add test payment method"
        icon={Plus}
        secondary
        onPress={() => setAdding(!adding)}
      />
      <Surface style={{ gap: 12 }}>
        <ShieldCheck color={c.green} size={24} />
        <Txt weight="600">You approve the final charge.</Txt>
        <Txt color={c.muted}>
          We authorize the agreed offer when a specialist accepts. You approve
          capture after the work is complete. Extra work needs your approval
          first.
        </Txt>
        <Txt color={c.subtle} size={12}>
          This build uses simulated payments. Never enter real card details
          here.
        </Txt>
      </Surface>
    </Screen>
  );
}
export function SettingsScreen({ worker = false }: { worker?: boolean }) {
  const notifications = useStore((s) => s.notifications),
    reduced = useStore((s) => s.reducedMotion),
    [reset, setReset] = useState(false);
  return (
    <Screen
      narrow
      title={worker ? "Work your way." : "The way you like it."}
      subtitle="Your preferences, on this device."
    >
      <Surface>
        <MenuRow
          icon={Bell}
          title="Job updates"
          subtitle="In-app notification preference"
          onPress={() =>
            useStore.getState().setting("notifications", !notifications)
          }
          right={
            <Switch
              value={notifications}
              onValueChange={(v) =>
                useStore.getState().setting("notifications", v)
              }
              accessibilityLabel="Job updates"
              trackColor={{ true: c.orange, false: c.line }}
            />
          }
        />
        <MenuRow
          icon={Sparkles}
          title="Reduce motion"
          subtitle="Keep transitions quiet"
          onPress={() => useStore.getState().setting("reducedMotion", !reduced)}
          right={
            <Switch
              value={reduced}
              onValueChange={(v) =>
                useStore.getState().setting("reducedMotion", v)
              }
              accessibilityLabel="Reduce motion"
              trackColor={{ true: c.orange, false: c.line }}
            />
          }
        />
        <MenuRow
          icon={ShieldCheck}
          title="Blocked specialists"
          subtitle={`${useStore.getState().blocked.length} blocked on this device`}
          onPress={() => go("/safety")}
        />
        {worker && (
          <MenuRow
            icon={Wallet}
            title="Payout account"
            subtitle="Demo · production onboarding required"
            onPress={() =>
              useStore
                .getState()
                .notify(
                  "A production Stripe Connect account is needed for bank payouts. No bank information is collected in this demo.",
                )
            }
          />
        )}
      </Surface>
      <Surface style={{ gap: 12 }}>
        <Txt size={18} weight="600">
          About this demo
        </Txt>
        <Txt color={c.muted}>
          Jobs are matched against 28 synthetic workers. Travel estimates, photo
          analysis, conversations, verification, and payments are simulated.
          Your demo progress is saved on this device.
        </Txt>
        <Button
          title={
            reset ? "Confirm reset of demo progress" : "Reset demo progress"
          }
          secondary
          onPress={() => {
            if (!reset) setReset(true);
            else {
              useStore.getState().resetDemo();
              go("/");
            }
          }}
        />
      </Surface>
    </Screen>
  );
}
export function SafetyScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === id)),
    [reporting, setReporting] = useState(false),
    [reason, setReason] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <Screen
      narrow
      title="You’re in control."
      subtitle="Support for your home, your work, and your peace of mind."
    >
      <Surface style={{ gap: 16 }}>
        <ShieldCheck color={c.green} size={34} />
        <Txt size={23} weight="600">
          Know who’s coming.
        </Txt>
        <Txt color={c.muted}>
          Check identity, relevant skills, and individual credentials before
          confirming a specialist. Licensing and insurance vary by person and
          service.
        </Txt>
        <Pill text="Demo verification states are synthetic" color={c.amber} />
      </Surface>
      <Surface>
        <MenuRow
          icon={Flag}
          title="Report a concern"
          subtitle={job ? job.title : "Tell us what happened"}
          onPress={() => setReporting(true)}
        />
        <MenuRow
          icon={LifeBuoy}
          title="Help with a job"
          subtitle="Scope, payment, or unfinished work"
          onPress={() => {
            setReporting(true);
            setReason("I need help with my job: ");
          }}
        />
        {job?.workerId && (
          <MenuRow
            icon={Ban}
            title="Block this specialist"
            subtitle="They won’t appear in future matches"
            onPress={() => {
              useStore.getState().block(job.workerId!);
              useStore
                .getState()
                .notify("Specialist blocked from future matching.");
            }}
          />
        )}
        <MenuRow
          icon={Phone}
          title="Immediate danger?"
          subtitle="Call your local emergency number"
          onPress={() => {
            void Linking.openURL("tel:911");
          }}
        />
      </Surface>
      {reporting && (
        <Surface style={{ gap: 16 }}>
          {sent ? (
            <>
              <Pill text="Report saved on this device" />
              <Txt color={c.muted}>
                This is a demo. No support team was contacted. For urgent
                danger, contact local emergency services.
              </Txt>
            </>
          ) : (
            <>
              <Txt size={20} weight="600">
                What happened?
              </Txt>
              <Field
                label="Your concern"
                multiline
                value={reason}
                onChangeText={setReason}
              />
              <Button
                title="Save demo report"
                disabled={reason.trim().length < 5}
                onPress={() => {
                  if (job) {
                    useStore.getState().addMessage({
                      id: `report-${Date.now()}`,
                      jobId: job.id,
                      sender: "system",
                      text: `Support report (demo): ${reason}`,
                      createdAt: new Date().toISOString(),
                      state: "sent",
                    });
                    if (
                      [
                        "in_progress",
                        "awaiting_completion_confirmation",
                        "completed",
                      ].includes(job.status)
                    )
                      useStore.getState().advance(job.id, "disputed");
                  }
                  useStore.getState().report(reason, id);
                  setSent(true);
                }}
              />
            </>
          )}
        </Surface>
      )}
      <Txt size={12} color={c.subtle}>
        You can review price changes before agreeing. Keep communication in the
        app and don’t share payment details in chat.
      </Txt>
    </Screen>
  );
}
export function SpecialistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    w = workers.find((w) => w.id === id) || workers[0];
  return (
    <Screen narrow>
      <Surface style={{ alignItems: "center", gap: 14, padding: 32 }}>
        <Avatar name={w.name} uri={w.avatar} size={96} color={w.color} />
        <Row>
          <Txt size={30} weight="600">
            {w.name}
          </Txt>
          <ShieldCheck color={c.green} size={22} />
        </Row>
        <Txt color={c.muted}>Your neighborhood specialist</Txt>
        <Row>
          <Pill text={`★ ${w.metrics.rating.toFixed(2)}`} color={c.amber} />
          <Pill text={`${w.metrics.completed} jobs`} color={c.muted} />
        </Row>
      </Surface>
      <Txt size={18} weight="500">
        A little about {w.name.split(" ")[0]}
      </Txt>
      <Txt color={c.muted}>{w.bio}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {w.skills.map((s) => (
          <Pill
            key={s.skill}
            text={s.skill.replace(".", " · ")}
            color={c.muted}
          />
        ))}
      </View>
      <Surface style={{ gap: 16 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Identity</Txt>
          <Pill text="Verified · demo" icon={Check} />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Background check</Txt>
          <Txt color={w.backgroundCheck === "verified" ? c.green : c.amber}>
            {w.backgroundCheck.replace("_", " ")}
          </Txt>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Insurance</Txt>
          <Txt color={c.muted}>
            {w.insured ? "On file · demo" : "Not provided"}
          </Txt>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Licenses</Txt>
          <Txt color={c.muted}>
            {w.licenses.filter((l) => l.verified).length
              ? "Verified for listed skills"
              : "None verified"}
          </Txt>
        </Row>
        <Txt color={c.subtle} size={11}>
          Credentials apply only to the skills and jurisdictions listed. These
          are synthetic profiles.
        </Txt>
      </Surface>
      <Button
        title="Find help for my job"
        icon={ArrowRight}
        onPress={() => {
          useStore.getState().resetDraft();
          go("/request");
        }}
      />
      <Button
        title="Reviews"
        secondary
        onPress={() => go(`/reviews?id=${w.id}`)}
      />
    </Screen>
  );
}
export function SpecialistsScreen() {
  const blocked = useStore((s) => s.blocked);
  return (
    <Screen
      narrow
      title="Good people, nearby."
      subtitle="Meet a few of your neighborhood specialists."
    >
      {workers
        .filter((w) => !blocked.includes(w.id))
        .slice(0, 12)
        .map((w) => (
          <Touch
            key={w.id}
            label={`View ${w.name}`}
            onPress={() => go(`/specialist?id=${w.id}`)}
          >
            <Surface>
              <Row>
                <Avatar name={w.name} uri={w.avatar} color={w.color} />
                <Col style={{ flex: 1, gap: 4 }}>
                  <Txt size={17} weight="600">
                    {w.name}
                  </Txt>
                  <Txt color={c.muted} size={12}>
                    {w.skills[0].skill.replace(".", " · ")}
                  </Txt>
                  <Txt color={c.subtle} size={11}>
                    ★ {w.metrics.rating.toFixed(2)} · {w.metrics.completed} jobs
                  </Txt>
                </Col>
                <ChevronRight color={c.subtle} size={18} />
              </Row>
            </Surface>
          </Touch>
        ))}
    </Screen>
  );
}
export function ServicesScreen() {
  const icons = [
    Droplets,
    Zap,
    Armchair,
    Frame,
    Wrench,
    Paintbrush,
    Wind,
    Wrench,
    Wrench,
    Truck,
    Leaf,
    Plus,
  ];
  return (
    <Screen
      narrow
      title="Whatever’s on your list."
      subtitle="A good specialist makes all the difference."
    >
      <Surface>
        {categories.map((category, i) => (
          <MenuRow
            key={category}
            icon={icons[i]}
            title={category}
            subtitle={taxonomy[category].map((s) => s.split(".")[1]).join(", ")}
            onPress={() => {
              useStore.getState().resetDraft();
              useStore.getState().editDraft({
                category,
                skill: taxonomy[category][0],
                requiresLicense:
                  category === "Electrical" || category === "HVAC",
              });
              go("/request");
            }}
          />
        ))}
      </Surface>
    </Screen>
  );
}
export function ReviewsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>(),
    reviews = useStore((s) => s.reviews).filter(
      (r) => r.workerId === (id || "worker-0"),
    );
  return (
    <Screen
      narrow
      title="Good work gets talked about."
      subtitle="Feedback from your neighbors."
    >
      {[
        ...reviews.map((r) => ({
          name: "You",
          text: r.note || r.tags.join(" · ") || "Thanks for the good work.",
          rating: r.overall,
        })),
        {
          name: "Jordan · Williamsburg",
          text: "On time, explained the fix, and left everything cleaner than before. Exactly what I needed.",
          rating: 5,
        },
        {
          name: "Taylor · Greenpoint",
          text: "Thoughtful and professional. The little details really made a difference.",
          rating: 5,
        },
      ].map((r, i) => (
        <Surface key={i} style={{ gap: 15 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt weight="600">{r.name}</Txt>
            <Row style={{ gap: 3 }}>
              {Array.from({ length: r.rating }, (_, n) => (
                <Star key={n} size={13} color={c.amber} fill={c.amber} />
              ))}
            </Row>
          </Row>
          <Txt color={c.muted}>{r.text}</Txt>
          <Txt color={c.subtle} size={10}>
            Demo review
          </Txt>
        </Surface>
      ))}
    </Screen>
  );
}
export function WorkerProfileScreen() {
  const w = workers[0];
  return (
    <Screen narrow title="Your work speaks volumes.">
      <Surface>
        <Row>
          <Avatar name={w.name} uri={w.avatar} size={70} />
          <Col style={{ gap: 4 }}>
            <Txt size={25} weight="600">
              {w.name}
            </Txt>
            <Txt color={c.muted}>Williamsburg, Brooklyn</Txt>
            <Pill text="Verified demo specialist" />
          </Col>
        </Row>
      </Surface>
      <Surface>
        <MenuRow
          icon={Award}
          title="OnHand Score"
          subtitle={`${Math.round(qualityScore(w) * 100)} · Excellent`}
          onPress={() => go("/reputation")}
        />
        <MenuRow
          icon={Wrench}
          title="Skills & verification"
          subtitle="Keep your capabilities current"
          onPress={() => go("/worker-onboarding")}
        />
        <MenuRow
          icon={Star}
          title="Reviews"
          subtitle={`${w.metrics.reviews} neighbor reviews`}
          onPress={() => go("/reviews")}
        />
        <MenuRow
          icon={Wallet}
          title="Earnings"
          subtitle="Your work, accounted for"
          onPress={() => go("/earnings")}
        />
        <MenuRow
          icon={Settings}
          title="Worker settings"
          subtitle="Availability, payouts, and preferences"
          onPress={() => go("/worker-settings")}
        />
      </Surface>
      <Button
        title="View public profile"
        secondary
        onPress={() => go("/specialist?id=worker-0")}
      />
    </Screen>
  );
}
export function OnboardingScreen() {
  return (
    <Screen narrow>
      <Col style={{ gap: 14, paddingTop: 20 }}>
        <Hand color={c.orange} size={55} strokeWidth={1.5} />
        <Txt size={53} weight="600" style={{ lineHeight: 58 }}>
          Life happens.{"\n"}Help is on hand.
        </Txt>
        <Txt size={17} color={c.muted}>
          Capable people. Around the corner.{"\n"}Ready to make your day a
          little easier.
        </Txt>
      </Col>
      <NeighborhoodMap height={260} />
      <Row>
        {[
          { n: "01", title: "Show the problem" },
          { n: "02", title: "Set your price" },
          { n: "03", title: "Get it handled" },
        ].map((s) => (
          <Col key={s.n} style={{ flex: 1, gap: 8 }}>
            <Txt color={c.orange} size={13}>
              {s.n}
            </Txt>
            <Txt size={14} weight="500">
              {s.title}
            </Txt>
          </Col>
        ))}
      </Row>
      <Button
        title="Make yourself at home"
        icon={ArrowRight}
        onPress={() => go("/login")}
      />
    </Screen>
  );
}
export function LoginScreen() {
  const [name, setName] = useState("Alex");
  return (
    <Screen
      narrow
      title="Welcome home."
      subtitle="Try the full OnHand experience. No sign-up needed."
    >
      <Surface style={{ gap: 20 }}>
        <Field
          label="What should we call you?"
          placeholder="First name"
          value={name}
          onChangeText={setName}
        />
        <Button
          title="Enter the demo"
          icon={ArrowRight}
          disabled={!name.trim()}
          onPress={() => {
            useStore.getState().updateProfile(name.trim());
            useStore.getState().setOnboarded();
            go("/");
          }}
        />
        <Txt color={c.subtle} size={12}>
          This creates a local demo session. Production authentication uses
          Supabase Auth and requires a configured project.
        </Txt>
      </Surface>
    </Screen>
  );
}
export function NotificationsScreen() {
  const messages = useStore((s) => s.messages).filter(
    (m) => m.sender === "system",
  );
  return (
    <Screen
      narrow
      title="You’re in the loop."
      subtitle="The updates that matter."
    >
      {messages.length ? (
        messages.map((m) => (
          <Touch
            key={m.id}
            label="View job update"
            onPress={() => go(`/tracking?id=${m.jobId}`)}
          >
            <Surface>
              <Row>
                <Bell size={20} color={c.orange} />
                <Col style={{ flex: 1, gap: 4 }}>
                  <Txt>{m.text}</Txt>
                  <Txt size={11} color={c.subtle}>
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </Txt>
                </Col>
              </Row>
            </Surface>
          </Touch>
        ))
      ) : (
        <Empty
          title="All quiet at home."
          text="Matching, arrival, and job updates will show up here."
          action="Back home"
          onPress={() => go("/")}
        />
      )}
    </Screen>
  );
}
