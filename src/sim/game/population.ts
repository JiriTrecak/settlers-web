import type { ContentRegistry } from "../../content/registry";
import type { Owner } from "../../content/schema";
import { alive, type Entity, type GameState } from "./state";

/** A shared living-worker pool per colony. Soldiers and fallen heroes do not occupy worker capacity. */
export function workerPopulation(
  entities: readonly Entity[],
  owner: Owner,
  registry: ContentRegistry,
) {
  let workers = 0,
    available = 0,
    capacity = 0;
  for (const e of entities) {
    if (e.owner !== owner || !alive(e)) continue;
    const d = registry.get(e.definition);
    if (!e.construction)
      capacity += d.behaviors.production?.population?.capacity ?? 0;
    if (!e.unit || !d.behaviors.work) continue;
    workers++;
    const u = e.unit;
    if (
      !u.order &&
      !u.orderQueue.length &&
      !u.job &&
      !u.employment &&
      !u.cargo &&
      !u.contained &&
      !u.release &&
      !u.pendingMove
    )
      available++;
  }
  return { workers, available, capacity };
}
/** Current trips and queued gather assignments reserve slots, including a retarget while carrying. */
export function gathererCount(
  state: GameState,
  resource: number,
  except?: number,
  units: readonly Entity[] = state.entities,
) {
  const sources = new Map(
    state.jobs
      .filter((j) => j.type === "harvest")
      .map((j) => [j.worker, j.source]),
  );
  return units.filter(
    (e) =>
      e.id !== except &&
      alive(e) &&
      e.unit &&
      (sources.get(e.id) === resource ||
        (e.unit.order?.type === "gather" && e.unit.order.target === resource)),
  ).length;
}
