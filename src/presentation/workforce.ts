import type { SettlementView } from "../sim/game/observation";

/** Recruitment reserve after births fill the pool, keeping current assignments. */
export function workforceReserve(population: NonNullable<SettlementView["population"]>) {
  const replenishing = Math.max(0, population.capacity - population.workers);
  return {
    available: population.available,
    replenishing,
    allocation: population.available + replenishing,
  };
}
