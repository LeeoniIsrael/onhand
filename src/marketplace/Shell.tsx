import React, { useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Hand, House, BriefcaseBusiness, UserRound } from "lucide-react-native";
import { useAuth, useHome, useRealtimeHome } from "./Provider";
import AuthScreen, { PasswordResetScreen } from "./AuthScreen";
import { Copy, Failure, Line, Loading, palette, QuietAction } from "./ui";
import { requireDatabase, isLocalBackend } from "../services/supabase";
export default function AppShell({ children }: React.PropsWithChildren) {
  const auth = useAuth();
  const home = useHome({ poll: true });
  const path = usePathname();
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  useRealtimeHome();
  const items = [
    {
      path: "/",
      title: home.data?.profile.role === "worker" ? "Find work" : "Home",
      icon: House,
    },
    { path: "/jobs", title: "Jobs", icon: BriefcaseBusiness },
    { path: "/profile", title: "Account", icon: UserRound },
  ];
  return (
    <SafeAreaView
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, backgroundColor: palette.paper }}
    >
      <View style={{ flex: 1 }}>
        {auth.loading ? (
          <Loading />
        ) : !auth.session ? (
          path === "/legal" ? (
            <>{children}</>
          ) : (
            <AuthScreen />
          )
        ) : auth.recovering ? (
          <PasswordResetScreen />
        ) : home.isPending ? (
          <Loading />
        ) : home.error ? (
          <>
            <Failure error={home.error} retry={() => void home.refetch()} />
            <QuietAction
              title="Sign out"
              onPress={() =>
                void requireDatabase().auth.signOut({ scope: "local" })
              }
            />
          </>
        ) : (
          <>
            <View
              style={{
                backgroundColor: palette.white,
                borderBottomWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Line
                style={{
                  width: "100%",
                  maxWidth: 1100,
                  alignSelf: "center",
                  paddingHorizontal: 24,
                  height: 64,
                  justifyContent: "space-between",
                }}
              >
                <Line>
                  <Hand size={24} color={palette.blue} />
                  <Copy size={23} weight="700">
                    OnHand
                  </Copy>
                </Line>
                <Copy size={13} color={palette.slate}>
                  {home.data?.profile.role === "worker" ? "Worker" : "Customer"}
                  {isLocalBackend ? " · Local" : ""}
                </Copy>
                {width >= 850 && (
                  <Line>
                    {items.map((item) => (
                      <Pressable
                        key={item.path}
                        accessibilityRole="button"
                        onPress={() =>
                          router.replace(
                            item.path as "/" | "/jobs" | "/profile",
                          )
                        }
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 18,
                          justifyContent: "center",
                        }}
                      >
                        <Copy
                          color={
                            path === item.path ? palette.blue : palette.slate
                          }
                          weight="600"
                        >
                          {item.title}
                        </Copy>
                      </Pressable>
                    ))}
                  </Line>
                )}
              </Line>
            </View>
            <View key={auth.session.user.id} style={{ flex: 1 }}>
              {children}
            </View>
            {width < 850 && (
              <Line
                style={{
                  backgroundColor: palette.white,
                  borderTopWidth: 1,
                  borderColor: palette.line,
                  paddingTop: 8,
                  paddingBottom: 8,
                  justifyContent: "space-around",
                }}
              >
                {items.map((item) => {
                  const active = item.path === path;
                  const Icon = item.icon;
                  return (
                    <Pressable
                      key={item.path}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      accessibilityState={{ selected: active }}
                      onPress={() =>
                        router.replace(item.path as "/" | "/jobs" | "/profile")
                      }
                      style={{
                        flex: 1,
                        minHeight: 52,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <Icon
                        size={22}
                        color={active ? palette.blue : palette.slate}
                      />
                      <Copy
                        size={12}
                        color={active ? palette.blue : palette.slate}
                        weight={active ? "600" : "400"}
                      >
                        {item.title}
                      </Copy>
                    </Pressable>
                  );
                })}
              </Line>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
