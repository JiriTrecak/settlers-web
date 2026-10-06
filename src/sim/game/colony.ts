import type {ContentRegistry} from '../../content/registry';
import type {Owner} from '../../content/schema';
import {alive, type Entity} from './state';

/** Standard RTS annihilation: unfinished foundations also preserve a colony.
 * Mission outcomes are handled by their scenario rules, not this predicate. */
export function hasColonyBuildings(entities: readonly Entity[], owner: Owner, registry: ContentRegistry): boolean {
  return entities.some(e => e.owner === owner && alive(e) && registry.get(e.definition).kind === 'building');
}

/** Presentation home survives loss of the starting Hall without mutating the
 * immutable starting-objective bindings used by saves and scenario setup. */
export function colonyHome<T extends Pick<Entity, 'id' | 'definition' | 'owner' | 'hp'> & {construction?: unknown}>(
  entities: readonly T[], owner: Owner, registry: ContentRegistry, preferred?: number,
): T | undefined {
  const rank = (e: T) => {
    const d = registry.get(e.definition);
    return (d.behaviors.production?.outputs.some(id => registry.get(id).behaviors.work) ? 0 : 2) + (e.construction ? 1 : 0);
  };
  return entities.filter(e => e.owner === owner && (e.hp === null || e.hp > 0) && registry.get(e.definition).kind === 'building')
    .sort((a, b) => rank(a) - rank(b) || Number(b.id === preferred) - Number(a.id === preferred) || a.id - b.id)[0];
}
