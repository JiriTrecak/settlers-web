export type Category = "buildings" | "settlers" | "landscape" | "props" | "gui" | "uncatalogued";

export const CATEGORIES: Category[] = ["buildings", "settlers", "landscape", "props", "gui", "uncatalogued"];

export type LayerRef = {
  path: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export type Sprite = {
  id: string;
  category: Category;
  title: string;
  subtitle: string;
  tags: string[];
  group?: string;
  variant?: string;
  frame?: number;
  frames?: number;
  path: string;
  torso?: LayerRef;
  shadow?: LayerRef;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export type Catalog = {
  sprites: Sprite[];
};

export type Race = "roman" | "egyptian" | "asian" | "amazon";

export const RACES: Race[] = ["roman", "egyptian", "asian", "amazon"];

export const DIRS = ["ne", "e", "se", "sw", "w", "nw"] as const;

export type CatalogItem = {
  id: string;
  category: Category;
  title: string;
  subtitle: string;
  tags: string[];
  cover: Sprite;
  sprites: Sprite[];
  folder?: boolean;
};

export type SettlerRef = {
  civ: string;
  profession: string;
  action?: string;
  material?: string;
  dir?: string;
};

function hay(s: Sprite): string {
  return `${s.id} ${s.title} ${s.subtitle} ${s.tags.join(" ")} ${s.path} ${s.group ?? ""} ${s.variant ?? ""}`.toLowerCase();
}

export function matchesQuery(s: Sprite, query: string): boolean {
  const parts = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  const h = hay(s);
  return parts.every((p) => h.includes(p));
}

export function catalogItems(sprites: Sprite[]): CatalogItem[] {
  const map = new Map<string, Sprite[]>();
  for (const s of sprites) {
    const key = s.group ?? s.id;
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  const items: CatalogItem[] = [];
  for (const [id, group] of map) {
    const cover =
      group.find((s) => s.variant === "built") ??
      group.find((s) => (s.frame ?? 0) === 0) ??
      group[0]!;
    items.push({
      id,
      category: cover.category,
      title: cover.title,
      subtitle: cover.subtitle,
      tags: [...new Set(group.flatMap((s) => s.tags))],
      cover,
      sprites: group,
    });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

export function searchItems(items: CatalogItem[], query: string): CatalogItem[] {
  const parts = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return items;
  return items.filter((item) => {
    const h = `${item.id} ${item.title} ${item.subtitle} ${item.tags.join(" ")}`.toLowerCase();
    if (parts.every((p) => h.includes(p))) return true;
    return item.sprites.some((s) => matchesQuery(s, query));
  });
}

function pretty(s: string): string {
  return s.replace(/-/g, " ");
}

export function parseSettlerId(id: string): SettlerRef | null {
  const parts = id.split("/");
  if (parts[0] !== "settlers" || parts.length < 3) return null;
  return {
    civ: parts[1]!,
    profession: parts[2]!,
    action: parts[3],
    material: parts[4],
    dir: parts[5],
  };
}

export function itemCiv(item: CatalogItem): string | null {
  if (item.category === "buildings") {
    const m = /^buildings\/([^/]+)\//.exec(item.id);
    return m?.[1] ?? null;
  }
  if (item.category === "settlers") return parseSettlerId(item.id)?.civ ?? null;
  return null;
}

export function matchesRace(item: CatalogItem, race: Race): boolean {
  const civ = itemCiv(item);
  if (!civ) return true;
  return civ === race || civ === "shared";
}

function dirRank(dir: string | undefined): number {
  const i = DIRS.indexOf(dir as (typeof DIRS)[number]);
  return i < 0 ? 99 : i;
}

function pickCover(items: CatalogItem[]): Sprite {
  const scored = items.flatMap((it) => {
    const p = parseSettlerId(it.id);
    const action = p?.action ?? "";
    const dir = p?.dir ?? it.cover.variant;
    const score =
      (action === "idle" ? 0 : action === "walk" ? 1 : 2) * 10 + dirRank(dir);
    return [{ sprite: it.cover, score }];
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.sprite ?? items[0]!.cover;
}

/** Collapse ne/e/se/sw/w/nw of the same action+material into one card. */
export function collapseSettlerDirections(items: CatalogItem[]): CatalogItem[] {
  const buckets = new Map<string, CatalogItem[]>();
  const rest: CatalogItem[] = [];
  for (const item of items) {
    const p = parseSettlerId(item.id);
    if (item.category !== "settlers" || !p?.action || !p.material) {
      rest.push(item);
      continue;
    }
    const id = `settlers/${p.civ}/${p.profession}/${p.action}/${p.material}`;
    const list = buckets.get(id);
    if (list) list.push(item);
    else buckets.set(id, [item]);
  }
  const collapsed: CatalogItem[] = [];
  for (const [id, clips] of buckets) {
    const p = parseSettlerId(clips[0]!.id)!;
    const sprites = clips
      .flatMap((c) => {
        const dir = parseSettlerId(c.id)?.dir ?? c.cover.variant ?? "";
        return c.sprites.map((s) => ({ ...s, variant: dir }));
      })
      .sort((a, b) => dirRank(a.variant) - dirRank(b.variant) || (a.frame ?? 0) - (b.frame ?? 0));
    const dirs = [...new Set(sprites.map((s) => s.variant).filter(Boolean))];
    collapsed.push({
      id,
      category: "settlers",
      title: p.material === "none" ? pretty(p.action!) : `${pretty(p.action!)} · ${pretty(p.material!)}`,
      subtitle: dirs.length > 1 ? `${dirs.length} dirs` : "",
      tags: [...new Set(clips.flatMap((c) => c.tags))],
      cover: pickCover(clips),
      sprites,
    });
  }
  return [...rest, ...collapsed].sort((a, b) => a.id.localeCompare(b.id));
}

/** One folder card per profession (alchemist, bearer, …). */
export function groupSettlerProfessions(items: CatalogItem[]): CatalogItem[] {
  const buckets = new Map<string, CatalogItem[]>();
  for (const item of items) {
    if (item.category !== "settlers") continue;
    const p = parseSettlerId(item.id);
    if (!p) continue;
    const id = `settlers/${p.civ}/${p.profession}`;
    const list = buckets.get(id);
    if (list) list.push(item);
    else buckets.set(id, [item]);
  }
  const out: CatalogItem[] = [];
  for (const [id, clips] of buckets) {
    const p = parseSettlerId(id)!;
    out.push({
      id,
      category: "settlers",
      title: pretty(p.profession),
      subtitle: `${clips.length} animation${clips.length === 1 ? "" : "s"}`,
      tags: [...new Set(clips.flatMap((c) => c.tags))],
      cover: pickCover(clips),
      sprites: clips.flatMap((c) => c.sprites),
      folder: true,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return out;
}
