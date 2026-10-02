import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, {
  Path,
  Line,
  Rect,
  G,
  Text as SvgText,
  Circle,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { colors as c } from "./tokens";
import { useStore } from "../state/store";
import { Txt } from "./ui";
export interface MapProps {
  height?: number;
  tracking?: boolean;
  searching?: boolean;
  demand?: boolean;
  children?: React.ReactNode;
}
// Schematic display provider. Exact positions never reach this public density map.
export function NeighborhoodMap({
  height = 350,
  tracking,
  searching,
  demand,
  children,
}: MapProps) {
  const pulse = useSharedValue(1),
    reduced = useReducedMotion(),
    setting = useStore((s) => s.reducedMotion);
  useEffect(() => {
    if (searching && !reduced && !setting)
      pulse.value = withRepeat(withTiming(1.6, { duration: 1600 }), -1, true);
    else pulse.value = 1;
  }, [searching, reduced, setting, pulse]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 1.5 - pulse.value * 0.6,
  }));
  return (
    <View
      style={{
        height,
        backgroundColor: "#1c2221",
        overflow: "hidden",
        borderRadius: 20,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 720 440"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id="warm">
            <Stop offset="0" stopColor={c.orange} stopOpacity="0.12" />
            <Stop offset="1" stopColor={c.orange} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="720" height="440" fill="#1a2020" />
        <Path
          d="M0 0H238L219 55 177 111 169 155 115 211 103 263 39 318 0 329Z"
          fill="#15262b"
        />
        <Path d="M0 0H128L117 55 92 98 74 105 52 148 0 174Z" fill="#242a29" />
        <G transform="rotate(-29 400 220)">
          {Array.from({ length: 16 }, (_, i) => (
            <G key={`block-${i}`}>
              {Array.from({ length: 12 }, (_, j) => (
                <Rect
                  key={j}
                  x={155 + i * 44}
                  y={-220 + j * 61}
                  width={32}
                  height={47}
                  rx="2"
                  fill={(i + j) % 5 === 0 ? "#242c29" : "#252b2a"}
                />
              ))}
            </G>
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <Line
              key={`v-${i}`}
              x1={148 + i * 44}
              y1="-220"
              x2={148 + i * 44}
              y2="700"
              stroke={i % 4 ? "#343b38" : "#475048"}
              strokeWidth={i % 4 ? 1 : 3}
            />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <Line
              key={`h-${i}`}
              x1="155"
              y1={-228 + i * 61}
              x2="1050"
              y2={-228 + i * 61}
              stroke={i % 3 ? "#343b38" : "#454e46"}
              strokeWidth={i % 3 ? 1 : 2.5}
            />
          ))}
          <Rect x="546" y="-43" width="77" height="105" rx="6" fill="#293b2e" />
          <Rect x="281" y="140" width="32" height="108" rx="5" fill="#293b2e" />
        </G>
        <Path
          d="M45 440L210 299 274 277 367 255 510 188 720 48"
          fill="none"
          stroke="#586052"
          strokeWidth="6"
          opacity="0.5"
        />
        <Path
          d="M45 440L210 299 274 277 367 255 510 188 720 48"
          fill="none"
          stroke="#212824"
          strokeWidth="2"
        />
        <SvgText
          x="83"
          y="239"
          fill="#536970"
          fontFamily="sans-serif"
          fontSize="12"
          letterSpacing="3"
          transform="rotate(-55 83 239)"
        >
          EAST RIVER
        </SvgText>
        <SvgText
          x="380"
          y="88"
          fill="#718078"
          fontFamily="sans-serif"
          fontSize="10"
          letterSpacing="2"
        >
          GREENPOINT
        </SvgText>
        <SvgText
          x="342"
          y="323"
          fill="#839087"
          fontFamily="sans-serif"
          fontSize="12"
          letterSpacing="3"
        >
          WILLIAMSBURG
        </SvgText>
        <SvgText
          x="557"
          y="404"
          fill="#66716a"
          fontFamily="sans-serif"
          fontSize="10"
          letterSpacing="2"
        >
          EAST WILLIAMSBURG
        </SvgText>
        <SvgText
          x="285"
          y="154"
          fill="#6d796b"
          fontFamily="sans-serif"
          fontSize="9"
          transform="rotate(-29 285 154)"
        >
          BEDFORD AVE
        </SvgText>
        <SvgText
          x="520"
          y="245"
          fill="#6d796b"
          fontFamily="sans-serif"
          fontSize="9"
          transform="rotate(-29 520 245)"
        >
          UNION AVE
        </SvgText>
        <SvgText
          x="571"
          y="102"
          fill="#769077"
          fontFamily="sans-serif"
          fontSize="9"
        >
          McCarren Park
        </SvgText>
        <Circle cx="368" cy="221" r="190" fill="url(#warm)" />
        {[
          { x: 252, y: 109 },
          { x: 463, y: 136 },
          { x: 546, y: 279 },
          { x: 281, y: 314 },
          { x: 620, y: 167 },
          { x: 431, y: 380 },
          { x: 328, y: 49 },
          { x: 573, y: 358 },
        ].map((p, i) => (
          <G key={i}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={demand ? 27 : 16}
              fill={demand ? "#ff641f14" : "#9bcca80a"}
            />
            <Circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={demand ? c.orange : "#91b49a"}
              opacity="0.7"
            />
            <Circle
              cx={p.x}
              cy={p.y}
              r="8"
              stroke={demand ? c.orange : "#91b49a"}
              strokeWidth="1"
              opacity="0.2"
            />
          </G>
        ))}
        {tracking && (
          <>
            <Path
              d="M463 136L428 156 444 187 394 215 375 183 348 198 365 229"
              fill="none"
              stroke="#ff641f33"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <Path
              d="M463 136L428 156 444 187 394 215 375 183 348 198 365 229"
              fill="none"
              stroke={c.orange}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle
              cx="463"
              cy="136"
              r="11"
              fill={c.orange}
              stroke="#fff"
              strokeWidth="3"
            />
          </>
        )}
        <Circle
          cx="365"
          cy="229"
          r="64"
          stroke={c.orange}
          strokeWidth="1"
          opacity="0.12"
        />
        <Circle
          cx="365"
          cy="229"
          r="39"
          fill="#ff641f0b"
          stroke={c.orange}
          strokeWidth="1"
          opacity="0.3"
        />
        <Circle
          cx="365"
          cy="229"
          r="8"
          fill={c.orange}
          stroke="#ffe4d2"
          strokeWidth="3"
        />
        <Rect x="326" y="253" width="80" height="27" rx="13.5" fill="#f3eee6" />
        <SvgText
          x="366"
          y="271"
          textAnchor="middle"
          fill="#252b27"
          fontFamily="sans-serif"
          fontSize="10"
          fontWeight="600"
        >
          Your home
        </SvgText>
      </Svg>
      {searching && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: 170,
              height: 170,
              left: "50%",
              top: "50%",
              marginLeft: -85,
              marginTop: -85,
              borderWidth: 1,
              borderColor: "#ff641f66",
              borderRadius: 100,
            },
            animated,
          ]}
        />
      )}
      <View style={{ position: "absolute", right: 12, bottom: 10 }}>
        <Txt size={9} color="#88918b">
          Illustrative neighborhood map
        </Txt>
      </View>
      {children}
    </View>
  );
}
