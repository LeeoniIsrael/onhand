import "react-native-url-polyfill/auto";
import { validatePublicConfig } from "./public-config";
import { Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { createClient } from "@supabase/supabase-js";
import { boundedFetch } from "./bounded-fetch";
import { sessionStorage } from "./session-storage";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isLocalBackend = process.env.EXPO_PUBLIC_LOCAL_BACKEND === "true";
export const configurationError = validatePublicConfig(
  url,
  key,
  isLocalBackend,
);
const authStorageKey =
  !configurationError && url
    ? Platform.OS === "web"
      ? `onhand.web.${new URL(url).origin}.${randomUUID()}`
      : `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
    : "onhand.unconfigured";
export const supabase =
  !configurationError && url && key
    ? createClient(url, key, {
        auth: {
          storage: sessionStorage,
          storageKey: authStorageKey,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: boundedFetch,
          headers: { "X-Client-Info": "onhand/1.0.0" },
        },
      })
    : null;
// Check the selected account type before publishing a session to the UI.
// This short-lived client never persists tokens or starts a refresh timer.
export async function signInForRole(
  email: string,
  password: string,
  role: "customer" | "worker",
) {
  requireDatabase();
  const temporary = createClient(url!, key!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `onhand.login.${randomUUID()}`,
    },
    global: { fetch: boundedFetch },
  });
  const { data, error } = await temporary.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  const home = await temporary.rpc("marketplace_home");
  if (home.error) {
    await temporary.auth.signOut({ scope: "local" });
    throw home.error;
  }
  if (home.data.profile.role !== role) {
    await temporary.auth.signOut({ scope: "local" });
    throw new Error(
      `This is a ${home.data.profile.role === "worker" ? "worker" : "customer"} account. Choose that account type to sign in.`,
    );
  }
  const result = await requireDatabase().auth.setSession({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
  });
  if (result.error) throw result.error;
  return { session: result.data.session!, home: home.data };
}
export async function signOutOnDevice() {
  const raw = await sessionStorage.getItem(authStorageKey);
  let previous: { access_token: string; refresh_token: string } | null = null;
  try {
    previous = raw ? JSON.parse(raw) : null;
  } catch {}
  await sessionStorage.removeItem(authStorageKey);
  // Empty local storage lets the SDK emit SIGNED_OUT without a network call.
  await requireDatabase().auth.signOut({ scope: "local" });
  if (previous?.access_token && previous.refresh_token) {
    const tokens = previous;
    void (async () => {
      const isolated = createClient(url!, key!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `onhand.logout.${randomUUID()}`,
        },
        global: { fetch: boundedFetch },
      });
      await isolated.auth.setSession(tokens);
      await isolated.auth.signOut({ scope: "local" });
    })().catch(() => {});
  }
}
export function requireDatabase() {
  if (!supabase) throw new Error(configurationError || "Database unavailable");
  return supabase;
}
export function subscribeToJob(
  jobId: string,
  onChange: () => void,
  onConnection: (connected: boolean) => void,
) {
  if (!supabase) {
    onConnection(false);
    return () => {};
  }
  const channel = supabase
    .channel(`job:${jobId}:${randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `job_id=eq.${jobId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "counter_offers",
        filter: `job_id=eq.${jobId}`,
      },
      onChange,
    )
    .subscribe((s) => onConnection(s === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}
export async function uploadJobPhoto(
  jobId: string,
  photoId: string,
  bytes: ArrayBuffer,
  contentType: string,
) {
  if (bytes.byteLength > 8 * 1024 * 1024)
    throw new Error("Choose an image smaller than 8 MB.");
  const ext = (
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<
      string,
      string
    >
  )[contentType];
  if (!ext) throw new Error("Choose a JPEG, PNG or WebP image.");
  const { data, error } = await requireDatabase().functions.invoke("media", {
    body: bytes,
    headers: {
      "Content-Type": contentType,
      "x-job-id": jobId,
      "x-photo-id": photoId,
    },
  });
  if (error) {
    let message = "Photo upload could not be completed. Try again.";
    try {
      message = (await error.context?.json())?.error || message;
    } catch {}
    throw new Error(message);
  }
  return data.path;
}
