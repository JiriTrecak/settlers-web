import { type CurveSample } from './curve';

/** Exact distance inside a brush's influence, with a segment broad phase.
 * Outside the influence returns 1: callers only need the paint weight there. */
export class CurveIndex {
  private readonly buckets = new Map<string, number[]>();
  constructor(private readonly curve: readonly CurveSample[], private readonly cellSize = 16) {
    for (let i = 0; i < curve.length; i++) {
      const a = curve[i]!, b = curve[i + 1] ?? a, r = Math.max(.1, a.radius, b.radius);
      for (let z = Math.floor((Math.min(a.z, b.z) - r) / cellSize); z <= Math.floor((Math.max(a.z, b.z) + r) / cellSize); z++)
        for (let x = Math.floor((Math.min(a.x, b.x) - r) / cellSize); x <= Math.floor((Math.max(a.x, b.x) + r) / cellSize); x++) {
          const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
          bucket.push(i); this.buckets.set(key, bucket);
        }
    }
  }
  distance(x: number, z: number): number {
    let best = 1;
    for (const i of this.buckets.get(`${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`) ?? []) {
      const a = this.curve[i]!, b = this.curve[i + 1] ?? a;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t) / Math.max(.1, a.radius + (b.radius - a.radius) * t));
    }
    return best;
  }
}
