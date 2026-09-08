import { STOCKPILE_LIMIT, type ItemKind, type ItemStock } from "./rules";
export const ITEM_HEIGHT: Record<ItemKind, number> = {
  log: 0.42,
  plank: 0.19,
  stone: 0.58,
};
/** Presentation only: sample real stock fairly, then form separate piles beside the entrance. */
export function stockpileLayout(stock: ItemStock, radius: number) {
  const remaining = { ...stock },
    items: ItemKind[] = [];
  while (items.length < STOCKPILE_LIMIT) {
    let added = false;
    for (const kind of ["log", "plank", "stone"] as const) {
      if (
        !Number.isFinite(remaining[kind]) ||
        remaining[kind] < 1 ||
        items.length >= STOCKPILE_LIMIT
      )
        continue;
      items.push(kind);
      remaining[kind]--;
      added = true;
    }
    if (!added) break;
  }
  const kinds = [...new Set(items)],
    counts = { log: 0, plank: 0, stone: 0 };
  const heights = new Map<string, number>();
  return items.map((kind) => {
    const index = counts[kind]++,
      group = kinds.indexOf(kind),
      side = kinds.length === 1 ? index % 2 : group % 2;
    const local = kinds.length === 1 ? Math.floor(index / 2) : index,
      columns = kind === "stone" ? 2 : 1;
    const x =
      (side === 0 ? -1 : 1) * (radius >= 4 ? 2.15 : 1.5) +
      (columns === 2 ? ((local % 2) - 0.5) * 0.68 : 0);
    const z =
        radius +
        0.15 +
        (Math.floor(local / columns) % 2) * 0.65 +
        (group === 2 ? 1.3 : 0),
      key = `${x},${z}`;
    const y = heights.get(key) ?? 0;
    heights.set(key, y + ITEM_HEIGHT[kind]);
    return { kind, x, y, z };
  });
}
