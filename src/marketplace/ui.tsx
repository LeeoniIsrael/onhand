import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { marketplace, friendlyError, requestKey, money } from "./api";
import { useAuth, useHome } from "./Provider";
import type { MarketplaceJob } from "./types";
import { statusLabel } from "../domain/lifecycle";
export const palette = {
  paper: "#F8FAFC",
  white: "#FFFFFF",
  ink: "#182334",
  slate: "#526174",
  muted: "#687689",
  line: "#DAE1EB",
  blue: "#214DD8",
  wash: "#EAF0FF",
  green: "#166645",
  red: "#A32939",
  redWash: "#FFF0F1",
};
export function Copy({
  children,
  size = 16,
  color = palette.ink,
  weight = "400",
  style,
  ...rest
}: React.ComponentProps<typeof Text> & {
  size?: number;
  color?: string;
  weight?: "400" | "500" | "600" | "700" | "800";
}) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          lineHeight: size * 1.4,
          color,
          fontWeight: weight,
          letterSpacing: size >= 28 ? -0.8 : 0,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Stack({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ gap: 16 }, style]}>{children}</View>;
}
export function Line({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, style]}
    >
      {children}
    </View>
  );
}
export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  icon: Icon,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const systemReduced = useReducedMotion();
  const preferences = useHome().data?.settings;
  const reduced = systemReduced || preferences?.reduced_motion;
  const move = (value: number) => {
    if (!reduced)
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: Platform.OS !== "web",
        stiffness: 400,
        damping: 28,
      }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        onPressIn={() => move(0.98)}
        onPressOut={() => move(1)}
        onPress={() => {
          if (Platform.OS !== "web")
            void Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        style={({ pressed }) => [
          s.button,
          {
            backgroundColor: secondary ? palette.wash : palette.blue,
            opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={secondary ? palette.blue : palette.white} />
        ) : (
          <>
            {Icon && (
              <Icon
                size={20}
                color={secondary ? palette.blue : palette.white}
              />
            )}
            <Copy color={secondary ? palette.blue : palette.white} weight="600">
              {title}
            </Copy>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
export function QuietAction({
  title,
  onPress,
  disabled = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
      onPress={onPress}
    >
      <Copy color={danger ? palette.red : palette.blue} weight="600">
        {title}
      </Copy>
    </Pressable>
  );
}
export function Input({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <Stack style={{ gap: 7 }}>
      <Copy size={14} weight="600">
        {label}
      </Copy>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={[
          s.input,
          props.multiline && { minHeight: 108, textAlignVertical: "top" },
          style,
        ]}
      />
      {error && (
        <Copy size={13} color={palette.red}>
          {error}
        </Copy>
      )}
    </Stack>
  );
}
export function Notice({
  children,
  error = false,
}: React.PropsWithChildren<{ error?: boolean }>) {
  return (
    <Line
      style={{
        padding: 14,
        backgroundColor: error ? palette.redWash : palette.wash,
        borderRadius: 12,
        alignItems: "flex-start",
      }}
    >
      {error ? (
        <AlertCircle size={18} color={palette.red} />
      ) : (
        <CheckCircle2 size={18} color={palette.blue} />
      )}
      <Copy
        accessibilityRole={error ? "alert" : undefined}
        size={14}
        color={error ? palette.red : palette.slate}
        style={{ flex: 1 }}
      >
        {children}
      </Copy>
    </Line>
  );
}
export function Page({
  children,
  title,
  subtitle,
  back = false,
  scroll = true,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  back?: boolean;
  scroll?: boolean;
}>) {
  const content = (
    <View style={[s.page, !scroll && { flex: 1 }]}>
      {back && (
        <QuietAction
          title="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
      )}
      <Stack style={{ gap: 8, marginBottom: title ? 24 : 0 }}>
        {title && (
          <Copy size={32} weight="700" accessibilityRole="header">
            {title}
          </Copy>
        )}
        {subtitle && <Copy color={palette.slate}>{subtitle}</Copy>}
      </Stack>
      {children}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}
export function Loading({ text = "Loading your account…" }: { text?: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <ActivityIndicator color={palette.blue} />
      <Copy color={palette.slate}>{text}</Copy>
    </View>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <Page title="Let’s try again">
      <Stack>
        <Notice error>{friendlyError(error)}</Notice>
        <Action title="Try again" onPress={retry} />
      </Stack>
    </Page>
  );
}
export function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: palette.line, marginVertical: 8 }}
    />
  );
}
export function JobRow({
  job,
  onPress,
}: {
  job: MarketplaceJob;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${money(job.offer_cents)}, ${statusLabel[job.status]}`}
      style={({ pressed }) => ({
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Line>
        <Stack style={{ flex: 1, gap: 5 }}>
          <Copy weight="600" size={18}>
            {job.title}
          </Copy>
          <Copy size={14} color={palette.slate}>
            {statusLabel[job.status]}
          </Copy>
          <Copy size={13} color={palette.muted}>
            {job.approximate_zone}
          </Copy>
        </Stack>
        <Copy weight="700" size={22}>
          {money(job.offer_cents)}
        </Copy>
        <ChevronRight size={18} color={palette.muted} />
      </Line>
    </Pressable>
  );
}
// Retain the same mutation key after a connection failure; changing input starts a new operation.
export function useCommand(action: string) {
  const { session } = useAuth();
  const client = useQueryClient();
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      const fingerprint = JSON.stringify(payload);
      if (last.current?.fingerprint !== fingerprint)
        last.current = { fingerprint, key: requestKey() };
      return marketplace.action(action, payload, last.current.key);
    },
    onSuccess: () => {
      last.current = null;
      void client.invalidateQueries({ queryKey: ["home", session?.user.id] });
      void client.invalidateQueries({ queryKey: ["job", session?.user.id] });
    },
  });
  async function run(payload: Record<string, unknown>, success?: () => void) {
    setMessage(null);
    try {
      const result = await mutation.mutateAsync(payload);
      success?.();
      return result;
    } catch (error) {
      const text = friendlyError(error);
      setMessage(text);
      AccessibilityInfo.announceForAccessibility(text);
      return undefined;
    }
  }
  return {
    run,
    busy: mutation.isPending,
    error: message,
    clear: () => setMessage(null),
  };
}
export function CommandError({
  command,
}: {
  command: { error: string | null };
}) {
  return command.error ? <Notice error>{command.error}</Notice> : null;
}
export function useRole() {
  return useHome().data?.profile.role;
}
const s = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 40,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    flexDirection: "row",
    gap: 10,
  },
  input: {
    backgroundColor: palette.white,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.ink,
  },
});
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
