import {randomUUID} from "expo-crypto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
// Keychain values are chunked to stay below platform-specific item limits.
// A generation manifest is written last so interrupted writes retain the old session.
const chunkSize = 1800;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
async function removeGeneration(
  key: string,
  generation: string,
  count: number,
) {
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.deleteItemAsync(`${key}.${generation}.${i}`),
    ),
  );
}
export const sessionStorage = {
  getItem(key: string): Promise<string | null> {
    return serial(async () => {
      if (Platform.OS === "web")
        return typeof window === "undefined"
          ? null
          : window.sessionStorage.getItem(key);
      const raw = await SecureStore.getItemAsync(`${key}.manifest`, options);
      if (!raw) return null;
      const manifest = JSON.parse(raw) as { generation: string; count: number };
      if (
        !Number.isInteger(manifest.count) ||
        manifest.count < 1 ||
        manifest.count > 64
      )
        return null;
      const chunks = await Promise.all(
        Array.from({ length: manifest.count }, (_, i) =>
          SecureStore.getItemAsync(
            `${key}.${manifest.generation}.${i}`,
            options,
          ),
        ),
      );
      return chunks.some((c) => c === null) ? null : chunks.join("");
    });
  },
  setItem(key: string, value: string): Promise<void> {
    return serial(async () => {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined")
          window.sessionStorage.setItem(key, value);
        return;
      }
      const old = await SecureStore.getItemAsync(`${key}.manifest`, options);
      const generation = randomUUID();
      const count = Math.ceil(value.length / chunkSize);
      if (count > 64) throw new Error("Session is too large to store securely");
      for (let i = 0; i < count; i++)
        await SecureStore.setItemAsync(
          `${key}.${generation}.${i}`,
          value.slice(i * chunkSize, (i + 1) * chunkSize),
          options,
        );
      await SecureStore.setItemAsync(
        `${key}.manifest`,
        JSON.stringify({ generation, count }),
        options,
      );
      if (old) {
        const previous = JSON.parse(old);
        await removeGeneration(key, previous.generation, previous.count);
      }
    });
  },
  removeItem(key: string): Promise<void> {
    return serial(async () => {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined")
          window.sessionStorage.removeItem(key);
        return;
      }
      const old = await SecureStore.getItemAsync(`${key}.manifest`, options);
      await SecureStore.deleteItemAsync(`${key}.manifest`);
      if (old) {
        const previous = JSON.parse(old);
        await removeGeneration(key, previous.generation, previous.count);
      }
    });
  },
};
