/** Training and revival use one FIFO work lane. Their globally unique IDs share
 * the simulation's queue counter, so save/load and cancellation preserve order. */
type Workplace = {
  production?: {queue: readonly {id: number}[]};
  revival?: {queue: readonly {id: number}[]};
};
export function workplaceQueueSize(building: Workplace): number {
  return (building.production?.queue.length ?? 0) + (building.revival?.queue.length ?? 0);
}
export function workplaceHead(building: Workplace): 'production' | 'revival' | undefined {
  const production = building.production?.queue[0]?.id, revival = building.revival?.queue[0]?.id;
  if (production === undefined) return revival === undefined ? undefined : 'revival';
  return revival === undefined || production < revival ? 'production' : 'revival';
}
