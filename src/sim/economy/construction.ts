/**
 * Plan → haul `constructionStacks` → `building` (scaffold then hut grow) → `built`.
 * Flatten defs also wait until protected heights hit the frozen mean.
 * Each 1s swing bumps progress by `1 / (12 × materials)` and pops a pile every 12 swings.
 * Two bricklayers → twice the bumps. Then a jobless bearer occupies.
 * Diggers / bricklayers / occupy recruits are the hut's player only.
 */
import { hexDist, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { diggerCount, flattenReady, footprint, nextFlattenTile } from "../building/flatten";
import { buildingDef } from "../data/buildings";
import { settlers, type SettlerKind } from "../data/settlers";
import type { MapGrid } from "../map/mapGrid";
import type { MarkGrid } from "../mark/mark";
import type { Movable } from "../movable/movable";
import type { ObjectGrid } from "../object/object";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";
import type { Rng } from "../rng/rng";

/** S3 default: two bricklayers even if the def lists more spots. */
export const BRICKLAYERS_MAX = 2;

/** Hammer swings charged against one plank/stone before the pile loses an item. */
export const BRICKLAYER_ACTIONS_PER_MATERIAL = 12;

export type ConstructionContext = {
  units: Movable[];
  buildings: BuildingGrid;
  objects: ObjectGrid;
  grid: MapGrid;
  marks: MarkGrid;
  rng: Rng;
  blockers: (ignoreId?: number) => Blockers;
  tickMs: number;
};

type TakeContext = {
  objects: ObjectGrid;
  units: Movable[];
  tickMs: number;
};

export function tickConstruction(ctx: ConstructionContext): void {
  for (const b of ctx.buildings.all()) {
    if (b.state === "plan") {
      if (!flattenReadyFor(b, ctx)) recruitDiggers(b, ctx);
      else if (goodsReady(b, ctx.objects)) begin(b, ctx);
    }
    if (b.state === "building") recruitBricklayers(b, ctx);
    if (b.state === "built") recruit(b, ctx);
  }
}

/**
 * Start of a hammer swing. Bump progress, maybe pop a pile. `false` means stop — hut finished or waiting.
 */
export function tryTakeMaterial(b: Building, ctx: TakeContext): boolean {
  if (b.state !== "building") return false;
  const n = Math.max(1, constructionMaterials(b));
  b.remainingMaterialActions -= 1;
  b.constructionProgress += 1 / (BRICKLAYER_ACTIONS_PER_MATERIAL * n);
  if (b.remainingMaterialActions > 0) return true;
  if (popConstructionItem(b, ctx.objects)) {
    b.remainingMaterialActions = BRICKLAYER_ACTIONS_PER_MATERIAL;
    return true;
  }
  finish(b, ctx);
  return false;
}

function flattenReadyFor(b: Building, ctx: ConstructionContext): boolean {
  const def = buildingDef(b.kind);
  if (!("flatten" in def) || !def.flatten) return true;
  return flattenReady(ctx.grid, footprint(def.protected, b.pos), b.flattenHeight);
}

function recruitDiggers(b: Building, ctx: ConstructionContext): void {
  const def = buildingDef(b.kind);
  if (!("flatten" in def) || !def.flatten) return;
  const tiles = footprint(def.protected, b.pos);
  const want = diggerCount(tiles.length);
  let have = 0;
  for (const m of ctx.units) {
    if (m.type === "digger" && m.workplaceId === b.id) have += 1;
    else if (m.job?.type === "flatten" && m.job.hutId === b.id) have += 1;
  }
  while (have < want) {
    const at = nextFlattenTile(ctx.grid, ctx.marks, tiles, b.flattenHeight, ctx.rng);
    if (!at) return;
    const bearer = closestIdleBearer(ctx.units, at, b.player);
    if (!bearer) return;
    bearer.assignJob({ type: "flatten", at, hutId: b.id });
    have += 1;
  }
}

function goodsReady(b: Building, objects: ObjectGrid): boolean {
  const def = buildingDef(b.kind);
  for (const slot of def.constructionStacks) {
    const at = { x: b.pos.x + slot.dx, y: b.pos.y + slot.dy };
    if (stackAt(objects, at, slot.material) < (slot.required ?? 1)) return false;
  }
  return true;
}

function begin(b: Building, ctx: ConstructionContext): void {
  for (const m of ctx.units) {
    if (m.type === "digger" && m.workplaceId === b.id) m.become("bearer", null, ctx.tickMs);
    if (m.job?.type === "flatten" && m.job.hutId === b.id) {
      m.idle();
      if (m.type === "digger") m.become("bearer", null, ctx.tickMs);
    }
  }
  b.state = "building";
  b.constructionProgress = 0;
  b.remainingMaterialActions = 0;
}

function finish(b: Building, ctx: TakeContext): void {
  const def = buildingDef(b.kind);
  for (const slot of def.constructionStacks) {
    ctx.objects.remove(b.pos.x + slot.dx, b.pos.y + slot.dy);
  }
  for (const m of ctx.units) {
    if (m.job?.type === "build" && m.job.hutId === b.id) m.idle();
    if (m.type === "bricklayer" && m.workplaceId === b.id) m.become("bearer", null, ctx.tickMs);
  }
  b.state = "built";
  b.constructionProgress = 1;
  b.remainingMaterialActions = 0;
  if ("beds" in def && def.beds) {
    b.produceWait = Math.max(1, Math.round((def.produceMs ?? 2000) / ctx.tickMs));
  }
}

function constructionMaterials(b: Building): number {
  let n = 0;
  for (const slot of buildingDef(b.kind).constructionStacks) n += slot.required ?? 1;
  return n;
}

function popConstructionItem(b: Building, objects: ObjectGrid): boolean {
  for (const slot of buildingDef(b.kind).constructionStacks) {
    const at = { x: b.pos.x + slot.dx, y: b.pos.y + slot.dy };
    const cur = objects.get(at.x, at.y);
    if (!cur || cur.kind !== "stack" || cur.material !== slot.material || cur.capacity <= 0) continue;
    if (cur.capacity <= 1) objects.remove(at.x, at.y);
    else cur.capacity -= 1;
    return true;
  }
  return false;
}

function stackAt(objects: ObjectGrid, at: GridPos, material: string): number {
  const cur = objects.get(at.x, at.y);
  if (!cur || cur.kind !== "stack" || cur.material !== material) return 0;
  return cur.capacity;
}

function recruitBricklayers(b: Building, ctx: ConstructionContext): void {
  const spots = buildingDef(b.kind).bricklayers.slice(0, BRICKLAYERS_MAX);
  for (const spot of spots) {
    const seed = { x: b.pos.x + spot.dx, y: b.pos.y + spot.dy };
    if (claimed(ctx.units, b.id, seed)) continue;
    const at = isWalkable(ctx.grid, seed.x, seed.y, ctx.blockers())
      ? seed
      : nearestWalkable(ctx.grid, seed, ctx.blockers());
    if (!at || claimed(ctx.units, b.id, at)) continue;
    const bearer = closestIdleBearer(ctx.units, at, b.player);
    if (!bearer) return;
    bearer.assignJob({ type: "build", at, hutId: b.id, direction: spot.direction });
  }
}

function claimed(units: readonly Movable[], hutId: number, at: GridPos): boolean {
  for (const m of units) {
    if (m.job?.type === "build" && m.job.hutId === hutId && m.job.at.x === at.x && m.job.at.y === at.y) {
      return true;
    }
    if (m.type === "bricklayer" && m.workplaceId === hutId && m.pos.x === at.x && m.pos.y === at.y) {
      return true;
    }
  }
  return false;
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
  const bearer = closestIdleBearer(ctx.units, stand, b.player);
  if (!bearer) return;
  bearer.assignJob({ type: "occupy", at: stand, hutId: b.id, worker: worker as SettlerKind });
}

function doorOf(b: Building): GridPos {
  const d = buildingDef(b.kind).door;
  return { x: b.pos.x + d.dx, y: b.pos.y + d.dy };
}

function closestIdleBearer(units: readonly Movable[], at: GridPos, player: number): Movable | null {
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const m of units) {
    if (m.player !== player) continue;
    if (m.type !== "bearer" || m.job || m.walking || m.material !== "none" || m.inside) continue;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
