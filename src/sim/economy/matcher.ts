/**
 * Closest idle bearer to the closest offer, assigned to a request with room.
 * One global matcher — no partitions.
 * Built huts use `requestStacks`; plans use `constructionStacks` (capped at `required`).
 */
import { hexDist, type GridPos } from "../../shared";
import type { Building, BuildingGrid } from "../building/building";
import { buildingDef } from "../data/buildings";
import type { Goods } from "../data/types";
import type { Movable } from "../movable/movable";
import { STACK_SIZE, type ObjectGrid } from "../object/object";
import { stackCount } from "../job/job";

export function tickMatcher(units: readonly Movable[], buildings: BuildingGrid, objects: ObjectGrid): void {
  const jobless = units.filter((m) => m.type === "bearer" && !m.job && !m.walking && m.material === "none");
  if (jobless.length === 0) return;

  const requestKeys = requestTiles(buildings);
  for (const req of requestsOf(buildings, objects)) {
    if (jobless.length === 0) return;
    const inbound = inFlightTo(units, req.at, req.material);
    const room = req.need - stackCount(objects, req.at, req.material) - inbound;
    if (room <= 0) continue;
    const offer = closestOffer(objects, req, requestKeys, units);
    if (!offer) continue;
    const i = closestIndex(jobless, offer);
    const bearer = jobless.splice(i, 1)[0]!;
    bearer.assignJob({ type: "deliver", material: req.material, from: offer, to: req.at });
  }
}

type Slot = { at: GridPos; material: Goods; need: number };

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
      out.push({ at, material: slot.material, need: slot.required ?? STACK_SIZE });
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

function closestOffer(objects: ObjectGrid, req: Slot, requestKeys: Set<string>, units: readonly Movable[]): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of objects.view()) {
    if (obj.kind !== "stack" || obj.material !== req.material) continue;
    const at = { x: obj.x, y: obj.y };
    if (requestKeys.has(`${at.x},${at.y},${req.material}`)) continue;
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

function closestIndex(units: readonly Movable[], at: GridPos): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < units.length; i++) {
    const m = units[i]!;
    const d = hexDist(m.pos.x, m.pos.y, at.x, at.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
