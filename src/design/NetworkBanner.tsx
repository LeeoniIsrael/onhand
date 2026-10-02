import React, { useEffect, useRef } from "react";
import { useNetworkState } from "expo-network";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react-native";
import { Row, Txt } from "./ui";
import { colors } from "./tokens";
export function NetworkBanner() {
  const network = useNetworkState(),
    query = useQueryClient(),
    wasOffline = useRef(false);
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
  useEffect(() => {
    if (wasOffline.current && !offline) void query.invalidateQueries();
    wasOffline.current = offline;
  }, [offline, query]);
  if (!offline) return null;
  return (
    <Row
      style={{
        padding: 12,
        backgroundColor: "#382e20",
        justifyContent: "center",
      }}
    >
      <WifiOff color={colors.amber} size={15} />
      <Txt color={colors.amber} size={12}>
        You’re offline. Your demo progress is saved.
      </Txt>
    </Row>
  );
}
