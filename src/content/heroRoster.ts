import type {ContentRegistry} from './registry';
import type {Definition, Owner} from './schema';

type RosterEntity = {
  id: number; definition: string; owner: Owner; hp: number | null;
  construction?: unknown; remembered?: boolean; summoned?: unknown;
  production?: {queue: readonly {definition: string}[]};
};
/** Alive, fallen and paid recruits all reserve a distinct roster entry. Summons
 * and remembered enemies are not colony heroes. Call on authoritative entities
 * or the owner's view plus fallenHeroes; duplicate observation IDs are harmless. */
export function heroRoster(entities: readonly RosterEntity[], owner: Owner, registry: ContentRegistry) {
  let capacity = 0;
  const definitions = new Set<string>(), seen = new Set<number>();
  for (const e of entities) {
    if (e.owner !== owner || e.remembered || seen.has(e.id)) continue;
    seen.add(e.id);
    const d = registry.get(e.definition);
    if (d.hero && !e.summoned) definitions.add(d.id);
    if (e.hp !== null && e.hp <= 0) continue;
    if (!e.construction) capacity = Math.max(capacity, d.heroCapacity ?? 0);
    for (const q of e.production?.queue ?? []) if (registry.get(q.definition).hero) definitions.add(q.definition);
  }
  return {capacity, definitions, used: definitions.size};
}
export function heroAdmission(definition: Pick<Definition, 'id' | 'hero'>, roster: ReturnType<typeof heroRoster>): string | undefined {
  if (!definition.hero) return undefined;
  if (roster.definitions.has(definition.id)) return 'This hero already belongs to your roster. Revive fallen heroes.';
  return roster.used >= roster.capacity ? `Hero roster full (${roster.used}/${roster.capacity}). Upgrade a Hall.` : undefined;
}
