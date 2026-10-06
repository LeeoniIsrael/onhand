import React from "react";
import { Slot, usePathname, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MarketplaceProvider } from "../marketplace/Provider";
import AppShell from "../marketplace/Shell";
import NotificationBridge from "../marketplace/NotificationBridge";
import { Action, Copy, Page, Stack } from "../marketplace/ui";
import "../global.css";
export default function RootLayout() {
  const path = usePathname();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MarketplaceProvider>
          <NotificationBridge />
          <StatusBar style="dark" />
          {__DEV__ && path === "/dev-preview" ? (
            <Slot />
          ) : (
            <AppShell>
              <Slot />
            </AppShell>
          )}
        </MarketplaceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <Page title="Let’s try that again">
        <Stack>
          <Copy>Your account data is saved securely. Reload to continue.</Copy>
          <Action title="Reload this screen" onPress={retry} />
        </Stack>
      </Page>
    </SafeAreaProvider>
  );
}
