import type { ContentRegistry } from "../../content/registry";
import type { ItemModifiers } from "../../content/items";
import type { Entity } from "./state";
/** Resolve declared modifiers for inventory and public recipient statuses. */
export function statusModifiers(status: NonNullable<Entity["itemStatuses"]>[number], registry: ContentRegistry): ItemModifiers {
  const effect = registry.find(status.item)?.itemEffect;
  if (status.kind === "rescue") return {invulnerable: true};
  return (status.kind === "aura" ? effect?.aura?.modifiers : effect?.active?.status?.modifiers) ?? {};
}
export function itemModifiers(e: Pick<Entity, "equipment" | "itemStatuses">, registry?: ContentRegistry): ItemModifiers[] {
  if (!registry) return [];
  const modifiers: ItemModifiers[] = [];
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
