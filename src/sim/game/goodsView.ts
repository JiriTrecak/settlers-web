import type { ContentRegistry } from "../../content/registry";
import type { Owner } from "../../content/schema";
import type { Entity } from "./state";
export type GoodsSummary = {
  item: string;
  stored: number;
  reserved: number;
  inTransit: number;
  available: number;
};
/** Project only the owning player's aggregate ledger, never enemy inventories. */
export function summarizeGoods(
  entities: readonly Entity[],
  owner: Owner,
  registry: ContentRegistry,
  available: (e: Entity, item: string) => number,
): GoodsSummary[] {
  const owned = entities.filter((e) => e.owner === owner);
  const currencies = new Set(
    registry.definitions.flatMap((d) =>
      d.behaviors.storage?.dropoff ? d.behaviors.storage.accepts : [],
    ),
  );
  return registry.definitions
    .filter((d) => d.kind === "item" && currencies.has(d.id))
    .map((item) => {
      const stored = owned.reduce((n, e) => n + (e.inventory[item.id] ?? 0), 0),
        inTransit = owned.reduce(
          (n, e) =>
            n + (e.unit?.cargo?.item === item.id ? e.unit.cargo.amount : 0),
          0,
        ),
        free = owned.reduce((n, e) => n + available(e, item.id), 0);
      return {
        item: item.id,
        stored,
        inTransit,
        available: free,
        reserved: Math.max(0, stored - free),
      };
    });
}
