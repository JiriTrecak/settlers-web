/**
 * Farmer cycle: rest inside, harvest adult crop in the work circle, else plant,
 * dump crop on the offer.
 */
import { circleContains, hexDist, type GridPos } from "../../shared";
import { buildingDef } from "../data/buildings";
import type { Movable } from "../movable/movable";
import { isAdultCrop, isCropPlantable } from "../object/crop";
import { canDeposit, STACK_SIZE } from "../object/object";
import { isWalkable } from "../path/path";
import { stackCount } from "../job/job";
import type { Rng } from "../rng/rng";
import { beginRest, goHome, readyAtHut, workArea, type ProfessionContext } from "./profession";

const PLANT_SAMPLES = 100;
const PLANT_RADIUS_POWER = 3.9;

export function tickFarmer(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.kind !== "farm") return;
  const def = buildingDef("farm");
  const offRel = def.offerStacks[0];
  if (!offRel) return;
  const offer = { x: hut.pos.x + offRel.dx, y: hut.pos.y + offRel.dy };
  const area = workArea(hut);

  if (m.material === "crop") {
    if (canDeposit(ctx.objects, offer, "crop")) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goHome(m, hut, ctx);
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (stackCount(ctx.objects, offer, "crop") >= STACK_SIZE) return;

  const ripe = nearestRipe(area.center, area.radius, hut.player, ctx);
  if (ripe) {
    beginRest(m, ctx.tickMs);
    m.assignJob({ type: "harvest", at: ripe });
    return;
  }

  const plant = plantTileInArea(area.center, area.radius, hut.player, ctx);
  if (!plant) return;
  beginRest(m, ctx.tickMs);
  m.assignJob({ type: "plantCrop", at: plant });
}

function nearestRipe(center: GridPos, radius: number, player: number, ctx: ProfessionContext): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of ctx.objects.all()) {
    if (!isAdultCrop(obj)) continue;
    const at = { x: obj.x, y: obj.y };
    if (!ctx.land.owns(at.x, at.y, player)) continue;
    if (ctx.marks.claimed(at.x, at.y)) continue;
    if (!circleContains(center.x, center.y, radius, at.x, at.y)) continue;
    if (!isWalkable(ctx.grid, at.x, at.y, ctx.blockers)) continue;
    const d = hexDist(center.x, center.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

function plantTileInArea(
  center: GridPos,
  radius: number,
  player: number,
  ctx: ProfessionContext,
): GridPos | null {
  const rng = ctx.rng;
  for (let i = 0; i < PLANT_SAMPLES; i++) {
    const at = sampleInArea(rng, center, radius);
    if (!isWalkable(ctx.grid, at.x, at.y, ctx.blockers)) continue;
    if (!isCropPlantable(ctx.grid, ctx.buildings, ctx.objects, at.x, at.y, ctx.land, player)) continue;
    if (ctx.marks.claimed(at.x, at.y)) continue;
    return at;
  }
  return null;
}

function sampleInArea(rng: Rng, center: GridPos, radius: number): GridPos {
  const angle = rng.nextFloat() * Math.PI * 2;
  const r = Math.pow(rng.nextFloat(), PLANT_RADIUS_POWER) * radius;
  return {
    x: (Math.cos(angle) * r + center.x) | 0,
    y: (Math.sin(angle) * r + center.y) | 0,
  };
}
