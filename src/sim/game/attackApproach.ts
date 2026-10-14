import {flightHeight} from './locomotion';
import {rankApproachPositions} from './attackPositions';
import { fixed, precise } from './motion';
import type { GameContext } from './context';
import type { Entity, Point } from './state';

/** Choose a firing/striking position, not an occupied target center. */
function planApproach(c: GameContext, actor: Entity, target: Entity): boolean {
  const combat=c.def(actor).behaviors.combat!;
  // The search rectangle encloses body-edge weapon reach. Terrain/body tests
  // below still reject occupied centers and illegal approach positions.
  const range=combat.range+c.spatial.dimensions(actor).radius+(target.unit?c.spatial.dimensions(target).radius:0);
  const origin = precise(actor), center = precise(target);
  const footprint = c.def(target).footprint;
  const rotated = Math.round(target.rotation / 90) % 2 !== 0;
  const halfX = footprint ? (rotated ? footprint.depth : footprint.width) / 2 : 0;
  const halfY = footprint ? (rotated ? footprint.width : footprint.depth) / 2 : 0;
  const reservations = new Set(c.activeUnits()
    .filter(e => e.id !== actor.id && c.spatial.sameLocomotion(e,actor) && e.owner === actor.owner && e.unit!.target === target.id && e.unit!.route.length)
    .map(e => e.unit!.goal));
  // Reuse only terrain-derived geometry. Moving bodies and friendly goals are
  // checked below on every attempt. Bounds include the full body sweep halo.
  const body=c.spatial.dimensions(actor),ranged=!!(combat.projectile||combat.shell);
  const key=JSON.stringify([target.id,target.definition,center.x,center.y,target.surface,target.rotation,
    halfX,halfY,c.spatial.airborne(target),c.spatial.elevation(target),actor.definition,actor.surface,
    c.spatial.airborne(actor),flightHeight(c.def(actor)),body.radius,body.height,range,ranged]);
  let positions=c.spatial.approachPositions.get(key);
  c.profile.count(positions?'Approach geometry hits':'Approach geometry misses');
  if (!positions) {
    c.profile.measure('Approach geometry',()=>{
    const points: {point:Point;clear?:boolean}[] = [];
    for (let y = Math.max(0, Math.ceil(center.y - halfY - range)); y <= Math.min(c.spatial.size - 1, Math.floor(center.y + halfY + range)); y++) {
      for (let x = Math.max(0, Math.ceil(center.x - halfX - range)); x <= Math.min(c.spatial.size - 1, Math.floor(center.x + halfX + range)); x++) {
        const dx = Math.max(0, Math.abs(x - center.x) - halfX);
        const dy = Math.max(0, Math.abs(y - center.y) - halfY);
        if (dx * dx + dy * dy > range * range) continue;
        for(const point of c.spatial.pointsAt(x,y))points.push({point});
      }
    }
    positions = points;
    const halo=body.radius+1;
    c.spatial.approachPositions.set(key,positions,{
      minX:center.x-halfX-range-halo,maxX:center.x+halfX+range+halo,
      minY:center.y-halfY-range-halo,maxY:center.y+halfY+range+halo,
    });
    });
  }
  c.profile.count('Approach range candidates',positions!.length);
  const candidates = c.profile.measure('Approach ranking',()=>
    rankApproachPositions(positions!,origin,point=>reservations.has(c.spatial.cell(point)),c.profile));
  const from=fixed(origin);
  let extent=0;
  for(const {point} of positions!)extent=Math.max(extent,Math.abs(point.x*1000-from.x),Math.abs(point.y*1000-from.y));
  const walkable=c.profile.wrap('Candidate footprint',c.spatial.unitWalkable.bind(c.spatial));
  const attackClear=c.profile.wrap('Candidate attack line',c.spatial.attackClear.bind(c.spatial));
  const free=c.profile.wrap('Candidate occupancy',c.spatial.freeOnWalkable.bind(c.spatial));
  return c.spatial.withLocalUnitClearance(from,extent,actor.id,snapshotClear=>{
  const bodyClear=c.profile.wrap('Moving-body sweep',snapshotClear);
  const detours: Point[] = [];
  // Prefer a clear approach on this side of terrain before searching detours.
  for (const candidate of candidates) {
    c.profile.count('Approach candidates tested');
    const destination=fixed(candidate.point);
    // Once all alternate destinations are collected, this candidate can only
    // win through a direct approach. Reject a blocking body before evaluating
    // its footprint and weapon ray; neither can make that direct path usable.
    // Keep the first eight alternatives in their original ranked order.
    const directClear=detours.length>=8?bodyClear(from,destination):undefined;
    if(directClear===false){c.profile.count('Approach body-blocked candidates skipped');continue;}
    // Lazy validation preserves the relative order of every valid candidate.
    // Do expensive terrain/weapon checks only for positions reached by this
    // search. Validity is static for this cache key; traffic remains live below.
    if(candidate.entry.clear===undefined){
      c.profile.count('Approach candidates validated');
      candidate.entry.clear=walkable(candidate.point,actor)&&
        attackClear({...candidate.point,elevation:c.spatial.elevation(actor,candidate.point)},target,ranged);
    }
    if(!candidate.entry.clear)continue;
    if (!free(candidate.point, actor.id, actor, snapshotClear)) continue;
    // A nearby ally can reject thousands of distant firing positions. Both
    // predicates are required; reject traffic before sweeping the long terrain
    // corridor, without changing candidate order or the chosen route.
    if ((directClear??bodyClear(from,destination)) &&
        c.spatial.clearSegment(from,destination,undefined,actor) &&
        c.spatial.route(actor, candidate.point, false)) return true;
    if (detours.length < 8) detours.push(candidate.point);
  }
  // Bound alternate destination searches. A later retry reconsiders moving bodies.
  for (const point of detours) {
    c.profile.count('Alternate approach routes');
    if (c.spatial.route(actor, point, false)) return true;
  }
  return false;
  });
}

export function routeToAttack(c:GameContext,actor:Entity,target:Entity):boolean {
  return c.profile.measure('Attack approach',()=>{const result=planApproach(c,actor,target);c.profile.count(result?'Approach succeeded':'Approach failed');return result;});
}
