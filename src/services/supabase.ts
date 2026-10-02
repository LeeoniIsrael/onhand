import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
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
    .subscribe((status) => onConnection(status === "SUBSCRIBED"));
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
  if (!supabase)
    throw new Error(
      "Photo storage is not configured. Your photo remains on this device.",
    );
  const { data, error } = await supabase.storage
    .from("job-photos")
    .upload(`${jobId}/${photoId}`, bytes, { contentType, upsert: false });
  if (error) throw error;
  return data.path;
}
