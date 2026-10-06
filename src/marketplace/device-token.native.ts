import * as SecureStore from "expo-secure-store";
import { requireDatabase } from "../services/supabase";
export async function clearDeviceToken() {
  const token = await SecureStore.getItemAsync("onhand.push-token");
  if (token) {
    await requireDatabase().rpc("unregister_device", { p_token: token });
    await SecureStore.deleteItemAsync("onhand.push-token");
  }
}
