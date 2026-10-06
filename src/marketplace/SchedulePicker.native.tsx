import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Action, Copy, Stack } from "./ui";
export default function SchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [initial] = useState(() => new Date(Date.now() + 3600000));
  const [minimum] = useState(() => new Date());
  const date =
    value && Number.isFinite(Date.parse(value)) ? new Date(value) : initial;
  function android() {
    DateTimePickerAndroid.open({
      value: date,
      mode: "date",
      minimumDate: minimum,
      onValueChange: (_event, selected) => {
        DateTimePickerAndroid.open({
          value: selected,
          mode: "time",
          onValueChange: (_time, time) => onChange(time.toISOString()),
        });
      },
    });
  }
  return (
    <Stack style={{ gap: 8 }}>
      <Copy size={14} weight="600">
        Appointment
      </Copy>
      {Platform.OS === "ios" ? (
        <View>
          <DateTimePicker
            value={date}
            mode="datetime"
            display="compact"
            minimumDate={minimum}
            onValueChange={(_event, selected) =>
              onChange(selected.toISOString())
            }
          />
        </View>
      ) : (
        <Action
          secondary
          title={value ? date.toLocaleString() : "Choose date and time"}
          onPress={android}
        />
      )}
    </Stack>
  );
}
