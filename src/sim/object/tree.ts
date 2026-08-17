/**
 * Tree planting / growth. Foresters plant saplings; they become adult after `TREE_GROW_MS`.
 */
import { HEX_DELTAS, isRiver, isWater, type GridPos } from "../../shared";
import type { BuildingGrid } from "../building/building";
import type { MapGrid } from "../map/mapGrid";
import { treeSheetAt } from "../decorations/decorations";
import { ObjectGrid, type MapObjectView } from "./object";

/** 7 minutes at 1× — same as the original growth window. */
export const TREE_GROW_MS = 7 * 60 * 1000;

/**
 * Grass, not protected, no blocked neighbor (OOB / water / hut wall / tree).
 * The search adds "no protected neighbor" via `isPlantSearch`.
 */
export function isTreePlantable(grid: MapGrid, buildings: BuildingGrid, objects: ObjectGrid, x: number, y: number): boolean {
  if (!grid.inBounds(x, y)) return false;
  if (grid.landscapeAt(x, y) !== "grass") return false;
  if (buildings.protects(x, y) || objects.blocks(x, y)) return false;
  return !hasBlockedNeighbor(grid, buildings, objects, x, y);
}

/** Stand `(x, y)` plants at `(x, y+1)`. */
export function isPlantSearch(grid: MapGrid, buildings: BuildingGrid, objects: ObjectGrid, x: number, y: number): boolean {
  if (!grid.inBounds(x, y + 1)) return false;
  if (!isTreePlantable(grid, buildings, objects, x, y + 1)) return false;
  return !hasProtectedNeighbor(buildings, x, y + 1);
}

function hasBlockedNeighbor(grid: MapGrid, buildings: BuildingGrid, objects: ObjectGrid, x: number, y: number): boolean {
  for (const { dx, dy } of HEX_DELTAS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) return true;
    const land = grid.landscapeAt(nx, ny);
    if (isWater(land) || isRiver(land)) return true;
    if (buildings.blocks(nx, ny) || objects.blocks(nx, ny)) return true;
  }
  return false;
}

function hasProtectedNeighbor(buildings: BuildingGrid, x: number, y: number): boolean {
  for (const { dx, dy } of HEX_DELTAS) {
    if (buildings.protects(x + dx, y + dy)) return true;
  }
  return false;
}

export function plantTree(objects: ObjectGrid, at: GridPos): MapObjectView | undefined {
  return objects.place({
    kind: "tree",
    x: at.x,
    y: at.y,
    sheet: treeSheetAt(at.x, at.y),
    capacity: 0,
    stateProgress: 0,
    growing: true,
  });
}

export function tickTrees(objects: ObjectGrid, tickMs: number): void {
  const step = tickMs / TREE_GROW_MS;
  for (const obj of objects.all()) {
    if (obj.kind !== "tree" || !obj.growing) continue;
    obj.stateProgress = Math.min(1, obj.stateProgress + step);
    if (obj.stateProgress >= 1) {
      obj.growing = false;
      obj.stateProgress = 1;
    }
  }
}
