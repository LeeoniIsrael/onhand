import React from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Empty, Screen } from "../design/ui";
import { View } from "react-native";
import { Shell } from "../design/Shell";
import "../global.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Shell>
            <Slot />
          </Shell>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({
  retry,
}: import("expo-router").ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <Fallback retry={retry} />
    </SafeAreaProvider>
  );
}

function Fallback({ retry }: { retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#101112" }}>
      <Screen narrow>
        <Empty
          title="Let’s try that again."
          text="Your saved progress is still here."
          action="Reload this screen"
          onPress={retry}
        />
      </Screen>
    </View>
  );
}
