import type { ContentRegistry } from '../content/registry';
import type { Owner } from '../content/schema';
import type { SettlementView } from '../sim/game/observation';

/** Local hero shortcuts come from declared hero flags and observed ownership. */
export function heroShortcuts(view: SettlementView, owner: Owner, registry: ContentRegistry) {
  if (owner === 'none') return [];
  return [...view.entities, ...(view.fallenHeroes ?? [])]
    .filter(e => e.owner === owner && registry.get(e.definition).hero)
    .sort((a, b) => a.id - b.id)
    .map(e => {
      const definition = registry.get(e.definition);
      const available = (e.hp ?? 0) > 0 && !e.unit?.contained && definition.selectable !== false;
      return {
        id: e.id,
        name: definition.name,
        icon: definition.icon,
        hp: e.hp ?? 0,
        maxHp: e.stats?.maxHp ?? definition.body?.maxHp ?? 1,
        available,
      };
    });
}
export type HeroShortcut = ReturnType<typeof heroShortcuts>[number];
