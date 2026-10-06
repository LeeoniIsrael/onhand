import React from "react";
import { Copy, palette } from "./ui";
export default function DeviceAlerts() {
  return (
    <Copy size={13} color={palette.slate}>
      Live updates are active while the app is open. Device alerts are available
      in a native development or store build.
    </Copy>
  );
}
