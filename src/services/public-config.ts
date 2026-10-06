// These checks run before any client or auth request is created. Never accept privileged keys.
function jwtRole(key: string): string | null {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0,
      value = 0,
      decoded = "";
    for (const char of part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/=+$/, "")) {
      const digit = alphabet.indexOf(char);
      if (digit < 0) return null;
      value = (value << 6) | digit;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        decoded += String.fromCharCode((value >> bits) & 255);
      }
    }
    return JSON.parse(decoded).role ?? null;
  } catch {
    return null;
  }
}
export function isPublicKey(key: string) {
  return key.startsWith("sb_publishable_") || jwtRole(key) === "anon";
}
export function isPrivateHost(host: string) {
  if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) return true;
  const parts = host.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
}
export function validatePublicConfig(
  url: string | undefined,
  key: string | undefined,
  local: boolean,
): string | null {
  if (!url || !key) return "Connect the database to start using OnHand.";
  if (!isPublicKey(key))
    return "Use a public Supabase key in the app configuration.";
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash)
      throw new Error("Invalid endpoint");
    if (
      parsed.protocol !== "https:" &&
      !(local && parsed.protocol === "http:" && isPrivateHost(parsed.hostname))
    )
      return "The database endpoint must use HTTPS.";
  } catch {
    return "Enter a valid database endpoint.";
  }
  return null;
}
