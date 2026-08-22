/**
 * Resource signs a geologist plants on even-even mountain. Non-blocking.
 * `capacity` is remaining ticks; `stateProgress` is deposit fill 0–1.
 */
import type { GridPos } from "../../shared";
import type { BuildingGrid } from "../building/building";
import type { MapGrid } from "../map/mapGrid";
import { signFromResource, type SignKind } from "../map/resource";
import type { MarkGrid } from "../mark/mark";
import type { Rng } from "../rng/rng";
import { isPathable, type Blockers } from "../path/path";
import { ObjectGrid, type MapObjectView } from "./object";

/** 4–9 minutes at 1×. */
export const SIGN_LIFE_MIN_MS = 4 * 60 * 1000;
export const SIGN_LIFE_SPAN_MS = 5 * 60 * 1000;

export function isSign(obj: MapObjectView | undefined): obj is MapObjectView & { kind: "sign"; sign: SignKind } {
  return obj?.kind === "sign" && obj.sign != null;
}

/**
 * Even-even mountain — geologist signs and mine origins share this lattice.
 */
export function isSignLattice(grid: MapGrid, x: number, y: number): boolean {
  if ((x & 1) !== 0 || (y & 1) !== 0) return false;
  if (!grid.inBounds(x, y)) return false;
  return grid.landscapeAt(x, y) === "mountain";
}

/**
 * Even-even mountain, not a hut, not already signed, pathable.
 * Search also requires the tile unmarked.
 */
export function canPlantSign(
  grid: MapGrid,
  buildings: BuildingGrid,
  objects: ObjectGrid,
  x: number,
  y: number,
  blockers?: Blockers,
): boolean {
  if (!isSignLattice(grid, x, y)) return false;
  if (buildings.protects(x, y)) return false;
  if (isSign(objects.get(x, y))) return false;
  if (blockers ? !isPathable(grid, x, y, blockers) : objects.blocks(x, y)) return false;
  return true;
}

export function isSignable(
  grid: MapGrid,
  buildings: BuildingGrid,
  objects: ObjectGrid,
  marks: MarkGrid,
  x: number,
  y: number,
  blockers?: Blockers,
): boolean {
  if (marks.claimed(x, y)) return false;
  return canPlantSign(grid, buildings, objects, x, y, blockers);
}

export function resourceSign(at: GridPos, sign: SignKind, fill: number, lifeTicks: number): MapObjectView {
  return {
    kind: "sign",
    x: at.x,
    y: at.y,
    sheet: 0,
    capacity: lifeTicks,
    stateProgress: Math.min(1, Math.max(0, fill)),
    sign,
  };
}

/** Plant from the tile's deposit. Lifetime 4–9 min, seeded. */
export function placeResourceSign(
  objects: ObjectGrid,
  grid: MapGrid,
  at: GridPos,
  rng: Rng,
  tickMs: number,
): MapObjectView | undefined {
  const { sign, fill } = signFromResource(grid.resourceAt(at.x, at.y));
  const lifeMs = SIGN_LIFE_MIN_MS + rng.nextFloat() * SIGN_LIFE_SPAN_MS;
  const ticks = Math.max(1, Math.round(lifeMs / tickMs));
  return objects.place(resourceSign(at, sign, fill, ticks));
}

export function tickSigns(objects: ObjectGrid): void {
  for (const obj of objects.all()) {
    if (obj.kind !== "sign") continue;
    obj.capacity -= 1;
    if (obj.capacity <= 0) objects.remove(obj.x, obj.y);
  }
}
