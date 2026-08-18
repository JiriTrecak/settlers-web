/**
 * Sprite pick math. SettlerLayer samples body/torso pixels; tests stay Pixi-free.
 */

/** Opaque enough to count as the unit, not fringe compression noise. */
export const ALPHA_MIN = 8;

export function localHits(lx: number, ly: number, width: number, height: number, alpha: Uint8Array | null): boolean {
  if (lx < 0 || ly < 0 || lx >= width || ly >= height) return false;
  if (!alpha) return true;
  return (alpha[(ly | 0) * width + (lx | 0)] ?? 0) > ALPHA_MIN;
}

export function aabbOverlap(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  const aL = Math.min(ax0, ax1);
  const aR = Math.max(ax0, ax1);
  const aT = Math.min(ay0, ay1);
  const aB = Math.max(ay0, ay1);
  const bL = Math.min(bx0, bx1);
  const bR = Math.max(bx0, bx1);
  const bT = Math.min(by0, by1);
  const bB = Math.max(by0, by1);
  return aL < bR && aR > bL && aT < bB && aB > bT;
}
