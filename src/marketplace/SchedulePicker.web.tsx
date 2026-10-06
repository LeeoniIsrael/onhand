import React from "react";
import { Stack, Copy, palette } from "./ui";
export default function SchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = new Date(value);
  const local = Number.isFinite(parsed.getTime())
    ? new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <Stack style={{ gap: 8 }}>
      <Copy size={14} weight="600">
        Appointment
      </Copy>
      <input
        aria-label="Appointment"
        type="datetime-local"
        value={local}
        onChange={(event) => onChange(event.target.value)}
        style={{
          fontFamily: "inherit",
          fontSize: 16,
          padding: 14,
          minHeight: 52,
          width: "100%",
          border: `1px solid ${palette.line}`,
          borderRadius: 12,
          background: palette.white,
          color: palette.ink,
        }}
      />
    </Stack>
  );
}
