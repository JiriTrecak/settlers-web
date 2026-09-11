import type { ContentRegistry } from '../content/registry';
import type { EntityView } from '../sim/game/observation';

/** Existing content traits define focus order, independently of spawn/entity IDs. */
function priority(definition: string, registry: ContentRegistry): number {
  const d = registry.get(definition);
  if (d.hero) return 3;
  if (d.selectionClass === 'army') return 2;
  if (d.selectionClass === 'worker' || d.behaviors.work) return 1;
  return 0;
}

/** Stable within each class so worker assignment order and building focus survive.
 * An intentional portrait click or Tab focus may override the default primary. */
export function prioritizeSelection(ids: readonly number[], entities: readonly EntityView[], registry: ContentRegistry, focus?: number): number[] {
  const byId = new Map(entities.map(e => [e.id, e]));
  const rank = (id: number) => {
    const e = byId.get(id);
    return e ? priority(e.definition, registry) : 0;
  };
  return [...new Set(ids)].sort((a, b) =>
    Number(b === focus) - Number(a === focus) || rank(b) - rank(a));
}

/** Tab follows the same class order, with a stable order between unit types. */
export function cycleSelection(ids: readonly number[], entities: readonly EntityView[], registry: ContentRegistry, backwards = false): number | undefined {
  const byId = new Map(entities.map(e => [e.id, e]));
  const types = [...new Set(ids.map(id => byId.get(id)?.definition).filter((d): d is string => !!d))]
    .sort((a, b) => priority(b, registry) - priority(a, registry) || (a < b ? -1 : a > b ? 1 : 0));
  if (types.length < 2) return undefined;
  const current = byId.get(ids[0])?.definition;
  const at = current ? types.indexOf(current) : -1;
  const next = types[(at + (backwards ? types.length - 1 : 1)) % types.length];
  return ids.find(id => byId.get(id)?.definition === next);
}
