import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Txt } from "./ui";
import { useStore } from "../state/store";
export function AnimatedNumber({
  value,
  suffix = "",
  color,
  size = 29,
}: {
  value: number;
  suffix?: string;
  color?: string;
  size?: number;
}) {
  const [display, setDisplay] = useState(value),
    current = useRef(value),
    reduced = useReducedMotion(),
    setting = useStore((s) => s.reducedMotion);
  useEffect(() => {
    let frame: number;
    const from = current.current,
      start = Date.now();
    const update = () => {
      const progress =
        reduced || setting ? 1 : Math.min(1, (Date.now() - start) / 220);
      const next = Math.round(
        from + (value - from) * (1 - (1 - progress) ** 3),
      );
      current.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, setting]);
  return (
    <Txt
      accessibilityLabel={`${value}${suffix}`}
      size={size}
      weight="600"
      color={color}
    >
      {display}
      {suffix}
    </Txt>
  );
}
