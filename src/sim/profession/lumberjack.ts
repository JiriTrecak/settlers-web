/**
 * Lumberjack cycle: rest at the hut door, fell a tree in the work radius,
 * carry the trunk, dump it on the offer stack.
 */
import { hexDist, type GridPos } from "../../shared";
import type { Building } from "../building/building";
import { buildingDef } from "../data/buildings";
import { settlerDef } from "../data/settlers";
import type { Movable } from "../movable/movable";
import { canDeposit } from "../object/object";
import { isWalkable, nearestWalkable, standBeside } from "../path/path";
import type { ProfessionContext } from "./profession";

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
      goDoor(m, hut, ctx);
    }
    return;
  }

  if (!atDoor(m, hut)) {
    goDoor(m, hut, ctx);
    return;
  }
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return;
  }
  if (!canDeposit(ctx.objects, offer, "trunk")) return;

  const tree = nearestTree(hut.pos, def.workRadius, m.pos, ctx);
  if (!tree) return;
  m.assignJob({ type: "chop", at: tree });
}

function restTicks(tickMs: number): number {
  const ms = settlerDef("lumberjack").restMs ?? 0;
  return Math.max(0, Math.round(ms / tickMs));
}

function doorOf(hut: Building): GridPos {
  const d = buildingDef(hut.kind).door;
  return { x: hut.pos.x + d.dx, y: hut.pos.y + d.dy };
}

function atDoor(m: Movable, hut: Building): boolean {
  const d = doorOf(hut);
  return m.pos.x === d.x && m.pos.y === d.y;
}

function goDoor(m: Movable, hut: Building, ctx: ProfessionContext): void {
  const door = doorOf(hut);
  const stand = isWalkable(ctx.grid, door.x, door.y, ctx.blockers)
    ? door
    : nearestWalkable(ctx.grid, door, ctx.blockers);
  if (!stand) return;
  if (m.pos.x === stand.x && m.pos.y === stand.y) return;
  m.pathTo(ctx.grid, stand, ctx.blockers);
}

function nearestTree(center: GridPos, radius: number, from: GridPos, ctx: ProfessionContext): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of ctx.objects.view()) {
    if (obj.kind !== "tree") continue;
    const at = { x: obj.x, y: obj.y };
    const d = hexDist(center.x, center.y, at.x, at.y);
    if (d > radius || d === 0) continue;
    if (!standBeside(ctx.grid, at, from, ctx.blockers)) continue;
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}
