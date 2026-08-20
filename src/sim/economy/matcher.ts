/**
 * Closest idle bearer of player P to the closest offer P may take.
 * Requests come from P's huts. Offers are stacks on P's land, or on P's hut
 * offer tiles (so no-land test maps still work). No partitions, no priorities.
 * Built huts use `requestStacks`; plans use `constructionStacks` (capped at `required`).
 * Construction piles on a plan *or* scaffold are never offers — bearers cannot
 * pull boards/stone off a hut in progress.
 */
import { hexDist, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { buildingDef } from "../data/buildings";
import type { Goods } from "../data/types";
import type { LandGrid } from "../land/land";
import type { Movable } from "../movable/movable";
import { addToStack, STACK_SIZE, type ObjectGrid } from "../object/object";
import { stackCount } from "../job/job";

export function tickMatcher(
  units: readonly Movable[],
  buildings: BuildingGrid,
  objects: ObjectGrid,
  land: LandGrid,
): void {
  const reserved = constructionTiles(buildings);
  returnStolen(units, objects, reserved);
  const jobless = units.filter((m) => m.type === "bearer" && !m.job && !m.walking && m.material === "none");
  if (jobless.length === 0) return;

  const requestKeys = requestTiles(buildings);
  const offerHut = offerHutPlayer(buildings);
  for (const req of requestsOf(buildings, objects)) {
    if (jobless.length === 0) return;
    const inbound = inFlightTo(units, req.at, req.material);
    const room = req.need - stackCount(objects, req.at, req.material) - inbound;
    if (room <= 0) continue;
    const offer = closestOffer(objects, req, requestKeys, reserved, offerHut, land, units);
    if (!offer) continue;
    const i = closestIndex(jobless, offer, req.player);
    if (i < 0) continue;
    const bearer = jobless.splice(i, 1)[0]!;
    bearer.assignJob({ type: "deliver", material: req.material, from: offer, to: req.at });
  }
}

type Slot = { at: GridPos; material: Goods; need: number; player: number };

/** Plan + scaffold construction tiles. Never an offer, even after the hut leaves `plan`. */
function constructionTiles(buildings: BuildingGrid): Set<string> {
  const keys = new Set<string>();
  for (const b of buildings.all()) {
    if (b.state === "built") continue;
    for (const slot of buildingDef(b.kind).constructionStacks) {
      keys.add(`${b.pos.x + slot.dx},${b.pos.y + slot.dy}`);
    }
  }
  return keys;
}

/** Put a stolen board back and drop the job. In-flight hauls from a scaffold must not finish. */
function returnStolen(units: readonly Movable[], objects: ObjectGrid, reserved: Set<string>): void {
  for (const m of units) {
    if (m.job?.type !== "deliver") continue;
    const from = m.job.from;
    if (!reserved.has(`${from.x},${from.y}`)) continue;
    if (m.material !== "none" && m.material !== "tree") {
      addToStack(objects, from, m.material);
      m.material = "none";
    }
    m.idle();
  }
}

function requestSlots(b: Building): { dx: number; dy: number; material: Goods; required?: number }[] {
  const def = buildingDef(b.kind);
  if (b.state === "plan") return [...def.constructionStacks];
  if (b.state === "built") return [...def.requestStacks];
  return [];
}

function requestsOf(buildings: BuildingGrid, objects: ObjectGrid): Slot[] {
  const out: Slot[] = [];
  for (const b of buildings.all()) {
    for (const slot of requestSlots(b)) {
      const at = { x: b.pos.x + slot.dx, y: b.pos.y + slot.dy };
      const cur = objects.get(at.x, at.y);
      if (cur && (cur.kind !== "stack" || cur.material !== slot.material)) continue;
      out.push({ at, material: slot.material, need: slot.required ?? STACK_SIZE, player: b.player });
    }
  }
  return out;
}

function requestTiles(buildings: BuildingGrid): Set<string> {
  const keys = new Set<string>();
  for (const b of buildings.all()) {
    for (const slot of requestSlots(b)) {
      keys.add(`${b.pos.x + slot.dx},${b.pos.y + slot.dy},${slot.material}`);
    }
  }
  return keys;
}

/** Offer-stack tiles keyed by the hut that owns them. Free-standing piles are not in this map. */
function offerHutPlayer(buildings: BuildingGrid): Map<string, number> {
  const at = new Map<string, number>();
  for (const b of buildings.all()) {
    for (const slot of buildingDef(b.kind).offerStacks) {
      at.set(`${b.pos.x + slot.dx},${b.pos.y + slot.dy}`, b.player);
    }
  }
  return at;
}

/**
 * A pile is P's if it sits on P's hut offer tile, else if `land.owns` (unowned
 * test maps return true for every player). Request tiles are already skipped.
 */
function offeredTo(at: GridPos, player: number, offerHut: Map<string, number>, land: LandGrid): boolean {
  const hut = offerHut.get(`${at.x},${at.y}`);
  if (hut != null) return hut === player;
  return land.owns(at.x, at.y, player);
}

function closestOffer(
  objects: ObjectGrid,
  req: Slot,
  requestKeys: Set<string>,
  reserved: Set<string>,
  offerHut: Map<string, number>,
  land: LandGrid,
  units: readonly Movable[],
): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of objects.view()) {
    if (obj.kind !== "stack" || obj.material !== req.material) continue;
    const at = { x: obj.x, y: obj.y };
    if (reserved.has(`${at.x},${at.y}`)) continue;
    if (requestKeys.has(`${at.x},${at.y},${req.material}`)) continue;
    if (!offeredTo(at, req.player, offerHut, land)) continue;
    const avail = obj.capacity - inFlightFrom(units, at, req.material);
    if (avail <= 0) continue;
    const d = hexDist(req.at.x, req.at.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

function inFlightFrom(units: readonly Movable[], at: GridPos, material: Goods): number {
  let n = 0;
  for (const m of units) {
    if (m.job?.type !== "deliver") continue;
    if (m.material !== "none") continue;
    if (m.job.material !== material) continue;
    if (m.job.from.x === at.x && m.job.from.y === at.y) n += 1;
  }
  return n;
}

function inFlightTo(units: readonly Movable[], at: GridPos, material: Goods): number {
  let n = 0;
  for (const m of units) {
    if (m.job?.type !== "deliver") continue;
    if (m.job.material !== material) continue;
    if (m.job.to.x === at.x && m.job.to.y === at.y) n += 1;
  }
  return n;
}

function closestIndex(units: readonly Movable[], at: GridPos, player: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < units.length; i++) {
    const m = units[i]!;
    if (m.player !== player) continue;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
