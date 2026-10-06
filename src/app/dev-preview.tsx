import React from "react";
import { View, useWindowDimensions } from "react-native";
import { Redirect } from "expo-router";
import AppShell from "../marketplace/Shell";
import HomeScreen from "../marketplace/HomeScreen";
export default function Preview() {
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
          <HomeScreen />
        </AppShell>
      </View>
    </View>
  );
}
