import { content } from "../../content/builtin";
import type { ContentRegistry } from "../../content/registry";
import type { Stock } from "../../content/schema";
/** Visual sampling only. Physical storage is independent of this sixteen-model cap. */
export function stockpileLayout(
  stock: Stock,
  radius: number,
  registry: ContentRegistry = content,
) {
  const remaining = { ...stock },
    items: string[] = [];
  const kinds = Object.keys(stock)
    .filter((id) => registry.find(id)?.kind === "item")
    .sort();
  while (items.length < 16) {
    let added = false;
    for (const id of kinds)
      if (remaining[id] > 0 && items.length < 16) {
        items.push(id);
        remaining[id]--;
        added = true;
      }
    if (!added) break;
  }
  const shown = [...new Set(items)],
    counts: Record<string, number> = {},
    heights = new Map<string, number>();
  return items.map((kind) => {
    const index = counts[kind] ?? 0;
    counts[kind] = index + 1;
    const group = shown.indexOf(kind),
      asset = registry.asset(registry.get(kind).asset),
      side = shown.length === 1 ? index % 2 : group % 2;
    const local = shown.length === 1 ? Math.floor(index / 2) : index,
      columns = asset.stackColumns ?? 1;
    const x =
        (side === 0 ? -1 : 1) * (radius >= 4 ? 2.15 : 1.5) +
        (columns === 2 ? ((local % 2) - 0.5) * 0.68 : 0),
      z =
        radius +
        0.15 +
        (Math.floor(local / columns) % 2) * 0.65 +
        Math.floor(group / 2) * 1.3,
      key = `${x},${z}`,
      y = heights.get(key) ?? 0;
    heights.set(key, y + (asset.stackHeight ?? 0.3));
    return { kind, x, y, z };
  });
}
