import { createClient } from "@supabase/supabase-js";
import { sessionStorage } from "./session-storage";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isLocalBackend = process.env.EXPO_PUBLIC_LOCAL_BACKEND === "true";
let privilegedKey=false;
if(key&&!key.startsWith('sb_publishable_')){try{privilegedKey=JSON.parse(atob(key.split('.')[1])).role==='service_role';}catch{}}
export const configurationError =
  !url || !key
    ? "Connect the database to start using OnHand."
    : (key.startsWith("sb_secret_")||privilegedKey)
      ? "Use a public Supabase key in the app configuration."
      : !url.startsWith("https://") &&
          !(
            isLocalBackend &&
            /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
              url,
            )
          )
        ? "The database endpoint must use HTTPS."
        : null;
export const supabase =
  !configurationError && url && key
    ? createClient(url, key, {
        auth: {
          storage: sessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: { headers: { "X-Client-Info": "onhand/1.0.0" } },
      })
    : null;
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
    .channel(`job:${jobId}`)
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
  const { data, error } = await requireDatabase()
    .storage.from("job-photos")
    .upload(`${jobId}/${photoId}.${ext}`, bytes, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return data.path;
}
