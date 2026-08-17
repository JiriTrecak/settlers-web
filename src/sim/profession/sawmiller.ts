/**
 * Sawmiller cycle: rest at the door, take a trunk from the request stack,
 * saw at `workSpot`, dump a plank on the offer.
 */
import { deltaOf, type GridPos } from "../../shared";
import type { Building } from "../building/building";
import { buildingDef } from "../data/buildings";
import { settlerDef } from "../data/settlers";
import type { Movable } from "../movable/movable";
import { canDeposit, STACK_SIZE } from "../object/object";
import { stackCount } from "../job/job";
import { isWalkable, nearestWalkable } from "../path/path";
import type { ProfessionContext } from "./profession";

export function tickSawmiller(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const mill = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!mill || mill.kind !== "sawmill") return;
  const def = buildingDef("sawmill");
  const reqRel = def.requestStacks[0];
  const offRel = def.offerStacks[0];
  const spot = def.workSpot;
  if (!reqRel || !offRel || !spot) return;
  const request = { x: mill.pos.x + reqRel.dx, y: mill.pos.y + reqRel.dy };
  const offer = { x: mill.pos.x + offRel.dx, y: mill.pos.y + offRel.dy };
  const work = { x: mill.pos.x + spot.dx, y: mill.pos.y + spot.dy };

  if (m.material === "plank") {
    if (canDeposit(ctx.objects, offer, "plank")) {
      m.restLeft = restTicks(ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goDoor(m, mill, ctx);
    return;
  }

  if (m.material === "trunk") {
    const d = deltaOf(spot.direction);
    m.face({ x: work.x + d.dx, y: work.y + d.dy });
    m.assignJob({ type: "saw", at: work });
    return;
  }

  if (!atDoor(m, mill)) {
    goDoor(m, mill, ctx);
    return;
  }
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return;
  }
  if (stackCount(ctx.objects, request, "trunk") <= 0) return;
  if (stackCount(ctx.objects, offer, "plank") >= STACK_SIZE) return;
  m.assignJob({ type: "pickup", at: request });
}

function restTicks(tickMs: number): number {
  return Math.max(0, Math.round((settlerDef("sawmiller").restMs ?? 0) / tickMs));
}

function doorOf(hut: Building): GridPos {
  const d = buildingDef("sawmill").door;
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
