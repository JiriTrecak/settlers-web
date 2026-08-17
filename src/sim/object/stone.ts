/**
 * Stone piles. Capacity is remaining cuts (dump ids 115–127 → 12–0).
 * The cutter stands NE of the rock (`cutStand`) and faces sw.
 */
import type { GridPos } from "../../shared";

/** Stand tile for a cut: stone sits at stand + (−1, +1). */
export function cutStand(stone: GridPos): GridPos {
  return { x: stone.x + 1, y: stone.y - 1 };
}
