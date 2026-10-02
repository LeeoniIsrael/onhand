import React from "react";
export function PriceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      aria-label="Your offer"
      type="range"
      min={50}
      max={250}
      step={5}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: "100%",
        height: 44,
        accentColor: "#ff641f",
        cursor: "pointer",
        background: "transparent",
      }}
    />
  );
}
