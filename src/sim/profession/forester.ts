/**
 * Forester cycle: rest inside, walk out with a sapling, kneel-plant south of the stand tile, go home.
 */
import type { Movable } from "../movable/movable";
import { isPlantSearch } from "../object/tree";
import { isWalkable } from "../path/path";
import type { Rng } from "../rng/rng";
import { beginRest, readyAtHut, workArea, type ProfessionContext } from "./profession";

/** In-area samples per search. Radius is biased toward the work center with u^3.9. */
const PLANT_SAMPLES = 100;
const PLANT_RADIUS_POWER = 3.9;

export function tickForester(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut) return;

  if (!readyAtHut(m, hut, ctx)) return;

  const area = workArea(hut);
  const stand = plantStandInArea(area.center, area.radius, hut.player, ctx);
  if (!stand) return;
  beginRest(m, ctx.tickMs);
  m.material = "tree";
  m.assignJob({ type: "plant", at: stand });
}

/**
 * Random stand tile in the work circle. Tree goes at `y+1`.
 * Samples polar `(angle, u^3.9 * radius)` from the work origin (`hut.work`).
 */
function plantStandInArea(
  center: { x: number; y: number },
  radius: number,
  player: number,
  ctx: ProfessionContext,
): { x: number; y: number } | null {
  const rng = ctx.rng;
  for (let i = 0; i < PLANT_SAMPLES; i++) {
    const stand = sampleInArea(rng, center, radius);
    if (!isWalkable(ctx.grid, stand.x, stand.y, ctx.blockers)) continue;
    if (!isPlantSearch(ctx.grid, ctx.buildings, ctx.objects, stand.x, stand.y, ctx.land, player)) continue;
    if (ctx.marks.claimed(stand.x, stand.y + 1)) continue;
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
