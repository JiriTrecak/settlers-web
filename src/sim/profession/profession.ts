/**
 * Profession brains. They assign jobs; `tickJob` still runs the verbs.
 * Workers hide in the hut (`enter`) between cycles — the unit stays, occupancy/render skip it.
 */
import type { GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { buildingDef } from "../data/buildings";
import type { JobContext } from "../job/job";
import type { Movable } from "../movable/movable";
import type { Rng } from "../rng/rng";
import { isWalkable, nearestWalkable } from "../path/path";
import { tickBricklayer } from "./bricklayer";
import { tickForester } from "./forester";
import { tickLumberjack } from "./lumberjack";
import { tickSawmiller } from "./sawmiller";

export type ProfessionContext = JobContext & {
  buildings: BuildingGrid;
  tickMs: number;
  units: readonly Movable[];
  rng: Rng;
};

export function tickProfession(m: Movable, ctx: ProfessionContext): void {
  if (m.type === "lumberjack") tickLumberjack(m, ctx);
  else if (m.type === "sawmiller") tickSawmiller(m, ctx);
  else if (m.type === "bricklayer") tickBricklayer(m, ctx);
  else if (m.type === "forester") tickForester(m, ctx);
}

export function doorOf(hut: Building): GridPos {
  const d = buildingDef(hut.kind).door;
  return { x: hut.pos.x + d.dx, y: hut.pos.y + d.dy };
}

export function atDoor(m: Movable, hut: Building): boolean {
  const d = doorOf(hut);
  return m.pos.x === d.x && m.pos.y === d.y;
}

/** Walk to the door, or vanish into the hut if already there. */
export function goHome(m: Movable, hut: Building, ctx: ProfessionContext): void {
  if (atDoor(m, hut)) {
    m.enter();
    return;
  }
  goDoor(m, hut, ctx);
}

export function goDoor(m: Movable, hut: Building, ctx: ProfessionContext): void {
  const door = doorOf(hut);
  const stand = isWalkable(ctx.grid, door.x, door.y, ctx.blockers)
    ? door
    : nearestWalkable(ctx.grid, door, ctx.blockers);
  if (!stand) return;
  if (m.pos.x === stand.x && m.pos.y === stand.y) return;
  m.pathTo(ctx.grid, stand, ctx.blockers);
}
