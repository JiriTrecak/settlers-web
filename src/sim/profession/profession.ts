/**
 * Profession brains. They assign jobs; `tickJob` still runs the verbs.
 * Workers hide in the hut (`enter`) between cycles — the unit stays, occupancy/render skip it.
 *
 * Outdoor gatherers share `acceptWork` (radius + owned + unclaimed lock tile + walkable stand).
 * Lumberjack locks the resource; stonecutter locks the stand. Pathing is
 * `needsPlayersGround` on the settler def, not a per-profession check.
 * `goDoor` asks `ensurePath` — not a fresh BFS every rest cycle beat.
 */
import { circleContains, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { buildingDef, type BuildingKind } from "../data/buildings";
import { isSoldier, settlerDef } from "../data/settlers";
import type { JobContext } from "../job/job";
import type { Movable } from "../movable/movable";
import type { Rng } from "../rng/rng";
import { isWalkable, nearestWalkable } from "../path/path";
import { tickBricklayer } from "./bricklayer";
import { tickDigger } from "./digger";
import { tickForester } from "./forester";
import { tickLumberjack } from "./lumberjack";
import { tickPioneer } from "./pioneer";
import { tickSawmiller } from "./sawmiller";
import { tickSoldier } from "./soldier";
import { tickStonecutter } from "./stonecutter";

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
  else if (m.type === "stonecutter") tickStonecutter(m, ctx);
  else if (m.type === "pioneer") tickPioneer(m, ctx);
  else if (m.type === "digger") tickDigger(m, ctx);
  else if (m.type === "swordsman") tickSoldier(m, ctx);
}

export function doorOf(hut: Building): GridPos {
  const d = buildingDef(hut.kind).door;
  return { x: hut.pos.x + d.dx, y: hut.pos.y + d.dy };
}

export function atDoor(m: Movable, hut: Building): boolean {
  const d = doorOf(hut);
  return m.pos.x === d.x && m.pos.y === d.y;
}

/** Walk to the door, enter, tick rest. True when the next search/pickup may run. */
export function readyAtHut(m: Movable, hut: Building, ctx: ProfessionContext): boolean {
  if (!atDoor(m, hut)) {
    goDoor(m, hut, ctx);
    return false;
  }
  m.enter();
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return false;
  }
  return true;
}

export function beginRest(m: Movable, tickMs: number): void {
  const ms = settlerDef(m.type).restMs ?? 0;
  m.restLeft = Math.max(0, Math.round(ms / tickMs));
}

/** Which tile `acceptWork` owns and marks. Lumberjack: the tree. Stonecutter: the stand. */
export type WorkLock = "resource" | "stand";

/** Outdoor gatherers / planters. Radius is `def.workRadius` around `hut.work`. */
export function workArea(hut: { kind: BuildingKind; work: GridPos }): { center: GridPos; radius: number } {
  return { center: hut.work, radius: buildingDef(hut.kind).workRadius };
}

/**
 * Outdoor gatherer gate: resource in the work circle, lock tile owned and unclaimed, stand walkable.
 * Callers only name the two tiles and which one is exclusive.
 */
export function acceptWork(
  ctx: ProfessionContext,
  player: number,
  center: GridPos,
  radius: number,
  resource: GridPos,
  stand: GridPos,
  lock: WorkLock = "resource",
): boolean {
  const d0 = resource.x === center.x && resource.y === center.y;
  if (d0 || !circleContains(center.x, center.y, radius, resource.x, resource.y)) return false;
  const at = lock === "stand" ? stand : resource;
  if (ctx.marks.claimed(at.x, at.y)) return false;
  if (!ctx.land.owns(at.x, at.y, player)) return false;
  return isWalkable(ctx.grid, stand.x, stand.y, ctx.blockers);
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
  m.ensurePath(ctx.grid, stand, ctx.blockers);
}

/** Soldiers inside a military hut. Land stamps while this is > 0. */
export function garrisonCount(hut: Building, units: readonly Movable[]): number {
  let n = 0;
  for (const u of units) {
    if (u.workplaceId === hut.id && u.inside && isSoldier(u.type)) n += 1;
  }
  return n;
}
