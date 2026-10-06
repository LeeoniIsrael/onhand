import React, { useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useHome } from "./Provider";
import {
  Action,
  CommandError,
  Copy,
  Input,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
  useCommand,
} from "./ui";
export default function AddressesScreen() {
  const { data } = useHome();
  const save = useCommand("save_address");
  const remove = useCommand("delete_address");
  const [editing, setEditing] = useState(false);
  const [street, setStreet] = useState("");
  const [unit, setUnit] = useState("");
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [label, setLabel] = useState("Home");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [manualLocation, setManualLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow location, or enter the coordinates below.");
      if (Platform.OS !== "web" && street.trim() && city.trim()) {
        const positions = await Location.geocodeAsync(
          `${street}, ${city}, ${zone}`,
        );
        if (!positions.length)
          throw new Error(
            "Address could not be located. Check it or enter coordinates.",
          );
        setLat(String(positions[0].latitude));
        setLng(String(positions[0].longitude));
      } else {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLat(String(location.coords.latitude));
        setLng(String(location.coords.longitude));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }
  if (data?.profile.role !== "customer")
    return (
      <Page back title="Address unavailable">
        <Copy>Workers see the job address after acceptance.</Copy>
      </Page>
    );
  return (
    <Page
      back
      title="Your addresses"
      subtitle="Exact details stay private until a worker accepts your job."
    >
      <Stack>
        {data.addresses.map((a) => (
          <Stack
            key={a.id}
            style={{
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: palette.line,
              gap: 6,
            }}
          >
            <Copy weight="600" size={19}>
              {a.label}
            </Copy>
            <Copy color={palette.slate}>
              {a.street}
              {a.unit ? `, ${a.unit}` : ""}, {a.city}
            </Copy>
            <QuietAction
              danger
              title={confirm === a.id ? "Confirm removal" : "Remove address"}
              disabled={remove.busy}
              onPress={() =>
                confirm === a.id
                  ? void remove.run({ id: a.id }, () => setConfirm(null))
                  : setConfirm(a.id)
              }
            />
          </Stack>
        ))}
        <CommandError command={remove} />
        {editing ? (
          <Stack style={{ marginTop: 8 }}>
            <Input
              label="Label"
              value={label}
              onChangeText={setLabel}
              maxLength={60}
            />
            <Input
              label="Street address"
              value={street}
              onChangeText={setStreet}
              autoComplete="street-address"
              maxLength={200}
            />
            <Input
              label="Apartment or unit (optional)"
              value={unit}
              onChangeText={setUnit}
              maxLength={60}
            />
            <Input
              label="City"
              value={city}
              onChangeText={setCity}
              maxLength={120}
            />
            <Input
              label="State"
              placeholder="NY"
              value={zone}
              onChangeText={setZone}
              autoCapitalize="characters"
              maxLength={120}
            />
            <Input
              label="Access instructions (optional)"
              value={instructions}
              onChangeText={setInstructions}
              multiline
              maxLength={1000}
            />
            <Action
              secondary
              title={
                Platform.OS === "web"
                  ? "Use my current location"
                  : "Locate this address"
              }
              busy={locating}
              onPress={() => void locate()}
            />
            <Copy size={13} color={palette.slate}>
              {Platform.OS === "web"
                ? "Use current location only when you are at this address."
                : "Locate the address to match workers nearby."}
            </Copy>
            {lat && lng ? (
              <Notice>
                Location set. Check that it belongs to this address.
              </Notice>
            ) : null}
            <QuietAction
              title={
                manualLocation
                  ? "Hide location details"
                  : "Set location manually"
              }
              onPress={() => setManualLocation(!manualLocation)}
            />
            {manualLocation && (
              <>
                <Input
                  label="Latitude"
                  value={lat}
                  onChangeText={setLat}
                  keyboardType="numbers-and-punctuation"
                />
                <Input
                  label="Longitude"
                  value={lng}
                  onChangeText={setLng}
                  keyboardType="numbers-and-punctuation"
                />
              </>
            )}
            {error && <Notice error>{error}</Notice>}
            <CommandError command={save} />
            <Action
              title="Save address"
              busy={save.busy}
              disabled={
                !street.trim() ||
                !city.trim() ||
                !zone.trim() ||
                !lat ||
                !lng ||
                !Number.isFinite(Number(lat)) ||
                !Number.isFinite(Number(lng)) ||
                Math.abs(Number(lat)) > 90 ||
                Math.abs(Number(lng)) > 180
              }
              onPress={() =>
                void save.run(
                  {
                    label,
                    street,
                    unit,
                    city,
                    zone: zone.trim().toUpperCase(),
                    instructions,
                    latitude: Number(lat),
                    longitude: Number(lng),
                  },
                  () => {
                    setEditing(false);
                    router.back();
                  },
                )
              }
            />
            <QuietAction title="Cancel" onPress={() => setEditing(false)} />
          </Stack>
        ) : (
          <Action title="Add address" onPress={() => setEditing(true)} />
        )}
      </Stack>
    </Page>
  );
}
