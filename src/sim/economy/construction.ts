/**
 * Plan → haul `constructionStacks` → `built`. Then a jobless bearer walks to the
 * door and becomes the worker. No flatten, no bricklayer units.
 */
import { hexDist, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { buildingDef } from "../data/buildings";
import { settlers, type SettlerKind } from "../data/settlers";
import { stackCount } from "../job/job";
import type { MapGrid } from "../map/mapGrid";
import type { Movable } from "../movable/movable";
import type { ObjectGrid } from "../object/object";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";

export type ConstructionContext = {
  units: Movable[];
  buildings: BuildingGrid;
  objects: ObjectGrid;
  grid: MapGrid;
  blockers: (ignoreId?: number) => Blockers;
  tickMs: number;
};

export function tickConstruction(ctx: ConstructionContext): void {
  for (const b of ctx.buildings.all()) {
    if (b.state === "plan" && goodsReady(b, ctx.objects)) finish(b, ctx);
    if (b.state === "built") recruit(b, ctx);
  }
}

function goodsReady(b: Building, objects: ObjectGrid): boolean {
  const def = buildingDef(b.kind);
  for (const slot of def.constructionStacks) {
    const at = { x: b.pos.x + slot.dx, y: b.pos.y + slot.dy };
    if (stackCount(objects, at, slot.material) < (slot.required ?? 1)) return false;
  }
  return true;
}

function finish(b: Building, ctx: ConstructionContext): void {
  const def = buildingDef(b.kind);
  for (const slot of def.constructionStacks) {
    ctx.objects.remove(b.pos.x + slot.dx, b.pos.y + slot.dy);
  }
  b.state = "built";
  if ("beds" in def && def.beds) {
    b.produceWait = Math.max(1, Math.round((def.produceMs ?? 2000) / ctx.tickMs));
  }
}

function recruit(b: Building, ctx: ConstructionContext): void {
  const worker = buildingDef(b.kind).worker;
  if (!worker || !(worker in settlers)) return;
  if (ctx.units.some((m) => m.workplaceId === b.id)) return;
  if (ctx.units.some((m) => m.job?.type === "occupy" && m.job.hutId === b.id)) return;
  const door = doorOf(b);
  const stand = isWalkable(ctx.grid, door.x, door.y, ctx.blockers())
    ? door
    : nearestWalkable(ctx.grid, door, ctx.blockers());
  if (!stand) return;
  const bearer = closestIdleBearer(ctx.units, stand);
  if (!bearer) return;
  bearer.assignJob({ type: "occupy", at: stand, hutId: b.id, worker: worker as SettlerKind });
}

function doorOf(b: Building): GridPos {
  const d = buildingDef(b.kind).door;
  return { x: b.pos.x + d.dx, y: b.pos.y + d.dy };
}

function closestIdleBearer(units: readonly Movable[], at: GridPos): Movable | null {
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const m of units) {
    if (m.type !== "bearer" || m.job || m.walking || m.material !== "none" || m.inside) continue;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
