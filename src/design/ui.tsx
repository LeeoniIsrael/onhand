import React, { useEffect, useState } from "react";
import {
  View,
  Text as NativeText,
  TextProps,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  TextInput,
  TextInputProps,
  ScrollView,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  AccessibilityInfo,
} from "react-native";
import {
  ArrowUpRight,
  ChevronRight,
  X,
  type LucideIcon,
} from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { colors as c, motion } from "./tokens";
import { useStore } from "../state/store";
export const haptic = (
  kind: "light" | "medium" | "success" | "warning" = "light",
) => {
  if (Platform.OS === "web") return;
  const p =
    kind === "success" || kind === "warning"
      ? Haptics.notificationAsync(
          kind === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        )
      : Haptics.impactAsync(
          kind === "medium"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
  void p.catch(() => {});
};
export function Txt({
  children,
  size = 14,
  color = c.text,
  weight = "400",
  style,
  ...props
}: TextProps & {
  size?: number;
  color?: string;
  weight?: "400" | "500" | "600" | "700" | "800";
}) {
  return (
    <NativeText
      {...props}
      style={[
        {
          color,
          fontSize: size,
          fontWeight: weight,
          lineHeight: size * 1.4,
          letterSpacing: size > 28 ? -1.5 : size > 18 ? -0.5 : 0,
        },
        style,
      ]}
    >
      {children}
    </NativeText>
  );
}
export function Row({
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
export function Col({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ gap: 16 }, style]}>{children}</View>;
}
export function Surface({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderRadius: 18, padding: 20 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
const APressable = Animated.createAnimatedComponent(Pressable);
export function Touch({
  children,
  onPress,
  style,
  label,
  disabled = false,
  feedback = "light",
  testID,
}: React.PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  label: string;
  disabled?: boolean;
  feedback?: "light" | "medium" | "success" | "warning";
  testID?: string;
}>) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1),
    reduced = useReducedMotion(),
    setting = useStore((s) => s.reducedMotion);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <APressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPressIn={() => {
        setPressed(true);
        if (!reduced && !setting) scale.set(withSpring(0.97, motion.press));
      }}
      onPressOut={() => {
        setPressed(false);
        scale.set(withSpring(1, motion.press));
      }}
      onPress={() => {
        haptic(feedback);
        onPress?.();
      }}
      style={[style, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, animated]}
    >
      {children}
    </APressable>
  );
}
export function Button({
  title,
  onPress,
  icon: Icon,
  secondary,
  disabled,
  compact,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touch
      label={title}
      onPress={onPress}
      disabled={disabled}
      feedback={secondary ? "light" : "medium"}
      style={[
        {
          backgroundColor: secondary ? c.elevated : c.orange,
          borderRadius: 14,
          minHeight: compact ? 44 : 56,
          paddingHorizontal: compact ? 16 : 22,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 10,
        },
        style,
      ]}
    >
      <Txt
        size={compact ? 13 : 15}
        weight="600"
        color={secondary ? c.text : "#19130e"}
      >
        {title}
      </Txt>
      {Icon && (
        <Icon
          size={compact ? 16 : 20}
          color={secondary ? c.text : "#19130e"}
          strokeWidth={2}
        />
      )}
    </Touch>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
  accent,
  style,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touch
      label={label}
      onPress={onPress}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: accent ? c.orange : c.elevated,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon color={accent ? "#17120e" : c.text} size={20} strokeWidth={1.7} />
    </Touch>
  );
}
export function Pill({
  text,
  color = c.green,
  icon: Icon,
}: {
  text: string;
  color?: string;
  icon?: LucideIcon;
}) {
  return (
    <Row
      style={{
        alignSelf: "flex-start",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 30,
        backgroundColor: `${color}13`,
        gap: 6,
      }}
    >
      {Icon ? (
        <Icon color={color} size={13} />
      ) : (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      )}
      <Txt size={11} weight="500" color={color}>
        {text}
      </Txt>
    </Row>
  );
}
export function Avatar({
  name,
  uri,
  size = 46,
  color = "#70685d",
}: {
  name: string;
  uri?: string;
  size?: number;
  color?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
          contentFit="cover"
        />
      ) : (
        <Txt size={size * 0.32} weight="600">
          {name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </Txt>
      )}
    </View>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <Col style={{ gap: 8 }}>
      <Txt size={12} color={c.muted} weight="500">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.subtle}
        {...props}
        style={[
          {
            color: c.text,
            backgroundColor: c.elevated,
            borderRadius: 12,
            padding: 16,
            fontSize: 15,
            minHeight: 52,
          },
          props.multiline && { minHeight: 104, textAlignVertical: "top" },
          style,
        ]}
      />
    </Col>
  );
}
export function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
      <Txt size={19} weight="600">
        {title}
      </Txt>
      {action && (
        <Touch
          label={action}
          onPress={onPress}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Row style={{ gap: 5 }}>
            <Txt size={12} color={c.muted}>
              {action}
            </Txt>
            <ArrowUpRight size={14} color={c.muted} />
          </Row>
        </Touch>
      )}
    </Row>
  );
}
export function MenuRow({
  icon: Icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Touch
      label={title}
      onPress={onPress}
      style={{
        minHeight: 72,
        justifyContent: "center",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.line,
      }}
    >
      <Row>
        <View style={{ width: 40, alignItems: "center" }}>
          <Icon color={c.muted} size={21} strokeWidth={1.7} />
        </View>
        <Col style={{ flex: 1, gap: 3 }}>
          <Txt weight="500">{title}</Txt>
          {subtitle && (
            <Txt color={c.muted} size={12}>
              {subtitle}
            </Txt>
          )}
        </Col>
        {right ?? <ChevronRight size={17} color={c.subtle} />}
      </Row>
    </Touch>
  );
}
export function Screen({
  children,
  narrow = false,
  title,
  subtitle,
  action,
}: React.PropsWithChildren<{
  narrow?: boolean;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}>) {
  const { width } = useWindowDimensions();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: width > 1000 ? 36 : 20,
          paddingBottom: 44,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: "100%",
            maxWidth: narrow ? 680 : 1240,
            alignSelf: "center",
            gap: 26,
          }}
        >
          {title && (
            <Row style={{ justifyContent: "space-between" }}>
              <Col style={{ gap: 6, flex: 1 }}>
                <Txt size={width > 800 ? 36 : 30} weight="600">
                  {title}
                </Txt>
                {subtitle && <Txt color={c.muted}>{subtitle}</Txt>}
              </Col>
              {action}
            </Row>
          )}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Empty({
  title,
  text,
  action,
  onPress,
}: {
  title: string;
  text: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Surface style={{ padding: 32, gap: 16 }}>
      <Txt size={25} weight="600">
        {title}
      </Txt>
      <Txt color={c.muted}>{text}</Txt>
      <Button title={action} onPress={onPress} />
    </Surface>
  );
}
export function Skeleton({ height = 100 }: { height?: number }) {
  const opacity = useSharedValue(0.35),
    reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced)
      opacity.value = withRepeat(withTiming(0.7, { duration: 1000 }), -1, true);
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[{ height, borderRadius: 16, backgroundColor: c.elevated }, style]}
    />
  );
}
export function Toast() {
  const toast = useStore((s) => s.toast),
    clear = useStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast);
    const id = setTimeout(clear, 4800);
    return () => clearTimeout(id);
  }, [toast, clear]);
  if (!toast) return null;
  return (
    <View
      style={{
        position: "absolute",
        bottom: 96,
        alignSelf: "center",
        maxWidth: "90%",
        zIndex: 100,
        backgroundColor: "#eeeae2",
        paddingLeft: 20,
        paddingVertical: 6,
        paddingRight: 6,
        borderRadius: 14,
      }}
    >
      <Row>
        <Txt color="#1b1c1c" style={{ flexShrink: 1 }}>
          {toast}
        </Txt>
        <IconButton icon={X} label="Dismiss notification" onPress={clear} />
      </Row>
    </View>
  );
}
