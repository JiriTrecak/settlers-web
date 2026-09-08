/** Per-tool sizes are editor preferences, independent of the open map. */
export type BrushSizeKind = 'brush' | 'clean' | 'sculpt' | 'terrain' | 'decal';
export function readBrushSize(kind: BrushSizeKind, max = 32): number {
  try {
    const raw = globalThis.localStorage?.getItem(`utc.brush-size.${kind}`);
    const n = raw === null || raw === undefined ? 4 : Number(raw);
    return Number.isFinite(n) && n >= (kind === 'decal' ? .5 : 1) ? Math.min(max, n) : 4;
  } catch { return 4; }
}
export function saveBrushSize(kind: BrushSizeKind, radius: number): void {
  if (!Number.isFinite(radius)) return;
  try { globalThis.localStorage?.setItem(`utc.brush-size.${kind}`, String(radius)); } catch { /* Storage may be unavailable. */ }
}
