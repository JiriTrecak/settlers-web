/** Integer PRNG state is persisted with the simulation; presentation never rolls loot. */
export type RandomState = { random: number };
export type LootPool = {
  rolls: number;
  entries: readonly { item: string | null; weight: number }[];
};
export function randomUint32(state: RandomState): number {
  let x = state.random >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.random = x >>> 0;
  return state.random;
}
/** Rejection sampling avoids modulo bias, including pools with a no-drop entry. */
export function randomBelow(state: RandomState, count: number): number {
  if (!Number.isSafeInteger(count) || count <= 0 || count > 0xffffffff)
    throw new Error("Invalid random bound");
  if (!state.random) throw new Error("Random state must be nonzero");
  const limit = Math.floor(0x100000000 / count) * count;
  let value: number;
  do value = randomUint32(state); while (value >= limit);
  return value % count;
}
export function rollLoot(state: RandomState, pool: LootPool): string[] {
  if (!Number.isInteger(pool.rolls) || pool.rolls < 1 || pool.rolls > 16 ||
      !pool.entries.length || pool.entries.some(e => !Number.isInteger(e.weight) || e.weight <= 0))
    throw new Error("Invalid loot pool");
  const total = pool.entries.reduce((sum, entry) => sum + entry.weight, 0);
  const items: string[] = [];
  for (let i = 0; i < pool.rolls; i++) {
    let draw = randomBelow(state, total);
    for (const entry of pool.entries) {
      if (draw < entry.weight) {
        if (entry.item !== null) items.push(entry.item);
        break;
      }
      draw -= entry.weight;
    }
  }
  return items;
}
