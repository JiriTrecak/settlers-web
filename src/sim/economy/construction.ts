/**
 * Plan → haul `constructionStacks` → `building` (scaffold then hut grow) → `built`.
 * Flatten huts also wait until protected heights hit the frozen mean.
 * Diggers / bricklayers are pools filled to each player's cap (bearers walk
 * to blades / hammers). Flatten fills the oldest plan first, then the next;
 * scaffold grabs idle bricklayers.
 * Each 1s swing bumps progress by `1 / (12 × materials)` and pops a pile every 12 swings.
 * Two masons → twice the bumps. Then a jobless bearer occupies (or equips the worker's `tool` first — miner ← pick).
 * Diggers / bricklayers / occupy recruits are the hut's player only.
 */
import { HEX_DELTAS, hexDist, PLAYER_COLORS, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { diggerCount, flattenReady, footprint, needsFlatten, nextFlattenTile } from "../building/flatten";
import { buildingDef } from "../data/buildings";
import { settlerDef, settlers, type SettlerKind } from "../data/settlers";
import type { DirRel, Goods, SettlerDef } from "../data/types";
import type { LandGrid } from "../land/land";
import type { MapGrid } from "../map/mapGrid";
import type { MarkGrid } from "../mark/mark";
import type { Movable } from "../movable/movable";
import { addToStack, canDeposit, type ObjectGrid } from "../object/object";
import { findPath, isWalkable, nearestWalkable, type Blockers } from "../path/path";
import { canConvertTool, BRICKLAYER_TOOL, DIGGER_TOOL, remainingToolSlots, type ToolKind } from "../profession/limit";
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
  land: LandGrid;
  marks: MarkGrid;
  rng: Rng;
  blockers: (ignoreId?: number) => Blockers;
  tickMs: number;
  diggerRatio: (player: number) => number;
  bricklayerRatio: (player: number) => number;
};

type TakeContext = {
  objects: ObjectGrid;
  units: Movable[];
  tickMs: number;
  grid: MapGrid;
};

export function tickConstruction(ctx: ConstructionContext): void {
  convertExcessDiggers(ctx);
  convertExcessBricklayers(ctx);
  fillDiggerPool(ctx);
  fillBricklayerPool(ctx);
  for (const b of ctx.buildings.all()) {
    if (b.state === "plan") {
      if (flattenReadyFor(b, ctx) && goodsReady(b, ctx.objects)) begin(b, ctx);
    }
    if (b.state === "building") recruitBricklayers(b, ctx);
    if (b.state === "built") {
      shooBricklayersFromDoor(b, ctx);
      recruit(b, ctx);
    }
  }
  recruitDiggers(ctx);
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
  if (!needsFlatten(def)) return true;
  return flattenReady(ctx.grid, footprint(def.protected, b.pos), b.flattenHeight);
}

/**
 * Oldest unfinished plan takes the whole pool up to `want`. Later queues wait
 * until that plot is flat — do not drip one shoveler per hut. Idle shovelers
 * (even mid-flock) are fair game; live flatten jobs are not.
 */
function recruitDiggers(ctx: ConstructionContext): void {
  for (let player = 0; player < PLAYER_COLORS.length; player++) {
    const hut = firstFlattenPlan(ctx, player);
    if (!hut) continue;
    const def = buildingDef(hut.kind);
    const tiles = footprint(def.protected, hut.pos);
    const want = diggerCount(tiles.length);
    let have = assignedToHut(ctx.units, hut.id);
    while (have < want) {
      const at = nextFlattenTile(ctx.grid, ctx.marks, tiles, hut.flattenHeight, ctx.rng);
      if (!at) break;
      const digger = closestIdleDigger(ctx, at, player, hut.id, true);
      if (!digger) break;
      digger.workplaceId = hut.id;
      digger.assignJob({ type: "flatten", at, hutId: hut.id });
      have += 1;
    }
  }
}

/** Place order (`id`). Still-sloped plans only — marked-but-busy does not skip to the next hut. */
function firstFlattenPlan(ctx: ConstructionContext, player: number): Building | null {
  for (const b of ctx.buildings.all()) {
    if (b.player !== player || b.state !== "plan") continue;
    const def = buildingDef(b.kind);
    if (!needsFlatten(def)) continue;
    if (flattenReady(ctx.grid, footprint(def.protected, b.pos), b.flattenHeight)) continue;
    return b;
  }
  return null;
}

function assignedToHut(units: readonly Movable[], hutId: number): number {
  let n = 0;
  for (const m of units) {
    if (m.job?.type === "flatten" && m.job.hutId === hutId) n += 1;
  }
  return n;
}

function closestIdleDigger(
  ctx: ConstructionContext,
  at: GridPos,
  player: number,
  hutId: number,
  steal = false,
): Movable | null {
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const m of ctx.units) {
    if (m.player !== player) continue;
    if (m.type !== "digger" || m.job || m.inside) continue;
    if (!steal && m.walking) continue;
    if (!steal && m.workplaceId != null && m.workplaceId !== hutId) {
      const other = ctx.buildings.get(m.workplaceId);
      if (other && other.state === "plan") continue;
    }
    if (steal && !canFlattenWalk(ctx, m, at, hutId)) continue;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Flatten hut + a blocked cell they're standing on (leave a finished scaffold). */
function canFlattenWalk(ctx: ConstructionContext, m: Movable, at: GridPos, hutId: number): boolean {
  const standing = ctx.buildings.blocks(m.pos.x, m.pos.y)
    ? ctx.buildings.at(m.pos.x, m.pos.y)?.id
    : undefined;
  const blockers: Blockers = {
    blocks: (x, y) => {
      const hut = ctx.buildings.at(x, y);
      const onHut = hut != null && (hut.id === hutId || hut.id === standing);
      if (!onHut && ctx.objects.blocks(x, y)) return true;
      if (!onHut && ctx.buildings.blocks(x, y)) return true;
      if (!ctx.land.owns(x, y, m.player)) return true;
      return false;
    },
  };
  return findPath(ctx.grid, m.pos, at, blockers) != null;
}

function closestFreeTool(ctx: ConstructionContext, from: GridPos, player: number, tool: Goods): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const o of ctx.objects.all()) {
    if (o.kind !== "stack" || o.material !== tool || o.capacity < 1) continue;
    if (!ctx.land.owns(o.x, o.y, player)) continue;
    let inbound = 0;
    for (const m of ctx.units) {
      if (m.job?.type === "equip" && m.job.at.x === o.x && m.job.at.y === o.y) inbound += 1;
    }
    if (inbound >= o.capacity) continue;
    const d = hexDist(from.x, from.y, o.x, o.y);
    if (
      d < bestD ||
      (d === bestD && best != null && (o.y < best.y || (o.y === best.y && o.x < best.x)))
    ) {
      bestD = d;
      best = { x: o.x, y: o.y };
    }
  }
  return best;
}

/** Fill to the cap even with no flatten work — match start and Tools → More. */
function fillDiggerPool(ctx: ConstructionContext): void {
  fillToolPool(ctx, "digger", DIGGER_TOOL, ctx.diggerRatio);
}

function fillBricklayerPool(ctx: ConstructionContext): void {
  fillToolPool(ctx, "bricklayer", BRICKLAYER_TOOL, ctx.bricklayerRatio);
}

function fillToolPool(
  ctx: ConstructionContext,
  kind: ToolKind,
  tool: Goods,
  ratioOf: (player: number) => number,
): void {
  for (let player = 0; player < PLAYER_COLORS.length; player++) {
    while (canConvertTool(ctx.units, player, ratioOf(player), kind)) {
      const seed = closestJoblessBearer(ctx.units, { x: 0, y: 0 }, player);
      if (!seed) break;
      const pile = closestFreeTool(ctx, seed.pos, player, tool);
      if (!pile) break;
      const bearer = closestJoblessBearer(ctx.units, pile, player);
      if (!bearer) break;
      bearer.assignJob({ type: "equip", at: pile, tool, become: kind });
    }
  }
}

/** Lowering the ratio drops blades from idle diggers until slots fit. */
function convertExcessDiggers(ctx: ConstructionContext): void {
  convertExcessTool(ctx, "digger", DIGGER_TOOL, ctx.diggerRatio, (at, player) =>
    closestIdleDigger(ctx, at, player, -1),
  );
}

function convertExcessBricklayers(ctx: ConstructionContext): void {
  convertExcessTool(ctx, "bricklayer", BRICKLAYER_TOOL, ctx.bricklayerRatio, (at, player) =>
    closestIdleBricklayer(ctx, at, player, -1),
  );
}

function convertExcessTool(
  ctx: ConstructionContext,
  kind: ToolKind,
  tool: Goods,
  ratioOf: (player: number) => number,
  idleOf: (at: GridPos, player: number) => Movable | null,
): void {
  for (let player = 0; player < PLAYER_COLORS.length; player++) {
    while (remainingToolSlots(ctx.units, player, ratioOf(player), kind) < 0) {
      const idle = idleOf({ x: 0, y: 0 }, player);
      if (!idle) break;
      dropTool(ctx, idle.pos, tool);
      idle.become("bearer", null, ctx.tickMs);
    }
  }
}

function dropTool(ctx: { objects: ObjectGrid; grid: MapGrid }, at: GridPos, tool: Goods): void {
  for (const d of HEX_DELTAS) {
    const p = { x: at.x + d.dx, y: at.y + d.dy };
    if (!ctx.grid.inBounds(p.x, p.y)) continue;
    if (!canDeposit(ctx.objects, p, tool)) continue;
    if (addToStack(ctx.objects, p, tool)) return;
  }
  if (canDeposit(ctx.objects, at, tool)) addToStack(ctx.objects, at, tool);
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
    if (m.type === "digger" && m.workplaceId === b.id) m.workplaceId = null;
    if (m.job?.type === "flatten" && m.job.hutId === b.id) {
      m.idle();
      if (m.type === "digger") m.workplaceId = null;
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
    if (m.type === "bricklayer" && m.workplaceId === b.id) m.workplaceId = null;
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
  while (assignedMasons(ctx.units, b.id) < spots.length) {
    const slot = nextBricklayerSpot(b, ctx, spots);
    if (!slot) break;
    const mason = closestIdleBricklayer(ctx, slot.at, b.player, b.id);
    if (!mason) break;
    mason.workplaceId = b.id;
    mason.assignJob({ type: "build", at: slot.at, hutId: b.id, direction: slot.direction });
  }
}

function assignedMasons(units: readonly Movable[], hutId: number): number {
  const ids = new Set<number>();
  for (const m of units) {
    if (m.job?.type === "build" && m.job.hutId === hutId) ids.add(m.id);
  }
  return ids.size;
}

function nextBricklayerSpot(
  b: Building,
  ctx: ConstructionContext,
  spots: readonly DirRel[],
): { at: GridPos; direction: DirRel["direction"] } | null {
  for (const spot of spots) {
    const seed = { x: b.pos.x + spot.dx, y: b.pos.y + spot.dy };
    if (claimed(ctx.units, b.id, seed)) continue;
    const at = isWalkable(ctx.grid, seed.x, seed.y, ctx.blockers())
      ? seed
      : nearestWalkable(ctx.grid, seed, ctx.blockers());
    if (!at || claimed(ctx.units, b.id, at)) continue;
    return { at, direction: spot.direction };
  }
  return null;
}

function closestIdleBricklayer(ctx: ConstructionContext, at: GridPos, player: number, hutId: number): Movable | null {
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const m of ctx.units) {
    if (m.player !== player) continue;
    if (m.type !== "bricklayer" || m.job || m.walking || m.inside) continue;
    if (m.workplaceId != null && m.workplaceId !== hutId) {
      const other = ctx.buildings.get(m.workplaceId);
      if (other && other.state === "building") continue;
    }
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
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

/** Idle pool masons on the door would block occupy forever (adjacent path ignores occupancy). */
function shooBricklayersFromDoor(b: Building, ctx: ConstructionContext): void {
  const door = doorOf(b);
  for (const m of ctx.units) {
    if (m.player !== b.player || m.type !== "bricklayer") continue;
    if (m.job || m.walking || m.inside) continue;
    if (m.pos.x !== door.x || m.pos.y !== door.y) continue;
    const blockers = ctx.blockers(m.id);
    for (const d of HEX_DELTAS) {
      const p = { x: m.pos.x + d.dx, y: m.pos.y + d.dy };
      if (!isWalkable(ctx.grid, p.x, p.y, blockers)) continue;
      m.goTo(ctx.grid, p, blockers);
      break;
    }
  }
}

function recruit(b: Building, ctx: ConstructionContext): void {
  const worker = buildingDef(b.kind).worker;
  if (!worker || !(worker in settlers)) return;
  if (ctx.units.some((m) => m.workplaceId === b.id)) return;
  if (ctx.units.some((m) => m.job?.type === "occupy" && m.job.hutId === b.id)) return;
  if (ctx.units.some((m) => m.job?.type === "equip" && m.job.hutId === b.id)) return;
  const door = doorOf(b);
  const stand = isWalkable(ctx.grid, door.x, door.y, ctx.blockers())
    ? door
    : nearestWalkable(ctx.grid, door, ctx.blockers());
  if (!stand) return;
  const kind = worker as SettlerKind;
  const tool = (settlerDef(kind) as SettlerDef).tool;
  if (tool) {
    const pile = closestFreeTool(ctx, stand, b.player, tool);
    if (!pile) return;
    const bearer = closestJoblessBearer(ctx.units, pile, b.player);
    if (!bearer) return;
    bearer.assignJob({ type: "equip", at: pile, tool, become: kind, hutId: b.id });
    return;
  }
  const bearer = closestIdleBearer(ctx.units, stand, b.player);
  if (!bearer) return;
  bearer.assignJob({ type: "occupy", at: stand, hutId: b.id, worker: kind });
}

function doorOf(b: Building): GridPos {
  const d = buildingDef(b.kind).door;
  return { x: b.pos.x + d.dx, y: b.pos.y + d.dy };
}

function closestIdleBearer(units: readonly Movable[], at: GridPos, player: number): Movable | null {
  return closestBearer(units, at, player, true);
}

/** Equip may steal a flocking bearer — `assignJob` drops the step. */
function closestJoblessBearer(units: readonly Movable[], at: GridPos, player: number): Movable | null {
  return closestBearer(units, at, player, false);
}

function closestBearer(
  units: readonly Movable[],
  at: GridPos,
  player: number,
  idleOnly: boolean,
): Movable | null {
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const m of units) {
    if (m.player !== player) continue;
    if (m.type !== "bearer" || m.job || m.material !== "none" || m.inside) continue;
    if (idleOnly && m.walking) continue;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
