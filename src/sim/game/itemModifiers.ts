import {spellModifiers} from '../abilities/statuses';
import type { ContentRegistry } from "../../content/registry";
import type { ItemModifiers } from "../../content/items";
import type { Entity } from "./state";
const NO_MODIFIERS:readonly ItemModifiers[]=Object.freeze([]);
/** Resolve declared modifiers for inventory and public recipient statuses. */
export function statusModifiers(status: NonNullable<Entity["itemStatuses"]>[number], registry: ContentRegistry): ItemModifiers {
  const effect = registry.find(status.item)?.itemEffect;
  if (status.kind === "rescue") return {invulnerable: true};
  return (status.kind === "aura" ? effect?.aura?.modifiers : effect?.active?.status?.modifiers) ?? {};
}
export function itemModifiers(e: Pick<Entity, "equipment" | "itemStatuses" | "spellStatuses">, registry?: ContentRegistry): readonly ItemModifiers[] {
  if (!registry||(!e.spellStatuses?.length&&!e.itemStatuses?.length&&!e.equipment?.some(Boolean))) return NO_MODIFIERS;
  return [...spellModifiers(e,registry),...nonSpellModifiers(e,registry)];
}
export function nonSpellModifiers(e:Pick<Entity,"equipment"|"itemStatuses">,registry:ContentRegistry):readonly ItemModifiers[]{
  if(!e.itemStatuses?.length&&!e.equipment?.some(Boolean))return NO_MODIFIERS;
  const modifiers:ItemModifiers[]=[];
  // Flat equipment stats stack; each named aura is deduplicated by its interpreter.
  for (const id of e.equipment ?? []) {
    const effect = id && registry.find(id)?.itemEffect;
    if (effect && effect.modifiers) modifiers.push(effect.modifiers);
  }
  for (const status of e.itemStatuses ?? []) modifiers.push(statusModifiers(status, registry));
  return modifiers;
}
export function itemFlag(e: Entity, registry: ContentRegistry, flag: "rooted" | "controlImmune" | "invulnerable"): boolean {
  return itemModifiers(e, registry).some(m => m[flag]);
}
