// Auth's broadcast channel uses its storage key. Give each page a different
// channel while preserving the physical tab-scoped session across reloads.
export function logicalSessionKey(key: string) {
  return key.startsWith("onhand.web.")
    ? key.replace(
        /\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=$|-)/i,
        "",
      )
    : key;
}
