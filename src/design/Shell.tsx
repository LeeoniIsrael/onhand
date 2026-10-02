import React from "react";
import { View, useWindowDimensions, Platform } from "react-native";
import { router, usePathname, type Href } from "expo-router";
import {
  Home,
  BriefcaseBusiness,
  Plus,
  MessageCircle,
  UserRound,
  MapPin,
  ChevronDown,
  Bell,
  ArrowUpRight,
  ShieldCheck,
  ArrowLeftRight,
  Hand,
  CircleHelp,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors as c } from "./tokens";
import { Avatar, Col, IconButton, Row, Touch, Txt, Toast } from "./ui";
import { NetworkBanner } from "./NetworkBanner";
import { useStore } from "../state/store";
export const go = (path: string) => router.push(path as Href);
const nav = [
  { path: "/", label: "Home", icon: Home },
  { path: "/jobs", label: "My jobs", icon: BriefcaseBusiness },
  { path: "/request", label: "Request help", icon: Plus },
  { path: "/messages", label: "Messages", icon: MessageCircle },
  { path: "/profile", label: "Profile", icon: UserRound },
];
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Row style={{ gap: 10 }}>
      <View
        style={{
          height: 34,
          width: 34,
          borderRadius: 10,
          backgroundColor: c.orange,
          justifyContent: "center",
          alignItems: "center",
          transform: [{ rotate: "-7deg" }],
        }}
      >
        <Hand color="#161410" size={24} strokeWidth={2.4} />
      </View>
      <Txt size={compact ? 22 : 25} weight="700" style={{ letterSpacing: -1 }}>
        onhand
        <Txt color={c.orange} size={26}>
          .
        </Txt>
      </Txt>
    </Row>
  );
}
export function Shell({ children }: React.PropsWithChildren) {
  const { width } = useWindowDimensions(),
    desktop = width >= 1050,
    path = usePathname(),
    role = useStore((s) => s.role),
    name = useStore((s) => s.name),
    setRole = useStore((s) => s.setRole);
  const items = nav.map((n) =>
    n.path === "/" && role === "worker"
      ? { ...n, path: "/worker", label: "Overview" }
      : n,
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "bottom"]}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {desktop && (
          <View
            style={{
              width: 228,
              backgroundColor: c.sidebar,
              borderRightWidth: 1,
              borderRightColor: "#232526",
              padding: 24,
              paddingTop: 32,
            }}
          >
            <Brand />
            <Txt
              color={c.subtle}
              size={11}
              style={{ marginTop: 14, marginBottom: 44 }}
            >
              Capable help. Right here.
            </Txt>
            <Col style={{ gap: 8 }}>
              {items.map(({ path: p, icon: Icon, label }) => {
                const active = path === p;
                return (
                  <Touch
                    key={p}
                    label={label}
                    onPress={() => go(p)}
                    style={{
                      minHeight: 52,
                      paddingHorizontal: 14,
                      backgroundColor: active
                        ? "#2e231c"
                        : p === "/request"
                          ? c.elevated
                          : "transparent",
                      borderRadius: 12,
                    }}
                  >
                    <Row style={{ flex: 1 }}>
                      <Icon
                        color={active ? c.orange : c.muted}
                        size={19}
                        strokeWidth={1.7}
                      />
                      <Txt
                        size={13}
                        weight={active ? "600" : "400"}
                        color={active ? c.orange : c.muted}
                      >
                        {label}
                      </Txt>
                      {p === "/messages" && (
                        <View
                          style={{
                            marginLeft: "auto",
                            width: 6,
                            height: 6,
                            backgroundColor: c.orange,
                            borderRadius: 6,
                          }}
                        />
                      )}
                    </Row>
                  </Touch>
                );
              })}
            </Col>
            <View style={{ flex: 1 }} />
            <SurfaceNote />
            <Touch
              label="Switch mode"
              onPress={() => {
                setRole(role === "customer" ? "worker" : "customer");
                go(role === "customer" ? "/worker" : "/");
              }}
              style={{
                paddingVertical: 22,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <Row>
                <ArrowLeftRight size={16} color={c.muted} />
                <Txt color={c.muted} size={12}>
                  {role === "customer"
                    ? "Switch to worker"
                    : "Switch to customer"}
                </Txt>
              </Row>
            </Touch>
            <Touch
              label="Open profile"
              onPress={() => go("/profile")}
              style={{ paddingTop: 20 }}
            >
              <Row>
                <Avatar name={name} size={36} color="#4e5a50" />
                <Col style={{ gap: 2 }}>
                  <Txt size={13} weight="600">
                    {name} Morgan
                  </Txt>
                  <Txt size={10} color={c.subtle}>
                    {role === "customer"
                      ? "Personal account"
                      : "Worker account"}
                  </Txt>
                </Col>
                <ChevronDown color={c.subtle} size={14} />
              </Row>
            </Touch>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Row
            style={{
              height: desktop ? 85 : 68,
              paddingHorizontal: desktop ? 36 : 20,
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: "#242626",
            }}
          >
            {!desktop && <Brand compact={width < 500} />}
            {desktop && (
              <Txt size={13} color={c.muted}>
                {role === "worker"
                  ? "Your work. Your way."
                  : "A good day to get it handled."}
              </Txt>
            )}
            <Row style={{ gap: desktop ? 22 : 10 }}>
              <Touch
                label="Change home address"
                onPress={() => go("/addresses")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Row style={{ gap: 8 }}>
                  <MapPin size={16} color={c.orange} />
                  <Txt size={12} weight="500">
                    {desktop
                      ? "Home · Williamsburg, Brooklyn"
                      : width < 370
                        ? "Home"
                        : "Williamsburg"}
                  </Txt>
                  <ChevronDown color={c.subtle} size={13} />
                </Row>
              </Touch>
              <IconButton
                icon={Bell}
                label="Notifications"
                onPress={() => go("/notifications")}
              />
            </Row>
          </Row>
          <NetworkBanner />
          <View style={{ flex: 1 }}>{children}</View>
          {!desktop && (
            <Row
              style={{
                backgroundColor: c.sidebar,
                paddingHorizontal: 10,
                paddingTop: 9,
                paddingBottom: Platform.OS === "web" ? 12 : 4,
                justifyContent: "space-around",
                borderTopWidth: 1,
                borderTopColor: c.line,
              }}
            >
              {items.map(({ path: p, icon: Icon, label }) => (
                <Touch
                  label={label}
                  key={p}
                  onPress={() => go(p)}
                  style={{
                    flex: 1,
                    minHeight: 50,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  {p === "/request" ? (
                    <View
                      style={{
                        width: 48,
                        height: 44,
                        borderRadius: 15,
                        backgroundColor: c.orange,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Plus color="#1a130e" size={26} />
                    </View>
                  ) : (
                    <>
                      <Icon
                        size={21}
                        color={path === p ? c.orange : c.muted}
                        strokeWidth={path === p ? 2.2 : 1.6}
                      />
                      <Txt size={9} color={path === p ? c.orange : c.muted}>
                        {label === "My jobs" ? "Jobs" : label}
                      </Txt>
                    </>
                  )}
                </Touch>
              ))}
            </Row>
          )}
        </View>
        <Toast />
      </View>
    </SafeAreaView>
  );
}
function SurfaceNote() {
  return (
    <View
      style={{
        padding: 15,
        backgroundColor: "#1d2020",
        borderRadius: 14,
        gap: 10,
      }}
    >
      <ShieldCheck size={22} color={c.green} />
      <Txt size={13} weight="500">
        Good hands. Peace of mind.
      </Txt>
      <Txt size={11} color={c.muted}>
        Know who’s coming. Agree on a price. Stay in control.
      </Txt>
      <Touch
        label="How OnHand protects you"
        onPress={() => go("/safety")}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Row style={{ gap: 5 }}>
          <Txt size={11} color={c.text}>
            Our safety promise
          </Txt>
          <ArrowUpRight size={12} color={c.text} />
        </Row>
      </Touch>
      <Touch
        label="Demo information"
        onPress={() =>
          useStore
            .getState()
            .notify(
              "Demo marketplace. Workers, estimates, messages, and payments are simulated.",
            )
        }
      >
        <Row style={{ gap: 5, minHeight: 30 }}>
          <CircleHelp color={c.subtle} size={11} />
          <Txt size={10} color={c.subtle}>
            Interactive demo
          </Txt>
        </Row>
      </Touch>
    </View>
  );
}
