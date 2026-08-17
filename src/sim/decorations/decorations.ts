/**
 * Trees / stones from the dump; waves generated from water neighbors.
 * `sheet` is stored on the decoration — render does not pick a tree look.
 */
import { HEX_DELTAS, isWater } from "../../shared";
import type { MapView } from "../map/mapView";

export const TREE_SHEETS = 7;

export type MapDecoration =
  | { kind: "tree"; x: number; y: number; sheet: number }
  | { kind: "stone"; x: number; y: number; capacity: number }
  | { kind: "wave"; x: number; y: number };

/** Assign one of `TREE_SHEETS` looks from tile coords. Used when converting maps that don't store a sheet. */
export function treeSheetAt(x: number, y: number): number {
  return (x + ((x / 5) | 0) + ((y / 3) | 0) + y + ((y / 7) | 0)) % TREE_SHEETS;
}

/** Wave sprites on a 4-hex lattice where all 6 neighbors are water. */
export function waveDecorations(view: MapView): MapDecoration[] {
  const out: MapDecoration[] = [];
  const { width, height } = view;
  for (let y = 0; y < height; y++) {
    if (y % 4 !== 0) continue;
    for (let x = 0; x < width; x++) {
      if ((x + ((y / 2) | 0)) % 4 !== 0) continue;
      if (surroundedByWater(view, x, y)) out.push({ kind: "wave", x, y });
    }
  }
  return out;
}

function surroundedByWater(view: MapView, x: number, y: number): boolean {
  for (const { dx, dy } of HEX_DELTAS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= view.width || ny >= view.height) return false;
    if (!isWater(view.landscapeAt(nx, ny))) return false;
  }
  return true;
}

export function allDecorations(view: MapView, placed: readonly MapDecoration[] = []): MapDecoration[] {
  return placed.concat(waveDecorations(view));
}
