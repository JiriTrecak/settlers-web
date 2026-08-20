/**
 * Crop planting / growth. Farmers plant on grass in the work circle;
 * adult crop (`stateProgress` 1) can be harvested. Crops do not block walking.
 */
import type { GridPos, LandscapeType } from "../../shared";
import type { BuildingGrid } from "../building/building";
import type { LandGrid } from "../land/land";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, type MapObjectView } from "./object";

/** 10 minutes at 1× — same as the original corn growth window. */
export const CROP_GROW_MS = 10 * 60 * 1000;

const FIELD: ReadonlySet<LandscapeType> = new Set(["grass", "earth", "flattened"]);

export function isCropPlantable(
  grid: MapGrid,
  buildings: BuildingGrid,
  objects: ObjectGrid,
  x: number,
  y: number,
  land?: LandGrid,
  player?: number,
): boolean {
  if (!grid.inBounds(x, y)) return false;
  if (!FIELD.has(grid.landscapeAt(x, y))) return false;
  if (buildings.protects(x, y) || buildings.blocks(x, y)) return false;
  if (objects.get(x, y)) return false;
  if (land != null && player != null && !land.owns(x, y, player)) return false;
  return true;
}

export function isAdultCrop(obj: MapObjectView | undefined): boolean {
  return obj?.kind === "crop" && !obj.growing && obj.stateProgress >= 1;
}

export function plantCrop(objects: ObjectGrid, at: GridPos): MapObjectView | undefined {
  return objects.place({
    kind: "crop",
    x: at.x,
    y: at.y,
    sheet: 0,
    capacity: 0,
    stateProgress: 0,
    growing: true,
  });
}

export function tickCrops(objects: ObjectGrid, tickMs: number): void {
  const step = tickMs / CROP_GROW_MS;
  for (const obj of objects.all()) {
    if (obj.kind !== "crop" || !obj.growing) continue;
    obj.stateProgress = Math.min(1, obj.stateProgress + step);
    if (obj.stateProgress >= 1) {
      obj.growing = false;
      obj.stateProgress = 1;
    }
  }
}
