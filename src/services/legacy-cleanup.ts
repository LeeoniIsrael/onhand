import AsyncStorage from "@react-native-async-storage/async-storage";
export async function clearLegacyStorage() {
  await AsyncStorage.removeItem("onhand-v1");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (url) {
    const ref = new URL(url).hostname.split(".")[0];
    await AsyncStorage.removeItem(`sb-${ref}-auth-token`);
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(`sb-${ref}-auth-token`);
  }
}
