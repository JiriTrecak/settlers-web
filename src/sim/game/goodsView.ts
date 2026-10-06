import {revivalTerms} from '../../content/revival';
import type { ContentRegistry } from "../../content/registry";
import type { Owner, Stock } from "../../content/schema";
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
  wallet: Stock = {},
): GoodsSummary[] {
  const owned = entities.filter((e) => e.owner === owner);
  const currencies = new Set(
    registry.definitions.flatMap((d) =>
      d.behaviors.storage?.dropoff ? d.behaviors.storage.accepts : [],
    ),
  );
  return registry.definitions
    .filter((d) => d.kind === "item" && currencies.has(d.id))
    .sort((a, b) => (a.displayOrder ?? 1000) - (b.displayOrder ?? 1000))
    .map((item) => {
      const funds = wallet[item.id] ?? 0,
        stored = owned.reduce((n, e) => {
          const tasks = [
            ...(e.upgrade ? registry.get(e.definition).upgrade!.items : []),
            ...(e.research?.queue.flatMap(q => registry.rules.research[q.id].items) ?? []),
            ...(e.revival?.queue.flatMap(q=>revivalTerms(registry.get(e.definition).behaviors.revival!,q.level).items) ?? []),
          ];
          return n + (e.inventory[item.id] ?? 0) + tasks.reduce((sum, p) => sum + (p.item === item.id ? p.amount : 0), 0);
        }, funds),
        inTransit = owned.reduce(
          (n, e) =>
            n + (e.unit?.cargo?.item === item.id ? e.unit.cargo.amount : 0),
          0,
        ),
        free = owned.reduce((n, e) => n + available(e, item.id), funds);
      return {
        item: item.id,
        stored,
        inTransit,
        available: free,
        reserved: Math.max(0, stored - free),
      };
    });
}
