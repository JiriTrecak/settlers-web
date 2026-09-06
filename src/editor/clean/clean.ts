/**
 * Live eraser. Wipes authored stamps in a disc. Foliage type is reserved for the grass layer.
 */
import type { MapStamp } from "../../shared";

export const CLEAN_RADIUS_MIN = 1;
export const CLEAN_RADIUS_MAX = 32;

export type CleanType = "objects" | "foliage";

export const CLEAN_TYPES: readonly { id: CleanType; name: string; ready: boolean }[] = [
  { id: "objects", name: "Objects", ready: true },
  { id: "foliage", name: "Foliage", ready: false },
];

export class CleanTool {
  radius = 4;
  type: CleanType = "objects";
  private last: { x: number; z: number } | null = null;

  beginStroke(): void {
    this.last = null;
  }

  setRadius(n: number): void {
    this.radius = clamp(n, CLEAN_RADIUS_MIN, CLEAN_RADIUS_MAX);
  }

  setType(type: CleanType): void {
    if (CLEAN_TYPES.some((t) => t.id === type)) this.type = type;
  }

  sizeBy(steps: number): void {
    this.setRadius(this.radius + steps * 0.5);
  }

  /** Dabs from the last point so a fast drag doesn't skip. */
  stroke(wx: number, wz: number, stamps: readonly MapStamp[]): MapStamp[] | null {
    const hits = samples(this.last, { x: wx, z: wz }, this.radius);
    this.last = { x: wx, z: wz };
    const next = wipeStamps(stamps, hits, this.radius, this.type);
    return next.length === stamps.length ? null : next;
  }
}

export function wipeStamps(
  stamps: readonly MapStamp[],
  hits: readonly { x: number; z: number }[],
  radius: number,
  type: CleanType,
): MapStamp[] {
  if (type !== "objects" || hits.length === 0) return stamps.slice();
  const r2 = radius * radius;
  return stamps.filter((s) => {
    const sx = s.x + 0.5;
    const sy = s.y + 0.5;
    for (const h of hits) {
      const dx = sx - h.x;
      const dy = sy - h.z;
      if (dx * dx + dy * dy < r2) return false;
    }
    return true;
  });
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
