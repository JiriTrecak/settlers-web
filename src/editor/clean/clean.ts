import type { CoverPatch } from "../../shared/landscape/curve";
/**
 * Live eraser. Wipes authored stamps in a disc. Foliage erases plants and persisted meadow cover.
 */
import type { MapStamp } from "../../shared";

export const CLEAN_RADIUS_MIN = 1;
export const CLEAN_RADIUS_MAX = 32;

export type CleanType = "objects" | "foliage";

export const CLEAN_TYPES: readonly { id: CleanType; name: string; ready: boolean }[] = [
  { id: "objects", name: "Objects", ready: true },
  { id: "foliage", name: "Foliage", ready: true },
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

  strokeHits(x: number, z: number): { x: number; z: number }[] {
    const hits = samples(this.last, { x, z }, this.radius);
    this.last = { x, z };
    return hits;
  }

  /** Dabs from the last point so a fast drag doesn't skip. */
  stroke(wx: number, wz: number, stamps: readonly MapStamp[]): MapStamp[] | null {
    const hits = this.strokeHits(wx, wz);
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
  if (hits.length === 0) return stamps.slice();
  const r2 = radius * radius;
  return stamps.filter((s) => {
    if (type === "foliage" && !/^(coniferous_trees_|lowpolymushroom_|tree_|grass_|synty-(tree-|plant-)|pine(?:-|$)|tree(?:-|$)|fern(?:-|$)|grass(?:-|$)|flower(?:-|$)|mushroom(?:-|$)|lily(?:-|$)|river-reeds$)/.test(s.asset)) return true;
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

/** Per-patch holes preserve the seeded planting outside the stroke; new patches remain paintable. */
export function eraseCover(cover: readonly CoverPatch[], hits: readonly {x:number;z:number}[], radius:number): CoverPatch[] {
  return cover.map(p => {
    const additions = hits.filter(h => Math.hypot(h.x-p.x,h.z-p.z)<p.radius+radius);
    if (!additions.length) return p;
    const exclusions = [...(p.exclusions ?? [])];
    for (const h of additions) {
      if (exclusions.some(e => Math.hypot(e.x-h.x,e.z-h.z)+radius<=e.radius+.001)) continue;
      exclusions.push({...h,radius});
    }
    return exclusions.length===(p.exclusions?.length??0) ? p : {...p,exclusions};
  });
}
