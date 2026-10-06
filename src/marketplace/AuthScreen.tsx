import React, { useState } from "react";
import { router } from "expo-router";
import { useAuth } from "./Provider";
import { View, Pressable } from "react-native";
import { Hand, BriefcaseBusiness, House } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  requireDatabase,
  signInForRole,
  configurationError,
  isLocalBackend,
} from "../services/supabase";
import { friendlyError } from "./api";
import {
  Action,
  Copy,
  Divider,
  Input,
  Line,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
} from "./ui";
import type { Role } from "../domain/models";
export default function AuthScreen() {
  const client = useQueryClient();
  const [role, setRole] = useState<Role>("customer");
  const [mode, setMode] = useState<
    "login" | "signup" | "verify" | "recover" | "reset"
  >("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const db = requireDatabase();
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
        throw new Error("Enter a valid email address.");
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Enter your name.");
        if (password.length < 12)
          throw new Error("Use a password with at least 12 characters.");
        const { data, error } = await db.auth.signUp({
          email: normalized,
          password,
          options: { data: { display_name: name.trim(), role } },
        });
        if (error) throw error;
        if (!data.session) {
          setMode("verify");
          setMessage("Check your email for your confirmation code.");
        }
      } else if (mode === "verify" || (mode === "recover" && code.trim())) {
        const { error } = await db.auth.verifyOtp({
          email: normalized,
          token: code.trim(),
          type: mode === "verify" ? "email" : "recovery",
        });
        if (error) throw error;
        if (mode === "recover") setMode("reset");
      } else if (mode === "recover") {
        const { error } = await db.auth.resetPasswordForEmail(normalized);
        if (error) throw error;
        setMessage(
          "If an account exists, a recovery email is on its way. Enter the code from that email.",
        );
      } else if (mode === "reset") {
        if (password.length < 12)
          throw new Error("Use a password with at least 12 characters.");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        client.clear();
      } else {
        const result = await signInForRole(normalized, password, role);
        client.setQueryData(["home", result.session.user.id], result.home);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Stack style={{ paddingTop: 28, gap: 28 }}>
        <Line>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              backgroundColor: palette.blue,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Hand size={25} color="white" />
          </View>
          <Copy size={28} weight="700">
            OnHand
          </Copy>
        </Line>
        <Stack style={{ gap: 10 }}>
          <Copy size={40} weight="700">
            {mode === "signup"
              ? "A little help.\nA lot handled."
              : mode === "verify"
                ? "Check your email."
                : mode === "recover"
                  ? "Back into your account."
                  : mode === "reset"
                    ? "Choose a new password."
                    : "Your next job,\nhandled."}
          </Copy>
          <Copy color={palette.slate}>
            {role === "customer"
              ? "Describe what you need. Name your price. Find the right person."
              : "Find work that fits your skills, your area and your price."}
          </Copy>
        </Stack>
        {configurationError ? (
          <Notice error>
            {configurationError} Follow the local setup in the README or
            configure a hosted Supabase project.
          </Notice>
        ) : (
          <>
            {(mode === "login" || mode === "signup") && (
              <Line
                style={{
                  padding: 4,
                  backgroundColor: palette.wash,
                  borderRadius: 14,
                }}
              >
                {(["customer", "worker"] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: role === r }}
                    accessibilityLabel={`${r === "customer" ? "Get help" : "Find work"} account`}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 11,
                      backgroundColor:
                        role === r ? palette.white : "transparent",
                    }}
                  >
                    <Line>
                      {r === "customer" ? (
                        <House size={18} color={palette.blue} />
                      ) : (
                        <BriefcaseBusiness size={18} color={palette.blue} />
                      )}
                      <Copy size={15} weight="600">
                        {r === "customer" ? "Get help" : "Find work"}
                      </Copy>
                    </Line>
                  </Pressable>
                ))}
              </Line>
            )}
            <Stack>
              {mode === "signup" && (
                <Input
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  maxLength={120}
                />
              )}
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
                maxLength={254}
              />
              {["login", "signup", "reset"].includes(mode) && (
                <Input
                  label={mode === "reset" ? "New password" : "Password"}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  autoCapitalize="none"
                  maxLength={128}
                  onSubmitEditing={() => void submit()}
                />
              )}
              {(mode === "verify" || mode === "recover") && (
                <Input
                  label="Email code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={10}
                />
              )}
              {error && <Notice error>{error}</Notice>}
              {message && <Notice>{message}</Notice>}
              <Action
                title={
                  mode === "signup"
                    ? "Create account"
                    : mode === "verify"
                      ? "Confirm email"
                      : mode === "recover"
                        ? code
                          ? "Verify code"
                          : "Send recovery email"
                        : mode === "reset"
                          ? "Save password"
                          : `Sign in as ${role === "customer" ? "customer" : "worker"}`
                }
                busy={busy}
                onPress={() => void submit()}
              />
              {mode === "signup" && (
                <Copy size={13} color={palette.slate}>
                  Your account type is permanent. By creating an account, you
                  agree to the Terms and Privacy Policy.
                </Copy>
              )}
              <QuietAction
                title="Privacy and terms"
                onPress={() => router.push("/legal")}
              />
              <QuietAction
                title={
                  mode === "login" ? "Create an account" : "Back to sign in"
                }
                onPress={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                  setMessage(null);
                  setCode("");
                }}
              />
              {mode === "login" && (
                <QuietAction
                  title="Forgot password?"
                  onPress={() => {
                    setMode("recover");
                    setCode("");
                    setError(null);
                  }}
                />
              )}
            </Stack>
          </>
        )}
        {isLocalBackend && (
          <>
            <Divider />
            <Copy size={13} color={palette.slate}>
              Local development database. No charges or real worker dispatch.
            </Copy>
          </>
        )}
      </Stack>
    </Page>
  );
}

export function PasswordResetScreen() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await requireDatabase().auth.updateUser({ password });
      if (result.error) throw result.error;
      finishRecovery();
      router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Choose a new password">
      <Stack>
        <Input
          label="New password"
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
        {error && <Notice error>{error}</Notice>}
        <Action
          title="Save new password"
          busy={busy}
          disabled={password.length < 12}
          onPress={() => void save()}
        />
      </Stack>
    </Page>
  );
}
