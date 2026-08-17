/**
 * Forester cycle: rest inside, walk out with a sapling, kneel-plant south of the stand tile, go home.
 */
import { buildingDef } from "../data/buildings";
import { settlerDef } from "../data/settlers";
import type { Movable } from "../movable/movable";
import { isPlantSearch } from "../object/tree";
import { isWalkable } from "../path/path";
import type { Rng } from "../rng/rng";
import { atDoor, goDoor, type ProfessionContext } from "./profession";

/** In-area samples per search. Radius is biased toward the work center with u^3.9. */
const PLANT_SAMPLES = 100;
const PLANT_RADIUS_POWER = 3.9;

export function tickForester(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut) return;

  if (!atDoor(m, hut)) {
    goDoor(m, hut, ctx);
    return;
  }
  m.enter();
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return;
  }

  const stand = plantStandInArea(hut.pos, buildingDef(hut.kind).workRadius, ctx);
  if (!stand) return;
  m.restLeft = restTicks(ctx.tickMs);
  m.material = "tree";
  m.assignJob({ type: "plant", at: stand });
}

function restTicks(tickMs: number): number {
  return Math.max(0, Math.round((settlerDef("forester").restMs ?? 0) / tickMs));
}

/**
 * Random stand tile in the work circle. Tree goes at `y+1`.
 * Samples polar `(angle, u^3.9 * radius)` from the hut origin (default work center).
 */
function plantStandInArea(center: { x: number; y: number }, radius: number, ctx: ProfessionContext): { x: number; y: number } | null {
  const rng = ctx.rng;
  for (let i = 0; i < PLANT_SAMPLES; i++) {
    const stand = sampleInArea(rng, center, radius);
    if (!isWalkable(ctx.grid, stand.x, stand.y, ctx.blockers)) continue;
    if (!isPlantSearch(ctx.grid, ctx.buildings, ctx.objects, stand.x, stand.y)) continue;
    if (plantClaimed({ x: stand.x, y: stand.y + 1 }, ctx.units)) continue;
    return stand;
  }
  return null;
}

function sampleInArea(rng: Rng, center: { x: number; y: number }, radius: number): { x: number; y: number } {
  const angle = rng.nextFloat() * Math.PI * 2;
  const r = Math.pow(rng.nextFloat(), PLANT_RADIUS_POWER) * radius;
  return {
    x: (Math.cos(angle) * r + center.x) | 0,
    y: (Math.sin(angle) * r + center.y) | 0,
  };
}

function plantClaimed(plant: { x: number; y: number }, units: readonly Movable[]): boolean {
  for (const u of units) {
    if (u.job?.type !== "plant") continue;
    if (u.job.at.x === plant.x && u.job.at.y + 1 === plant.y) return true;
  }
  return false;
}
