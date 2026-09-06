/**
 * Soft weight mask the foliage brush paints into. Apply samples this into stamps.
 */
import { inStamp, MAP_HALO, MAP_SIZE } from "../../shared";

export const BRUSH_RADIUS_MIN = 1;
export const BRUSH_RADIUS_MAX = 16;
export const BRUSH_DENSITY_MIN = 0.05;
export const BRUSH_DENSITY_MAX = 2.5;

export class BrushMask {
  readonly origin = -MAP_HALO;
  readonly span = MAP_SIZE + MAP_HALO * 2;
  readonly weights = new Float32Array(this.span * this.span);
  radius = 4;
  density = 0.45;
  dirty = false;
  private last: { x: number; z: number } | null = null;

  beginStroke(): void {
    this.last = null;
  }

  dab(wx: number, wz: number, erase: boolean): void {
    const r = this.radius;
    const loX = Math.floor(wx - r);
    const hiX = Math.ceil(wx + r);
    const loZ = Math.floor(wz - r);
    const hiZ = Math.ceil(wz + r);
    const sign = erase ? -1 : 1;
    for (let z = loZ; z <= hiZ; z++) {
      for (let x = loX; x <= hiX; x++) {
        if (!inStamp(x, z)) continue;
        const i = this.index(x, z);
        if (i < 0) continue;
        const d = Math.hypot(x + 0.5 - wx, z + 0.5 - wz);
        if (d >= r) continue;
        const falloff = (1 - d / r) ** 2;
        this.weights[i] = clamp01(this.weights[i]! + sign * falloff * 0.55);
      }
    }
    this.dirty = true;
  }

  /** Interpolate from the last dab so a fast drag doesn't skip. */
  stroke(wx: number, wz: number, erase: boolean): void {
    const prev = this.last;
    this.last = { x: wx, z: wz };
    if (!prev) {
      this.dab(wx, wz, erase);
      return;
    }
    const dist = Math.hypot(wx - prev.x, wz - prev.z);
    const step = Math.max(0.25, this.radius * 0.28);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.dab(prev.x + (wx - prev.x) * t, prev.z + (wz - prev.z) * t, erase);
    }
  }

  sample(wx: number, wz: number): number {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const i = this.index(x, z);
    return i < 0 ? 0 : this.weights[i]!;
  }

  clear(): void {
    this.weights.fill(0);
    this.last = null;
    this.dirty = true;
  }

  any(): boolean {
    for (let i = 0; i < this.weights.length; i++) if (this.weights[i]! > 0.04) return true;
    return false;
  }

  setRadius(n: number): void {
    this.radius = clamp(n, BRUSH_RADIUS_MIN, BRUSH_RADIUS_MAX);
  }

  setDensity(n: number): void {
    this.density = clamp(n, BRUSH_DENSITY_MIN, BRUSH_DENSITY_MAX);
  }

  sizeBy(steps: number): void {
    this.setRadius(this.radius + steps * 0.5);
  }

  densityBy(steps: number): void {
    this.setDensity(this.density * (steps > 0 ? 1.12 : 1 / 1.12));
  }

  private index(x: number, z: number): number {
    const c = x - this.origin;
    const r = z - this.origin;
    if (c < 0 || r < 0 || c >= this.span || r >= this.span) return -1;
    return r * this.span + c;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
