/**
 * Start cell for a slot. One player sits at map center. Several sit evenly
 * on a ring — a function of N, not a hardcoded P2 corner.
 */
import type { GridPos } from "../../shared";

export function startCell(slotIndex: number, slotCount: number, mapSize: number): GridPos {
  const mid = (mapSize / 2) | 0;
  if (slotCount <= 1) return { x: mid, y: mid };
  const inset = Math.max(8, mapSize >> 3);
  const radius = mid - inset;
  const t = (2 * Math.PI * slotIndex) / slotCount;
  const x = mid + Math.round(Math.cos(t) * radius);
  const y = mid + Math.round(Math.sin(t) * radius);
  return {
    x: Math.min(mapSize - 1, Math.max(0, x)),
    y: Math.min(mapSize - 1, Math.max(0, y)),
  };
}
