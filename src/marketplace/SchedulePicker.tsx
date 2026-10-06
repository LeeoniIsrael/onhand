import React from "react";
import { Input } from "./ui";
export default function SchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label="Appointment"
      value={value}
      onChangeText={onChange}
      placeholder="Choose a date and time"
    />
  );
}
