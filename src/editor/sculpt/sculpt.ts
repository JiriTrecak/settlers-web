/**
 * Height sculpt. Live raise/lower, or Water: paint a mask and Apply to cut a basin.
 */
import { HEIGHT_MIN, HEIGHT_ORIGIN, unionDirty, type HeightDirty, type HeightField } from "../../shared";
import { BrushMask } from "../brush/brush";

export const SCULPT_RADIUS_MIN = 1;
export const SCULPT_RADIUS_MAX = 32;
export const SCULPT_STRENGTH_MIN = 0.02;
export const SCULPT_STRENGTH_MAX = 1.2;

export type SculptMode = "live" | "water";

export const SCULPT_MODES: readonly { id: SculptMode; name: string }[] = [
  { id: "live", name: "Live" },
  { id: "water", name: "Water" },
];

export class SculptTool {
  radius = 4;
  strength = 0.25;
  mode: SculptMode = "live";
  readonly mask = new BrushMask();
  private last: { x: number; z: number } | null = null;

  constructor() {
    this.mask.radius = this.radius;
  }

  beginStroke(): void {
    this.last = null;
    this.mask.beginStroke();
  }

  setMode(mode: SculptMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.mask.clear();
  }

  setRadius(n: number): void {
    this.radius = clamp(n, SCULPT_RADIUS_MIN, SCULPT_RADIUS_MAX);
    this.mask.setRadius(this.radius);
  }

  setStrength(n: number): void {
    this.strength = clamp(n, SCULPT_STRENGTH_MIN, SCULPT_STRENGTH_MAX);
  }

  sizeBy(steps: number): void {
    this.setRadius(this.radius + steps * 0.5);
  }

  /** Interpolated disc so a fast drag doesn't skip. */
  stroke(wx: number, wz: number, lower: boolean, field: HeightField): HeightDirty | null {
    if (this.mode === "water") {
      this.mask.stroke(wx, wz, lower);
      return null;
    }
    const hits = samples(this.last, { x: wx, z: wz }, this.radius);
    this.last = { x: wx, z: wz };
    const delta = (lower ? -1 : 1) * this.strength;
    let dirty: HeightDirty | null = null;
    for (const h of hits) dirty = unionDirty(dirty, field.raise(h.x, h.z, this.radius, delta));
    return dirty;
  }

  /** Pull painted verts under the sea. Strength is basin depth in meters. */
  applyWater(field: HeightField): HeightDirty | null {
    if (this.mode !== "water" || !this.mask.any()) return null;
    const dirty = cutBasin(field, this.mask, this.strength);
    this.mask.clear();
    return dirty;
  }
}

export function cutBasin(field: HeightField, mask: BrushMask, depth: number): HeightDirty | null {
  const d = Math.max(0.05, depth);
  let any = false;
  let loX = field.verts;
  let hiX = -1;
  let loZ = field.verts;
  let hiZ = -1;
  for (let iz = 0; iz < field.verts; iz++) {
    const z = HEIGHT_ORIGIN + iz;
    for (let ix = 0; ix < field.verts; ix++) {
      const x = HEIGHT_ORIGIN + ix;
      const w = mask.sample(x, z);
      if (w < 0.08) continue;
      const i = iz * field.verts + ix;
      const target = -d * w;
      const next = Math.max(HEIGHT_MIN, Math.min(field.samples[i]!, target));
      if (next === field.samples[i]) continue;
      field.samples[i] = next;
      any = true;
      if (ix < loX) loX = ix;
      if (ix > hiX) hiX = ix;
      if (iz < loZ) loZ = iz;
      if (iz > hiZ) hiZ = iz;
    }
  }
  return any ? { loX, hiX, loZ, hiZ } : null;
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
