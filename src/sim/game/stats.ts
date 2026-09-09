import type { Definition } from "../../content/schema";
import type { ContentRegistry } from "../../content/registry";
import type { Entity } from "./state";

/** Derived values have one source; definitions stay immutable during leveling. */
export function entityStats(d: Definition, e: Pick<Entity,"progression"|"equipment"|"effects">, registry?:ContentRegistry) {
  const p = d.behaviors.progression;
  const rank = p ? p.thresholds.filter(x => x <= (e.progression?.experience ?? 0)).length - 1 : 0;
  const result = {
    level: p ? rank + 1 : d.level ?? 1,
    maxHp: (d.body?.maxHp ?? 0) + rank * (p?.healthPerLevel ?? 0),
    damage: (d.behaviors.combat?.damage ?? 0) + rank * (p?.damagePerLevel ?? 0),
    armor: (d.body?.armor ?? 0) + rank * (p?.armorPerLevel ?? 0),
  };
  for(const id of e.equipment ?? []) {
    const effect=id && registry?.get(id).itemEffect;
    if(effect && effect.type==="equipment") {
      result.maxHp+=effect.maxHp;result.damage+=effect.damage;result.armor+=effect.armor;
    }
  }
  result.damage+=(e.effects??[]).reduce((n,b)=>n+(registry?.rules.spells[b.ability]?.ranks[b.rank-1].damageBonus??0),0);
  return result;
}
