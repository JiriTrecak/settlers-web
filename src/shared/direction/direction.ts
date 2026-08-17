/**
 * Six facing dirs on the diamond grid. `HEX_DELTAS` order is ne → nw clockwise.
 */
import { HEX_DELTAS } from "../landscape/landscape";

export const DIRECTIONS = ["ne", "e", "se", "sw", "w", "nw"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export function directionFromDelta(dx: number, dy: number): Direction {
  const i = HEX_DELTAS.findIndex((d) => d.dx === dx && d.dy === dy);
  return DIRECTIONS[i] ?? "e";
}

export function deltaOf(dir: Direction): { dx: number; dy: number } {
  return HEX_DELTAS[DIRECTIONS.indexOf(dir)]!;
}

/** `n` in [-6, 6]. Positive is counter-clockwise on `DIRECTIONS`. */
export function neighborDir(dir: Direction, n: number): Direction {
  const i = DIRECTIONS.indexOf(dir);
  return DIRECTIONS[(i - n + DIRECTIONS.length * 4) % DIRECTIONS.length]!;
}

const TAN_22_5 = Math.tan(Math.PI / 8);
const TAN_67_5 = Math.tan((Math.PI * 3) / 8);

/** Best facing from `(0,0)` toward `(dx, dy)`. Equal points → `sw`. */
export function approxDirection(dx: number, dy: number): Direction {
  if (dx === 0) return dy < 0 ? "ne" : "sw";
  const incline = dy / dx;
  if (dx > 0) {
    if (incline < -1) return "ne";
    if (incline < TAN_22_5) return "e";
    if (incline < TAN_67_5) return "se";
    return "sw";
  }
  if (incline < -1) return "sw";
  if (incline < TAN_22_5) return "w";
  if (incline < TAN_67_5) return "nw";
  return "ne";
}
