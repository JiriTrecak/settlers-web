import type {Definition} from './schema.ts';

/** Conservative envelope for queries without an actor, never a unit's body.
 * Real movement always supplies its definition. Smaller profiles keep the
 * shared walk-surface graph available; each actor checks its own clearance. */
export function minimumGroundBody(definitions: readonly Definition[]) {
  const bodies=definitions.filter(d=>d.kind==='unit'&&d.behaviors.movement?.locomotion!=='air').map(d=>d.dimensions!);
  return bodies.length ? {
    radius:Math.min(...bodies.map(d=>d.radius)),
    height:Math.min(...bodies.map(d=>d.height)),
    formationSpacing:Math.min(...bodies.map(d=>d.formationSpacing)),
  } : {radius:0,height:0,formationSpacing:0};
}
