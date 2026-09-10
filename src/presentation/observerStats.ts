import { workerPopulation } from "../sim/game/population";
import type { ContentRegistry } from "../content/registry";
import { slotOwner, type Owner } from "../content/schema";
import { alive, type GameState } from "../sim/game/state";
import type { ResourceDelivery } from "../sim/game/economy";
import { entityStats } from "../sim/game/stats";
import type { Slot } from "../shared/match/match";
import { TICK_MS } from "../shared/match/match";

/** Currency declarations own both the available columns and their presentation. */
export const observerResources = (registry: ContentRegistry) =>
  registry.definitions.filter(d => d.currency).map(d => ({
    item: d.id, label: d.name, explanation: d.description,
  }));
const MINUTE_TICKS = 60_000 / TICK_MS;

type IncomeBucket = { tick: number; amounts: Map<Owner, Map<string, number>> };
/** Last minute of gross deliveries, measured in simulation time, independent of FPS and spending. */
export class ObserverIncome {
  private buckets: IncomeBucket[] = [];
  private startTick = 0;
  private lastTick = 0;
  reset(tick = 0) {
    this.buckets = [];
    this.startTick = this.lastTick = tick;
  }
  record(tick: number, receipts: readonly ResourceDelivery[]) {
    if (tick < this.lastTick) this.reset(tick);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    while (this.buckets.length && this.buckets[0].tick <= tick - MINUTE_TICKS)
      this.buckets.shift();
    // Only ticks containing deliveries allocate a bucket; at most one minute is retained.
    for (const receipt of receipts) {
      if (receipt.tick !== tick || receipt.amount <= 0) continue;
      let bucket = this.buckets.at(-1);
      if (bucket?.tick !== tick) {
        bucket = { tick, amounts: new Map() };
        this.buckets.push(bucket);
      }
      let resources = bucket.amounts.get(receipt.owner);
      if (!resources) {
        resources = new Map();
        bucket.amounts.set(receipt.owner, resources);
      }
      resources.set(
        receipt.item,
        (resources.get(receipt.item) ?? 0) + receipt.amount,
      );
    }
  }
  get observedSeconds() {
    return Math.min(
      60,
      (Math.max(0, this.lastTick - this.startTick) * TICK_MS) / 1000,
    );
  }
  perMinute(owner: Owner, item: string) {
    const seconds = this.observedSeconds;
    if (seconds < 1) return 0;
    return Math.round(
      (this.buckets.reduce(
        (sum, b) => sum + (b.amounts.get(owner)?.get(item) ?? 0),
        0,
      ) *
        60) /
        seconds,
    );
  }
}
export type ObserverPlayerStats = {
  player: number;
  name: string;
  controller: string;
  defeated: boolean;
  resources: { item: string; stored: number; perMinute: number }[];
  units: number;
  workers: number;
  availableWorkers: number;
  workerCapacity: number;
  army: number;
  heroes: {
    id: number;
    name: string;
    icon: string;
    level: number;
    status: "alive" | "fallen" | "reviving";
  }[];
};
export type ObserverStats = {
  tick: number;
  incomeSeconds: number;
  players: ObserverPlayerStats[];
};

/** Observer-only projection; it never becomes a player observation or AI input. */
export function observerStats(
  state: GameState,
  slots: readonly Slot[],
  registry: ContentRegistry,
  income: ObserverIncome,
): ObserverStats {
  const rows = new Map<Owner, ObserverPlayerStats>();
  for (const slot of [...slots].sort((a, b) => a.player - b.player))
    rows.set(slotOwner(slot.player), {
      player: slot.player,
      name: slot.name ?? `Player ${slot.player + 1}`,
      controller: slot.kind === "ai" ? "AI" : "Human",
      defeated:
        state.outcome?.defeated.includes(slotOwner(slot.player)) ?? false,
      resources: observerResources(registry).map((r) => ({
        item: r.item,
        stored: 0,
        perMinute: income.perMinute(slotOwner(slot.player), r.item),
      })),
      units: 0,
      workers: 0,
      availableWorkers: workerPopulation(
        state.entities,
        slotOwner(slot.player),
        registry,
      ).available,
      workerCapacity: workerPopulation(
        state.entities,
        slotOwner(slot.player),
        registry,
      ).capacity,
      army: 0,
      heroes: [],
    });
  const reviving = new Set(
    state.entities
      .filter(alive)
      .flatMap((e) => e.revival?.queue.map((q) => q.hero) ?? []),
  );
  for (const entity of state.entities) {
    const row = rows.get(entity.owner);
    if (!row) continue;
    const definition = registry.get(entity.definition),
      living = alive(entity) && !entity.fallen;
    if (living && entity.unit) {
      row.units++;
      if (definition.behaviors.work) row.workers++;
      if (definition.selectionClass === "army") row.army++;
    }
    if (living && !entity.construction && definition.behaviors.storage?.dropoff)
      for (const resource of row.resources)
        resource.stored += entity.inventory[resource.item] ?? 0;
    if (definition.hero && entity.unit && (living || entity.fallen))
      row.heroes.push({
        id: entity.id,
        name: definition.name,
        icon: definition.icon,
        level: entityStats(definition, entity, registry).level,
        status: living
          ? "alive"
          : reviving.has(entity.id)
            ? "reviving"
            : "fallen",
      });
  }
  for (const row of rows.values()) row.heroes.sort((a, b) => a.id - b.id);
  return {
    tick: state.tick,
    incomeSeconds: income.observedSeconds,
    players: [...rows.values()],
  };
}
