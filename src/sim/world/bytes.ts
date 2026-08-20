/**
 * Compact typed-array payloads for save files. JSON numbers would explode a 256² map.
 * Shape is part of SAVE_FORMAT_VERSION — bump that if this encoding changes.
 */
const CHUNK = 0x8000;

export function encodeU8(data: Uint8Array): string {
  let s = "";
  for (let i = 0; i < data.length; i += CHUNK) {
    s += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function encodeI8(data: Int8Array): string {
  return encodeU8(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

export function decodeU8(raw: unknown, expect: number): Uint8Array | null {
  if (typeof raw !== "string") return null;
  try {
    const bin = atob(raw);
    if (bin.length !== expect) return null;
    const out = new Uint8Array(expect);
    for (let i = 0; i < expect; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function decodeI8(raw: unknown, expect: number): Int8Array | null {
  const u = decodeU8(raw, expect);
  if (!u) return null;
  return new Int8Array(u.buffer, u.byteOffset, u.byteLength);
}
