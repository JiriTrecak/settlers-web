/**
 * Stonecutter cycle: rest inside the hut, stand NE of a rock facing sw, cut it,
 * carry the stone, dump it on the offer stack.
 *
 * Owns and marks the *stand*, not the rock — a border stone is cuttable if you
 * can stand on your land.
 */
import { hexDist, type GridPos } from "../../shared";
import { buildingDef } from "../data/buildings";
import type { Movable } from "../movable/movable";
import { canDeposit } from "../object/object";
import { cutStand } from "../object/stone";
import { acceptWork, beginRest, goHome, readyAtHut, workArea, type ProfessionContext } from "./profession";

export function tickStonecutter(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut) return;
  const def = buildingDef(hut.kind);
  const area = workArea(hut);
  const offerRel = def.offerStacks[0];
  if (!offerRel) return;
  const offer = { x: hut.pos.x + offerRel.dx, y: hut.pos.y + offerRel.dy };

  if (m.material === "stone") {
    if (canDeposit(ctx.objects, offer, "stone")) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else {
      goHome(m, hut, ctx);
    }
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (!canDeposit(ctx.objects, offer, "stone")) return;

  const stone = nearestStone(area.center, area.radius, hut.player, ctx);
  if (!stone) return;
  m.assignJob({ type: "cut", at: stone });
}

function nearestStone(center: GridPos, radius: number, player: number, ctx: ProfessionContext): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of ctx.objects.view()) {
    if (obj.kind !== "stone" || obj.capacity <= 0) continue;
    const at = { x: obj.x, y: obj.y };
    if (!acceptWork(ctx, player, center, radius, at, cutStand(at), "stand")) continue;
    const d = hexDist(center.x, center.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}
