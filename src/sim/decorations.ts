import { HEX_DELTAS, isWater } from "../shared/landscape";
import type { ParsedOriginalMap } from "../assets/map";
import type { MapView } from "./mapView";

/** Java MapObjectDrawer.TREE_TYPES. */
export const TREE_TYPES = 7;

export type MapDecoration =
  | { kind: "tree"; x: number; y: number }
  | { kind: "stone"; x: number; y: number; capacity: number }
  | { kind: "wave"; x: number; y: number };

/** Java EOriginalMapObjectType TREE_* (68–80, 84). */
export function isTreeObject(id: number): boolean {
  return (id >= 68 && id <= 80) || id === 84;
}

/** Java RES_STONE_01..13 → capacity 12..0. */
export function stoneCapacity(id: number): number | null {
  if (id < 115 || id > 127) return null;
  return 127 - id;
}

/** Java MapObjectDrawer.getTreeType. */
export function treeTypeAt(x: number, y: number): number {
  return (x + ((x / 5) | 0) + ((y / 3) | 0) + y + ((y / 7) | 0)) % TREE_TYPES;
}

export function mapDecorations(map: ParsedOriginalMap): MapDecoration[] {
  const { width, objects } = map;
  const out: MapDecoration[] = [];
  for (let i = 0; i < objects.length; i++) {
    const id = objects[i]!;
    if (id === 0) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (isTreeObject(id)) out.push({ kind: "tree", x, y });
    else {
      const capacity = stoneCapacity(id);
      if (capacity !== null) out.push({ kind: "stone", x, y, capacity });
    }
  }
  return out;
}

/** Java MainGrid: 4-hex lattice, all 6 neighbors water. */
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

export function allDecorations(view: MapView, map?: ParsedOriginalMap | null): MapDecoration[] {
  const mapped = map ? mapDecorations(map) : [];
  return mapped.concat(waveDecorations(view));
}
