import React, { useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { requireDatabase } from "../services/supabase";
import { Action, Notice, Stack } from "./ui";
import { friendlyError } from "./api";
export default function DeviceAlerts() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (!Device.isDevice)
        throw new Error(
          "Device alerts need a physical device and a development or store build.",
        );
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      if (!projectId)
        throw new Error(
          "The EAS project must be configured before device alerts can be registered.",
        );
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("jobs", {
          name: "Job updates",
          importance: Notifications.AndroidImportance.HIGH,
        });
      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.granted
        ? existing
        : await Notifications.requestPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow notifications in device settings to receive job alerts.",
        );
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      const { error } = await requireDatabase().rpc("register_push_token", {
        p_token: token.data,
      });
      if (error) throw error;
      await SecureStore.setItemAsync("onhand.push-token", token.data);
      setMessage(
        "Device alerts enabled. Your notification preference controls delivery.",
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack>
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <Action
        title="Enable device alerts"
        secondary
        busy={busy}
        onPress={() => void enable()}
      />
    </Stack>
  );
}
