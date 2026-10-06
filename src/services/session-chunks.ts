// Keychain limits apply to bytes, including non-ASCII names in auth metadata.
export function sessionChunks(value: string, maxBytes = 1800): string[] {
  if (maxBytes < 4) throw new Error("Chunk size must fit a Unicode code point");
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes + size > maxBytes) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  if (current) chunks.push(current);
  return chunks;
}
