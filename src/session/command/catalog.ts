/**
 * Catalog PNG paths for HUD icons. Reads `catalog.json` only — no Pixi.
 * Dump layout: one `built` frame is `built.png`; several live in `built/00.png`.
 */
const BASE = `${import.meta.env.BASE_URL}graphics/`;

type CatSprite = { path: string; group?: string; variant?: string; frame?: number };

const first = new Map<string, string>();

function keyOf(group: string, variant?: string): string {
  return variant != null ? `${group}:${variant}` : group;
}

export async function loadCatalogPaths(): Promise<void> {
  if (first.size > 0) return;
  try {
    const res = await fetch(`${BASE}catalog.json`);
    if (!res.ok) return;
    const data = (await res.json()) as { sprites?: CatSprite[] };
    ingestCatalogPaths(data.sprites ?? []);
  } catch {
    /* dump missing — callers use fallbacks */
  }
}

/** Fill HUD icon paths from a catalog already fetched for sheets. */
export function ingestCatalogPaths(sprites: readonly CatSprite[]): void {
  first.clear();
  const best = new Map<string, number>();
  for (const s of sprites) {
    if (!s.group || !s.path) continue;
    const key = keyOf(s.group, s.variant);
    const frame = s.frame ?? 0;
    const prev = best.get(key);
    if (prev == null || frame < prev) {
      best.set(key, frame);
      first.set(key, s.path);
    }
  }
}

export function catalogPath(group: string, variant?: string): string | undefined {
  return first.get(keyOf(group, variant));
}

/** First stack frame. Missing dump → `000.png` anyway. */
export function stackIcon(material: string): string {
  const group = `props/stack-${material}`;
  return catalogPath(group) ?? `${group}/000.png`;
}
