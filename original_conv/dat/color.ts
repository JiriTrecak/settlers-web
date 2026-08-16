import type { DatColor } from "./types";

export type { DatColor };

/** Java Color.cnv5to8 / cnv6to8 — truncates toward 0. */
const cnv5 = (v: number): number => ((v & 31) * 255) / 31 | 0;
const cnv6 = (v: number): number => ((v & 63) * 255) / 63 | 0;

/** Java Color.convert565to8888 → RGBA bytes. */
export function rgb565ToRgba(c: number): [number, number, number, number] {
  return [cnv5(c >> 11), cnv6(c >> 5), cnv5(c), 255];
}

/** Java Color.convert555to8888 → RGBA bytes. */
export function rgb555ToRgba(c: number): [number, number, number, number] {
  return [cnv5(c >> 10), cnv5(c >> 5), cnv5(c), 255];
}

export function unpackColor(c: number, mode: DatColor): [number, number, number, number] {
  return mode === "rgb565" ? rgb565ToRgba(c) : rgb555ToRgba(c);
}

export function packRgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

export const SHADOW_RGBA: [number, number, number, number] = [0, 0, 0, 136];
