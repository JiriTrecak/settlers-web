/**
 * Lumberjack cycle: rest inside the hut, stand SE of a tree facing nw, fell it,
 * carry the trunk, dump it on the offer stack.
 */
import { hexDist, type GridPos } from "../../shared";
import { buildingDef } from "../data/buildings";
import type { Movable } from "../movable/movable";
import { canDeposit } from "../object/object";
import { chopStand } from "../object/tree";
import { acceptWork, beginRest, goHome, readyAtHut, type ProfessionContext } from "./profession";

export function tickLumberjack(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut) return;
  const def = buildingDef(hut.kind);
  const offerRel = def.offerStacks[0];
  if (!offerRel) return;
  const offer = { x: hut.pos.x + offerRel.dx, y: hut.pos.y + offerRel.dy };

  if (m.material === "trunk") {
    if (canDeposit(ctx.objects, offer, "trunk")) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else {
      goHome(m, hut, ctx);
    }
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (!canDeposit(ctx.objects, offer, "trunk")) return;

  const tree = nearestTree(hut.pos, def.workRadius, hut.player, ctx);
  if (!tree) return;
  m.assignJob({ type: "chop", at: tree });
}

function nearestTree(center: GridPos, radius: number, player: number, ctx: ProfessionContext): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of ctx.objects.view()) {
    if (obj.kind !== "tree") continue;
    const at = { x: obj.x, y: obj.y };
    if ((obj.stateProgress ?? 1) < 1) continue;
    if (!acceptWork(ctx, player, center, radius, at, chopStand(at))) continue;
    const d = hexDist(center.x, center.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}
