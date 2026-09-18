import { fixed, precise } from './motion';
import type { GameContext } from './context';
import type { Entity, Point } from './state';

/** Choose a firing/striking position, not an occupied target center. */
export function routeToAttack(c: GameContext, actor: Entity, target: Entity, geometry?: Map<string, readonly Point[]>): boolean {
  const combat=c.def(actor).behaviors.combat!,range=combat.range;
  const origin = precise(actor), center = precise(target);
  const footprint = c.def(target).footprint;
  const rotated = Math.round(target.rotation / 90) % 2 !== 0;
  const halfX = footprint ? (rotated ? footprint.depth : footprint.width) / 2 : 0;
  const halfY = footprint ? (rotated ? footprint.width : footprint.depth) / 2 : 0;
  const reservations = new Set(c.activeUnits()
    .filter(e => e.id !== actor.id && e.owner === actor.owner && e.unit!.target === target.id && e.unit!.route.length)
    .map(e => e.unit!.goal));
  // This cache lasts only one planning pass: terrain and targets cannot move
  // within it. Body occupancy and friendly reservations remain actor-specific.
  const key = `${target.id}:${range}:${!!(combat.projectile || combat.shell)}`;
  let positions = geometry?.get(key);
  if (!positions) {
    const points: Point[] = [];
    for (let y = Math.max(0, Math.ceil(center.y - halfY - range)); y <= Math.min(c.spatial.size - 1, Math.floor(center.y + halfY + range)); y++) {
      for (let x = Math.max(0, Math.ceil(center.x - halfX - range)); x <= Math.min(c.spatial.size - 1, Math.floor(center.x + halfX + range)); x++) {
        for(const point of c.spatial.pointsAt(x,y)){
        const dx = Math.max(0, Math.abs(x - center.x) - halfX);
        const dy = Math.max(0, Math.abs(y - center.y) - halfY);
        if (dx * dx + dy * dy > range * range || !c.spatial.walkable(c.spatial.cell(point))) continue;
        if(!c.spatial.attackClear(point,target,!!(combat.projectile||combat.shell)))continue;
        points.push(point);
        }
      }
    }
    positions = points; geometry?.set(key, positions);
  }
  const candidates = positions.map(point => ({point, score: Math.hypot(point.x - origin.x, point.y - origin.y) + (reservations.has(c.spatial.cell(point)) ? 4 : 0)}));
  candidates.sort((a, b) => a.score - b.score || a.point.y - b.point.y || a.point.x - b.point.x);
  const detours: Point[] = [];
  // Prefer a clear approach on this side of terrain before searching detours.
  for (const candidate of candidates) {
    if (!c.spatial.free(candidate.point, actor.id)) continue;
    if (c.spatial.clearSegment(fixed(origin), fixed(candidate.point)) && c.spatial.route(actor, candidate.point, false)) return true;
    if (detours.length < 8) detours.push(candidate.point);
  }
  // Bound alternate destination searches. A later retry reconsiders moving bodies.
  for (const point of detours) {
    if (c.spatial.route(actor, point, false)) return true;
  }
  return false;
}
