import type { ContentRegistry } from "../../content/registry";
import type { Owner } from "../../content/schema";
import { alive, type Entity } from "./state";

/** Derived from authoritative entities/queues. No saved counter can drift from its owners. */
export function colonySupply(entities: readonly Entity[], owner: Owner, registry: ContentRegistry) {
  let used = 0, reserved = 0, provided = 0, training = 0, units = 0, queuedUnits = 0;
  const reviving = new Set<number>();
  for (const e of entities) {
    if (e.owner !== owner || !alive(e) || e.fallen) continue;
    const d = registry.get(e.definition);
    if (e.unit) { used += d.supplyCost ?? 0; units++; }
    if (!e.construction) provided += d.supplyProvided ?? 0;
    // Active training is already represented by its queue entry, never counted twice.
    for (const q of e.production?.queue ?? []) {
      reserved += registry.get(q.definition).supplyCost ?? 0;
      queuedUnits++;
    }
    if (e.production?.active)
      training += registry.get(e.production.active.definition).supplyCost ?? 0;
    for (const q of e.revival?.queue ?? []) {
      reviving.add(q.hero);
      if (q.progress > 0) {
        const hero = entities.find(h => h.id === q.hero && h.owner === owner && h.fallen);
        if (hero) training += registry.get(hero.definition).supplyCost ?? 0;
      }
    }
  }
  for (const e of entities) {
    if (e.owner !== owner || !e.fallen || !reviving.has(e.id)) continue;
    reserved += registry.get(e.definition).supplyCost ?? 0;
    queuedUnits++;
  }
  const capacity = Math.min(provided, registry.rules.maxSupply), committed = used + reserved;
  return { used, reserved, training, committed, capacity, provided, limit: registry.rules.maxSupply,
    available: Math.max(0, capacity - committed), overCapacity: Math.max(0, committed - capacity),
    units, queuedUnits, unitLimit: registry.rules.maxUnits };
}
export type Supply = ReturnType<typeof colonySupply>;

/** Same admission reason for simulation, command cards and AI. */
export function supplyAdmission(supply: Supply, cost: number): string | null {
  if (supply.units + supply.queuedUnits >= supply.unitLimit) return "Unit limit reached";
  if (cost > 0 && supply.committed + cost > supply.capacity)
    return `Not enough supply (${supply.committed}/${supply.capacity}). Build a Mound.`;
  return null;
}

/** Waiting entries compete only with living units and already-started training.
 * Once admitted to training, capacity loss cannot pause or cancel that unit. */
export function supplyStart(supply: Supply, cost: number): string | null {
  if (supply.units >= supply.unitLimit) return "Unit limit reached";
  return cost > 0 && supply.used + supply.training + cost > supply.capacity
    ? "Supply blocked — build a Mound or free supply" : null;
}
