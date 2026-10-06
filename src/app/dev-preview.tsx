import React from "react";
import { View, useWindowDimensions } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import AppShell from "../marketplace/Shell";
import RequestScreen from "../marketplace/RequestScreen";
import HomeScreen from "../marketplace/HomeScreen";
export default function Preview() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { height } = useWindowDimensions();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: "#DCE3EE",
        paddingVertical: 24,
      }}
    >
      <View
        style={{
          width: 390,
          height: Math.min(844, height - 48),
          maxWidth: "100%",
          backgroundColor: "#F8FAFC",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        <AppShell>
          {view === "request" ? <RequestScreen /> : <HomeScreen />}
        </AppShell>
      </View>
    </View>
  );
}
