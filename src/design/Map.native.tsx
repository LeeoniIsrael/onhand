import React from "react";
import { View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { NeighborhoodMap as SchematicMap, MapProps } from "./SchematicMap";
import { home } from "../domain/seed";
import { colors } from "./tokens";
const darkStyle = [
  { elementType: "geometry", stylers: [{ color: "#202724" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#819088" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#202724" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#14272d" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#3c453d" }],
  },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];
// Opt-in platform map, no precise worker data before acceptance. A routing provider
// supplies the real route/ETA in production; the demo uses the schematic provider.
export function NeighborhoodMap(props: MapProps) {
  if (process.env.EXPO_PUBLIC_LIVE_MAPS !== "true")
    return <SchematicMap {...props} />;
  return (
    <View
      style={{
        height: props.height ?? 350,
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      <MapView
        style={{ flex: 1 }}
        userInterfaceStyle="dark"
        customMapStyle={darkStyle}
        initialRegion={{
          ...home.coordinates,
          latitudeDelta: 0.045,
          longitudeDelta: 0.045,
        }}
        showsUserLocation={false}
      >
        <Circle
          center={home.coordinates}
          radius={350}
          fillColor="#ff641f12"
          strokeColor="#ff641f50"
        />
        <Marker
          coordinate={home.coordinates}
          title="Your home"
          pinColor={colors.orange}
        />
      </MapView>
      {props.children}
    </View>
  );
}
