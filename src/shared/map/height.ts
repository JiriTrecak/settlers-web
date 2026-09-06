/**
 * Per-vertex height field. One sample per cell corner (span+1).
 * Soft raise/lower; bilinear sample. File encoding is Int16 centimeters.
 */
import { MAP_HALO, MAP_SIZE } from "./map";

export const HEIGHT_MIN = -16;
export const HEIGHT_MAX = 24;
export const HEIGHT_SPAN = MAP_SIZE + MAP_HALO * 2;
export const HEIGHT_VERTS = HEIGHT_SPAN + 1;
export const HEIGHT_ORIGIN = -MAP_HALO;

export type HeightDirty = { loX: number; hiX: number; loZ: number; hiZ: number };

export class HeightField {
  readonly origin = HEIGHT_ORIGIN;
  readonly span = HEIGHT_SPAN;
  readonly verts = HEIGHT_VERTS;
  readonly samples = new Float32Array(HEIGHT_VERTS * HEIGHT_VERTS);
  waterLevel = 0;

  load(samples: ArrayLike<number>, waterLevel = 0): void {
    const n = Math.min(this.samples.length, samples.length);
    this.samples.fill(0);
    for (let i = 0; i < n; i++) this.samples[i] = clampH(samples[i]!);
    this.waterLevel = Number.isFinite(waterLevel) ? waterLevel : 0;
  }

  clear(): void {
    this.samples.fill(0);
    this.waterLevel = 0;
  }

  sample(x: number, z: number): number {
    return sampleHeight(this.samples, x, z);
  }

  wet(x: number, z: number): boolean {
    return this.sample(x, z) < this.waterLevel;
  }

  flat(): boolean {
    for (let i = 0; i < this.samples.length; i++) if (this.samples[i] !== 0) return false;
    return true;
  }

  raise(wx: number, wz: number, radius: number, delta: number): HeightDirty | null {
    if (!Number.isFinite(delta) || delta === 0 || radius <= 0) return null;
    const r = radius;
    const loX = Math.max(0, Math.floor(wx - this.origin - r));
    const hiX = Math.min(this.verts - 1, Math.ceil(wx - this.origin + r));
    const loZ = Math.max(0, Math.floor(wz - this.origin - r));
    const hiZ = Math.min(this.verts - 1, Math.ceil(wz - this.origin + r));
    let any = false;
    let minX = this.verts;
    let maxX = -1;
    let minZ = this.verts;
    let maxZ = -1;
    for (let iz = loZ; iz <= hiZ; iz++) {
      const z = this.origin + iz;
      for (let ix = loX; ix <= hiX; ix++) {
        const x = this.origin + ix;
        const d = Math.hypot(x - wx, z - wz);
        if (d >= r) continue;
        const i = iz * this.verts + ix;
        const falloff = (1 - d / r) ** 2;
        this.samples[i] = clampH(this.samples[i]! + delta * falloff);
        any = true;
        if (ix < minX) minX = ix;
        if (ix > maxX) maxX = ix;
        if (iz < minZ) minZ = iz;
        if (iz > maxZ) maxZ = iz;
      }
    }
    return any ? { loX: minX, hiX: maxX, loZ: minZ, hiZ: maxZ } : null;
  }
}

export function sampleHeight(samples: ArrayLike<number>, x: number, z: number): number {
  const fx = x - HEIGHT_ORIGIN;
  const fz = z - HEIGHT_ORIGIN;
  if (fx < 0 || fz < 0 || fx > HEIGHT_SPAN || fz > HEIGHT_SPAN) return 0;
  const x0 = Math.min(HEIGHT_SPAN, Math.floor(fx));
  const z0 = Math.min(HEIGHT_SPAN, Math.floor(fz));
  const x1 = Math.min(HEIGHT_SPAN, x0 + 1);
  const z1 = Math.min(HEIGHT_SPAN, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const a = samples[z0 * HEIGHT_VERTS + x0] ?? 0;
  const b = samples[z0 * HEIGHT_VERTS + x1] ?? 0;
  const c = samples[z1 * HEIGHT_VERTS + x0] ?? 0;
  const d = samples[z1 * HEIGHT_VERTS + x1] ?? 0;
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}

export function encodeHeight(samples: ArrayLike<number>): string | undefined {
  const n = HEIGHT_VERTS * HEIGHT_VERTS;
  if (samples.length < n) return undefined;
  const i16 = new Int16Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const cm = Math.round(clampH(samples[i]!) * 100);
    i16[i] = cm;
    if (cm) any = true;
  }
  if (!any) return undefined;
  return bytesToB64(new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength));
}

export function decodeHeight(raw: string): Float32Array | null {
  if (!raw) return null;
  const bytes = b64ToBytes(raw);
  if (!bytes || bytes.byteLength !== HEIGHT_VERTS * HEIGHT_VERTS * 2) return null;
  const copy = bytes.byteOffset === 0 ? bytes : bytes.slice();
  const i16 = new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i]! / 100;
  return out;
}

export function unionDirty(a: HeightDirty | null, b: HeightDirty | null): HeightDirty | null {
  if (!a) return b;
  if (!b) return a;
  return {
    loX: Math.min(a.loX, b.loX),
    hiX: Math.max(a.hiX, b.hiX),
    loZ: Math.min(a.loZ, b.loZ),
    hiZ: Math.max(a.hiZ, b.hiZ),
  };
}

function clampH(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, n));
}

function bytesToB64(bytes: Uint8Array): string {
  const Buf = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (Buf) return Buf.from(bytes).toString("base64");
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

function b64ToBytes(raw: string): Uint8Array | null {
  try {
    const Buf = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
    if (Buf) return new Uint8Array(Buf.from(raw, "base64"));
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
