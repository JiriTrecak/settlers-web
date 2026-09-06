/**
 * Soft raise / lower brush for the height field. Shift lowers.
 */
import { unionDirty, type HeightDirty, type HeightField } from "../../shared";

export const SCULPT_RADIUS_MIN = 1;
export const SCULPT_RADIUS_MAX = 16;
export const SCULPT_STRENGTH_MIN = 0.02;
export const SCULPT_STRENGTH_MAX = 1.2;

export class SculptTool {
  radius = 4;
  strength = 0.25;
  private last: { x: number; z: number } | null = null;

  beginStroke(): void {
    this.last = null;
  }

  setRadius(n: number): void {
    this.radius = clamp(n, SCULPT_RADIUS_MIN, SCULPT_RADIUS_MAX);
  }

  setStrength(n: number): void {
    this.strength = clamp(n, SCULPT_STRENGTH_MIN, SCULPT_STRENGTH_MAX);
  }

  sizeBy(steps: number): void {
    this.setRadius(this.radius + steps * 0.5);
  }

  /** Interpolated disc so a fast drag doesn't skip. */
  stroke(wx: number, wz: number, lower: boolean, field: HeightField): HeightDirty | null {
    const hits = samples(this.last, { x: wx, z: wz }, this.radius);
    this.last = { x: wx, z: wz };
    const delta = (lower ? -1 : 1) * this.strength;
    let dirty: HeightDirty | null = null;
    for (const h of hits) dirty = unionDirty(dirty, field.raise(h.x, h.z, this.radius, delta));
    return dirty;
  }
}

function samples(from: { x: number; z: number } | null, to: { x: number; z: number }, radius: number): { x: number; z: number }[] {
  if (!from) return [to];
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const step = Math.max(0.25, radius * 0.28);
  const n = Math.max(1, Math.ceil(dist / step));
  const out: { x: number; z: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
