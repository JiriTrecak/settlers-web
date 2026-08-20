/**
 * Waterworker cycle: rest inside, stand next to water, fill a bucket, dump on the offer.
 */
import { HEX_DELTAS, circleContains, hexDist, isRiver, isWater, type GridPos } from "../../shared";
import { buildingDef } from "../data/buildings";
import type { Movable } from "../movable/movable";
import { canDeposit, STACK_SIZE } from "../object/object";
import { stackCount } from "../job/job";
import { acceptWork, beginRest, goHome, readyAtHut, workArea, type ProfessionContext } from "./profession";

export function tickWaterworker(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.kind !== "waterworks") return;
  const def = buildingDef("waterworks");
  const offRel = def.offerStacks[0];
  if (!offRel) return;
  const offer = { x: hut.pos.x + offRel.dx, y: hut.pos.y + offRel.dy };
  const area = workArea(hut);

  if (m.material === "water") {
    if (canDeposit(ctx.objects, offer, "water")) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goHome(m, hut, ctx);
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (stackCount(ctx.objects, offer, "water") >= STACK_SIZE) return;
  const hit = nearestWater(area.center, area.radius, hut.player, ctx);
  if (!hit) return;
  beginRest(m, ctx.tickMs);
  m.assignJob({ type: "gather", at: hit.stand, target: hit.water, output: "water" });
}

function nearestWater(
  center: GridPos,
  radius: number,
  player: number,
  ctx: ProfessionContext,
): { stand: GridPos; water: GridPos } | null {
  let best: { stand: GridPos; water: GridPos } | null = null;
  let bestD = Infinity;
  const r = Math.ceil(radius) + 1;
  for (let y = center.y - r; y <= center.y + r; y++) {
    for (let x = center.x - r; x <= center.x + r; x++) {
      if (!ctx.grid.inBounds(x, y)) continue;
      if (!circleContains(center.x, center.y, radius, x, y)) continue;
      const land = ctx.grid.landscapeAt(x, y);
      if (!isWater(land) && !isRiver(land)) continue;
      const water = { x, y };
      for (const { dx, dy } of HEX_DELTAS) {
        const stand = { x: x + dx, y: y + dy };
        if (!acceptWork(ctx, player, center, radius, water, stand, "stand")) continue;
        const d = hexDist(center.x, center.y, water.x, water.y);
        if (d < bestD) {
          bestD = d;
          best = { stand, water };
        }
      }
    }
  }
  return best;
}
