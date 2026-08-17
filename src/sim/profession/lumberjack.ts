/**
 * Lumberjack cycle: rest inside the hut, stand SE of a tree facing nw, fell it,
 * carry the trunk, dump it on the offer stack.
 */
import { hexDist, type GridPos } from "../../shared";
import { buildingDef } from "../data/buildings";
import { settlerDef } from "../data/settlers";
import type { Movable } from "../movable/movable";
import { canDeposit } from "../object/object";
import { chopStand } from "../object/tree";
import { isWalkable } from "../path/path";
import { atDoor, goDoor, goHome, type ProfessionContext } from "./profession";

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
      m.restLeft = restTicks(ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else {
      goHome(m, hut, ctx);
    }
    return;
  }

  if (!atDoor(m, hut)) {
    goDoor(m, hut, ctx);
    return;
  }
  m.enter();
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return;
  }
  if (!canDeposit(ctx.objects, offer, "trunk")) return;

  const tree = nearestTree(hut.pos, def.workRadius, ctx);
  if (!tree) return;
  m.assignJob({ type: "chop", at: tree });
}

function restTicks(tickMs: number): number {
  const ms = settlerDef("lumberjack").restMs ?? 0;
  return Math.max(0, Math.round(ms / tickMs));
}

function nearestTree(center: GridPos, radius: number, ctx: ProfessionContext): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of ctx.objects.view()) {
    if (obj.kind !== "tree") continue;
    const at = { x: obj.x, y: obj.y };
    const d = hexDist(center.x, center.y, at.x, at.y);
    if (d > radius || d === 0) continue;
    if ((obj.stateProgress ?? 1) < 1) continue;
    if (chopClaimed(at, ctx.units)) continue;
    const stand = chopStand(at);
    if (!isWalkable(ctx.grid, stand.x, stand.y, ctx.blockers)) continue;
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

function chopClaimed(at: GridPos, units: readonly Movable[]): boolean {
  for (const u of units) {
    if (u.job?.type === "chop" && u.job.at.x === at.x && u.job.at.y === at.y) return true;
  }
  return false;
}
