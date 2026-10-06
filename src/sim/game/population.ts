import type { ContentRegistry } from "../../content/registry";
import type { Owner } from "../../content/schema";
import { alive, type Entity, type GameState } from "./state";

/** Employment statistics only; every unit shares the separate colony supply pool. */
export function workerPopulation(
  entities: readonly Entity[],
  owner: Owner,
  registry: ContentRegistry,
) {
  let workers = 0,
    available = 0;
  for (const e of entities) {
    if (e.owner !== owner || !alive(e)) continue;
    const d = registry.get(e.definition);
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
  return { workers, available };
}
/** A committed trip owns the assignment until delivery; pending orders never
 * double-count a carrier at both its old and its next source. */
export function gatherAssignments(state: GameState, units: readonly Entity[]): Map<number, number> {
  const sources = new Map(state.jobs.filter(j => j.type === "harvest").map(j => [j.worker, j.source!]));
  const assignments = new Map<number, number>();
  for (const worker of units) {
    if (!alive(worker) || !worker.unit) continue;
    const order = worker.unit.order, source = sources.get(worker.id) ?? (order?.type === "gather" ? order.target : undefined);
    if (source !== undefined) assignments.set(worker.id, source);
  }
  return assignments;
}
