import React, { useState } from "react";
import { Switch, Pressable } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { clearDeviceToken } from "./device-token";
import DeviceAlerts from "./DeviceAlerts";
import { useHome } from "./Provider";
import { categories, taxonomy, type Skill } from "../domain/models";
import { isLocalBackend, requireDatabase } from "../services/supabase";
import { marketplace, friendlyError, money } from "./api";
import {
  Action,
  CommandError,
  Copy,
  Divider,
  Input,
  Line,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
  useCommand,
} from "./ui";
export default function AccountScreen() {
  const { data } = useHome();
  const profile = useCommand("profile");
  const settings = useCommand("settings");
  const setup = useCommand("worker_setup");
  const [name, setName] = useState(data?.profile.display_name ?? "");
  const [editing, setEditing] = useState(false);
  const [notifications, setNotifications] = useState(
    data?.settings?.notifications ?? true,
  );
  const [reduced, setReduced] = useState(
    data?.settings?.reduced_motion ?? false,
  );
  const [skills, setSkills] = useState<Skill[]>(data?.skills ?? []);
  const [bio, setBio] = useState(data?.worker?.bio ?? "");
  const [minimum, setMinimum] = useState(
    String((data?.worker?.minimum_pay_cents ?? 5000) / 100),
  );
  const [radius, setRadius] = useState(
    String((data?.worker?.service_radius_m ?? 10000) / 1000),
  );
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await clearDeviceToken().catch(() => {});
      const { error } = await requireDatabase().auth.signOut({
        scope: "local",
      });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await marketplace.deleteAccount();
      await requireDatabase().auth.signOut({ scope: "local" });
      router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function changePassword() {
    setBusy(true);
    setError(null);
    try {
      if (password.length < 12) throw new Error("Use at least 12 characters.");
      const { error } = await requireDatabase().auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setChangingPassword(false);
      setSuccess("Password updated.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await requireDatabase().functions.invoke(
        "connect",
        { body: { action: "onboarding" } },
      );
      if (error) throw new Error("Worker payouts are not configured yet.");
      if (!/^https:\/\/(connect|dashboard)\.stripe\.com\//.test(data.url))
        throw new Error("Secure payout setup is unavailable.");
      await Linking.openURL(data.url);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Your account"
      subtitle={
        data?.profile.role === "worker" ? "Worker account" : "Customer account"
      }
    >
      <Stack style={{ gap: 24 }}>
        <Stack style={{ gap: 5 }}>
          <Copy size={24} weight="600">
            {data?.profile.display_name}
          </Copy>
          <QuietAction
            title={editing ? "Cancel editing" : "Edit name"}
            onPress={() => setEditing(!editing)}
          />
          {editing && (
            <>
              <Input
                label="Your name"
                value={name}
                onChangeText={setName}
                maxLength={120}
              />
              {data?.profile.role === "worker" && (
                <Notice>
                  Changing your name pauses new offers until your identity is
                  reviewed again.
                </Notice>
              )}
              <CommandError command={profile} />
              <Action
                title="Save name"
                busy={profile.busy}
                onPress={() =>
                  void profile.run({ name: name.trim() }, () =>
                    setEditing(false),
                  )
                }
              />
            </>
          )}
        </Stack>
        {data?.profile.role === "customer" && (
          <>
            <Divider />
            <QuietAction
              title="Your saved addresses"
              onPress={() => router.push("/addresses")}
            />
          </>
        )}
        {data?.profile.role === "worker" && (
          <>
            <Divider />
            <Stack>
              <Copy size={23} weight="700">
                Your work preferences
              </Copy>
              <Copy size={14} color={palette.slate}>
                Skills help us find suitable work. Identity and regulated
                credentials need approval before you can receive offers.
              </Copy>
              <Line style={{ flexWrap: "wrap", gap: 8 }}>
                {categories.map((cat) => {
                  const skill = taxonomy[cat][0];
                  const selected = skills.includes(skill);
                  return (
                    <Pressable
                      key={cat}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setSkills((current) =>
                          selected
                            ? current.filter((s) => s !== skill)
                            : [...current, skill],
                        )
                      }
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: selected
                          ? palette.blue
                          : palette.white,
                        borderWidth: 1,
                        borderColor: selected ? palette.blue : palette.line,
                      }}
                    >
                      <Copy
                        size={13}
                        color={selected ? palette.white : palette.ink}
                      >
                        {cat}
                      </Copy>
                    </Pressable>
                  );
                })}
              </Line>
              <Input
                label="About your work"
                value={bio}
                onChangeText={setBio}
                maxLength={1000}
                multiline
              />
              <Input
                label="Minimum job price ($)"
                keyboardType="decimal-pad"
                value={minimum}
                onChangeText={setMinimum}
              />
              <Input
                label="Travel radius (km)"
                keyboardType="decimal-pad"
                value={radius}
                onChangeText={setRadius}
              />
              <CommandError command={setup} />
              <Action
                title="Save work preferences"
                busy={setup.busy}
                disabled={
                  !skills.length ||
                  Number(minimum) <= 0 ||
                  Number(radius) < 1 ||
                  Number(radius) > 100
                }
                onPress={() =>
                  void setup.run(
                    {
                      skills,
                      bio,
                      minimum_pay_cents: Math.round(Number(minimum) * 100),
                      service_radius_m: Math.round(Number(radius) * 1000),
                    },
                    () => setSuccess("Work preferences saved."),
                  )
                }
              />
              <Copy size={14} color={palette.slate}>
                Verification status:
                {data.worker?.account_standing === "good" &&
                data.worker.identity_verified
                  ? "Approved"
                  : data.worker?.account_standing === "suspended"
                    ? "Suspended"
                    : "Awaiting review"}
              </Copy>
              <QuietAction
                title="Set up bank payouts"
                disabled={busy}
                onPress={() => void connect()}
              />
            </Stack>
            <Divider />
            <Copy size={23} weight="700">
              {isLocalBackend ? "Local test earnings" : "Earnings"}
            </Copy>
            {data.bank_payouts?.map((p) => (
              <Line key={p.id} style={{ justifyContent: "space-between" }}>
                <Copy>{money(p.amount_cents)}</Copy>
                <Copy size={14} color={palette.slate}>
                  {p.status}
                  {p.arrival_at
                    ? ` · ${new Date(p.arrival_at).toLocaleDateString()}`
                    : ""}
                </Copy>
              </Line>
            ))}
            {data.payouts.length ? (
              data.payouts.map((p) => (
                <Line key={p.id} style={{ justifyContent: "space-between" }}>
                  <Copy>{money(p.amount_cents)}</Copy>
                  <Copy size={14} color={palette.slate}>
                    {p.state === "reversed"
                      ? "Reversed after refund"
                      : p.state === "paid"
                        ? "Settled"
                        : p.state === "failed"
                          ? "Needs support review"
                          : "Transfer recorded; bank timing depends on Stripe"}
                  </Copy>
                </Line>
              ))
            ) : (
              <Copy color={palette.slate}>
                Completed and paid jobs appear here.
              </Copy>
            )}
          </>
        )}
        <Divider />
        <Stack>
          <Line style={{ justifyContent: "space-between" }}>
            <Copy style={{ flex: 1 }}>Notifications</Copy>
            <Switch
              accessibilityLabel="Notifications"
              value={notifications}
              disabled={settings.busy}
              trackColor={{ false: palette.line, true: palette.blue }}
              onValueChange={(value) => {
                setNotifications(value);
                void settings
                  .run({ notifications: value, reduced_motion: reduced })
                  .then((result) => {
                    if (!result) setNotifications(!value);
                  });
              }}
            />
          </Line>
          <Line style={{ justifyContent: "space-between" }}>
            <Copy style={{ flex: 1 }}>Reduce motion</Copy>
            <Switch
              accessibilityLabel="Reduce motion"
              value={reduced}
              disabled={settings.busy}
              trackColor={{ false: palette.line, true: palette.blue }}
              onValueChange={(value) => {
                setReduced(value);
                void settings
                  .run({ notifications, reduced_motion: value })
                  .then((result) => {
                    if (!result) setReduced(!value);
                  });
              }}
            />
          </Line>
          <CommandError command={settings} />
          <DeviceAlerts />
        </Stack>
        <Divider />
        <QuietAction
          title="Privacy and terms"
          onPress={() => router.push("/legal")}
        />
        <QuietAction
          title={
            changingPassword ? "Cancel password change" : "Change password"
          }
          onPress={() => setChangingPassword(!changingPassword)}
        />
        {changingPassword && (
          <Stack>
            <Input
              label="New password"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <Action
              title="Save password"
              busy={busy}
              onPress={() => void changePassword()}
            />
          </Stack>
        )}
        {success && <Notice>{success}</Notice>}
        {error && <Notice error>{error}</Notice>}
        <Action
          title="Sign out"
          secondary
          busy={busy}
          onPress={() => void signOut()}
        />
        <QuietAction
          danger
          title={deleting ? "Cancel account deletion" : "Delete account"}
          disabled={busy}
          onPress={() => setDeleting(!deleting)}
        />
        {deleting && (
          <Stack>
            <Notice error>
              Your sign-in, saved addresses, messages and profile information
              will be removed. Finish active jobs and support cases first.
              Required financial records are retained without your public
              profile information.
            </Notice>
            <Action
              title="Permanently delete my account"
              busy={busy}
              onPress={() => void remove()}
            />
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
