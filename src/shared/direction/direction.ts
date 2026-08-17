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
