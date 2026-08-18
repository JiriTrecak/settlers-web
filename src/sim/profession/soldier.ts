/**
 * Swordsman brain. Aggro disk 30; melee is `tickJob` `attack`.
 * Empty towers pull idle infantry (land only stamps while garrisoned).
 * Forced walk (shift-RMB) skips both until the current path ends.
 */
import { hexDist } from "../../shared";
import { buildingDef } from "../data/buildings";
import { isAttackable, settlerDef } from "../data/settlers";
import type { SettlerDef } from "../data/types";
import type { Building } from "../building/building";
import { isWalkable, nearestWalkable } from "../path/path";
import type { Movable } from "../movable/movable";
import { doorOf, garrisonCount, type ProfessionContext } from "./profession";

export function tickSoldier(m: Movable, ctx: ProfessionContext): void {
  if (m.inside) return;
  if (m.forcedUntil) {
    if (m.walking) return;
    m.forcedUntil = null;
  }
  if (m.job?.type === "attack" || m.job?.type === "occupy") return;
  const enemy = closestEnemy(m, ctx);
  if (enemy) {
    m.assignJob({ type: "attack", targetId: enemy.id });
    return;
  }
  const hut = emptyTower(m, ctx);
  if (!hut) return;
  const door = doorOf(hut);
  const stand = isWalkable(ctx.grid, door.x, door.y, ctx.blockers)
    ? door
    : nearestWalkable(ctx.grid, door, ctx.blockers);
  if (!stand) return;
  m.assignJob({ type: "occupy", at: stand, hutId: hut.id, worker: "swordsman" });
}

function closestEnemy(m: Movable, ctx: ProfessionContext): Movable | null {
  const def: SettlerDef = settlerDef(m.type);
  const radius = def.searchRadius ?? 30;
  let best: Movable | null = null;
  let bestD = Infinity;
  for (const u of ctx.units) {
    if (u.id === m.id || u.player === m.player || u.inside) continue;
    if (u.health <= 0 || !isAttackable(u.type)) continue;
    const d = hexDist(m.pos.x, m.pos.y, u.pos.x, u.pos.y);
    if (d < 1 || d > radius) continue;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function emptyTower(m: Movable, ctx: ProfessionContext): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const hut of ctx.buildings.all()) {
    if (hut.player !== m.player || hut.state !== "built") continue;
    const def = buildingDef(hut.kind);
    const cap = "garrison" in def ? (def.garrison ?? 0) : 0;
    if (cap < 1) continue;
    if (garrisonCount(hut, ctx.units) >= cap) continue;
    if (ctx.units.some((u) => u.job?.type === "occupy" && u.job.hutId === hut.id)) continue;
    const d = hexDist(m.pos.x, m.pos.y, hut.pos.x, hut.pos.y);
    if (d < bestD) {
      bestD = d;
      best = hut;
    }
  }
  return best;
}
