import Slider from "@react-native-community/slider";
import { colors as c } from "./tokens";
export function PriceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      accessibilityLabel="Your offer"
      minimumValue={50}
      maximumValue={250}
      step={5}
      value={value}
      onValueChange={onChange}
      minimumTrackTintColor={c.orange}
      maximumTrackTintColor={c.line}
      thumbTintColor={c.orange}
      style={{ height: 48, width: "100%" }}
    />
  );
}
