import type { ContentRegistry } from "../content/registry";
import type { ItemModifiers } from "../content/items";
import type { EntityView } from "../sim/game/observation";
/** Shared status labels for recipient badges and their tooltips. */
export function modifierText(m: ItemModifiers): string {
  const labels: Partial<Record<keyof ItemModifiers, string>> = {maxHp:"maximum health",maxMana:"maximum mana",damage:"damage",armor:"armor",healthRegenPerSecond:"health/sec",manaRegenPerSecond:"mana/sec",damagePermille:"attack damage",attackSpeedPermille:"attack speed",moveSpeedPermille:"movement speed",cooldownReductionPermille:"ability cooldown reduction",lifestealPermille:"lifesteal"};
  return Object.entries(m).map(([key,value]) => {
    if (typeof value === "boolean") return value ? ({rooted:"Rooted: cannot move",controlImmune:"Immune to roots and stuns",invulnerable:"Invulnerable"}[key] ?? key) : "";
    return `${value >= 0 ? "+" : ""}${key.endsWith("Permille") ? `${value/10}%` : value} ${labels[key as keyof ItemModifiers] ?? key}`;
  }).filter(Boolean).join(" · ");
}
export function itemStatusCard(entity: EntityView | undefined, tick: number, registry: ContentRegistry) {
  if (!entity || entity.remembered) return [];
  const cards = (entity.itemStatuses ?? []).map(s => {
    const d = registry.get(s.item), effect = d.itemEffect!;
    const modifiers = s.kind === "aura" ? effect.aura!.modifiers : s.kind === "rescue" ? {invulnerable:true} : effect.active!.status!.modifiers;
    return {key:`${s.item}:${s.kind}`, icon:d.icon, name:`${d.name}${s.kind === "aura" ? " aura" : ""}`, description:[modifierText(modifiers),s.shield !== undefined ? `${s.shield} shield remaining` : "", s.kind === "aura" ? `While within ${effect.aura!.radius} tiles of the bearer. Identical auras do not stack.` : `${Math.max(0,Math.ceil((s.expires-tick)/40))}s remaining`].filter(Boolean).join(" · ")};
  });
  for (const s of entity.effects ?? []) {
    const spell = registry.rules.spells[s.ability], rank = spell?.ranks[s.rank-1];
    if (rank) cards.push({key:s.ability,icon:spell.icon,name:spell.name,description:`${spell.description} · ${Math.max(0,Math.ceil((s.expires-tick)/40))}s remaining`});
  }
  return cards;
}
