import { logicalSessionKey } from "./session-key";
import { sessionChunks } from "./session-chunks";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
// Keychain values are chunked to stay below platform-specific item limits.
// A generation manifest is written last so interrupted writes retain the old session.
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
function manifest(
  raw: string | null,
): { generation: string; count: number } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value.generation === "string" &&
      /^[0-9a-f-]{36}$/i.test(value.generation) &&
      Number.isInteger(value.count) &&
      value.count >= 1 &&
      value.count <= 64
      ? value
      : null;
  } catch {
    return null;
  }
}
export const sessionStorage = {
  getItem(key: string): Promise<string | null> {
    return serial(async () => {
      if (Platform.OS === "web")
        return typeof window === "undefined"
          ? null
          : window.sessionStorage.getItem(logicalSessionKey(key));
      const raw = await SecureStore.getItemAsync(`${key}.manifest`, options);
      if (!raw) return null;
      const current = manifest(raw);
      if (!current) return null;
      const chunks = await Promise.all(
        Array.from({ length: current.count }, (_, i) =>
          SecureStore.getItemAsync(
            `${key}.${current.generation}.${i}`,
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
          window.sessionStorage.setItem(logicalSessionKey(key), value);
        return;
      }
      const old = await SecureStore.getItemAsync(`${key}.manifest`, options);
      const generation = randomUUID();
      const chunks = sessionChunks(value);
      const count = chunks.length;
      if (count < 1 || count > 64)
        throw new Error("Session is too large to store securely");
      for (let i = 0; i < count; i++)
        await SecureStore.setItemAsync(
          `${key}.${generation}.${i}`,
          chunks[i],
          options,
        );
      await SecureStore.setItemAsync(
        `${key}.manifest`,
        JSON.stringify({ generation, count }),
        options,
      );
      if (old) {
        const previous = manifest(old);
        if (previous)
          await removeGeneration(
            key,
            previous.generation,
            previous.count,
          ).catch(() => {});
      }
    });
  },
  removeItem(key: string): Promise<void> {
    return serial(async () => {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined")
          window.sessionStorage.removeItem(logicalSessionKey(key));
        return;
      }
      const old = await SecureStore.getItemAsync(`${key}.manifest`, options);
      await SecureStore.deleteItemAsync(`${key}.manifest`);
      if (old) {
        const previous = manifest(old);
        if (previous)
          await removeGeneration(
            key,
            previous.generation,
            previous.count,
          ).catch(() => {});
      }
    });
  },
};
