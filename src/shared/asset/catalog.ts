/**
 * Asset catalogue file. JSON; `v` is the schema. `file` is relative to the catalogue.
 */
export const CATALOGUE_VERSION = 1;
export const PROJECT_CATALOG_PATH = "assets/manifest.json";

export const ASSET_TYPES = ["prop", "water", "span", "ground"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CATEGORIES = ["units", "foliage", "terrain", "water", "landmark", "resource", "other"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type CatalogEntry = {
  readonly id: string;
  readonly name: string;
  readonly category: AssetCategory;
  readonly type: AssetType;
  readonly file: string;
  /** Ground-plane collision in asset-local metres, independent of visual mesh. */
  readonly deck?: { readonly width: number; readonly depth: number; readonly height: number; readonly arch: number };
  readonly light?: { readonly x: number; readonly y: number; readonly z: number; readonly color: string; readonly intensity: number; readonly range: number };
  readonly blocker?: { readonly width: number; readonly depth: number };
};

export type Catalogue = {
  readonly v: typeof CATALOGUE_VERSION;
  readonly name: string;
  readonly assets: readonly CatalogEntry[];
};

export function emptyCatalogue(): Catalogue {
  return { v: CATALOGUE_VERSION, name: "Untitled catalogue", assets: [] };
}

export function parseCatalogue(raw: unknown): Catalogue | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== CATALOGUE_VERSION) return null;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  if (!Array.isArray(o.assets)) return null;
  const assets: CatalogEntry[] = [];
  const ids = new Set<string>();
  for (const item of o.assets) {
    const entry = parseEntry(item);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    assets.push(entry);
  }
  return { v: CATALOGUE_VERSION, name: o.name.trim(), assets };
}

export function stringifyCatalogue(doc: Catalogue): string {
  return `${JSON.stringify({ v: doc.v, name: doc.name, assets: doc.assets }, null, 2)}\n`;
}

/** Water only on wet, land props only on dry, span (bridges) anywhere. */
export function sitAllowed(type: AssetType | undefined, wet: boolean): boolean {
  if (type === "water") return wet;
  if (type === "span" || type === "ground") return true;
  return !wet;
}

export function assetIdFromName(name: string, taken: ReadonlySet<string>): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function parseEntry(raw: unknown): CatalogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  if (typeof o.file !== "string" || !o.file.trim()) return null;
  if (!isCategory(o.category) || !isType(o.type)) return null;
  let blocker: CatalogEntry["blocker"];
  if (o.blocker !== undefined) {
    if (!o.blocker || typeof o.blocker !== "object") return null;
    const b = o.blocker as Record<string, unknown>;
    if (typeof b.width !== "number" || !Number.isFinite(b.width) || b.width <= 0 ||
        typeof b.depth !== "number" || !Number.isFinite(b.depth) || b.depth <= 0) return null;
    blocker = { width: b.width, depth: b.depth };
  }
  let deck: CatalogEntry["deck"];
  if (o.deck !== undefined) {
    if (!o.deck || typeof o.deck !== "object") return null;
    const d=o.deck as Record<string,unknown>;
    if (![d.width,d.depth,d.height,d.arch].every(v=>typeof v === "number" && Number.isFinite(v)) ||
        (d.width as number)<=0 || (d.depth as number)<=0 || (d.arch as number)<0) return null;
    deck={width:d.width as number,depth:d.depth as number,height:d.height as number,arch:d.arch as number};
  }
  let light: CatalogEntry["light"];
  if (o.light !== undefined) {
    if (!o.light || typeof o.light !== "object") return null;
    const l = o.light as Record<string, unknown>;
    if (![l.x,l.y,l.z,l.intensity,l.range].every(v=>typeof v === "number" && Number.isFinite(v)) ||
        (l.intensity as number) < 0 || (l.range as number) <= 0 || typeof l.color !== "string" || !/^#[0-9a-f]{6}$/i.test(l.color)) return null;
    light = {x:l.x as number,y:l.y as number,z:l.z as number,color:l.color,intensity:l.intensity as number,range:l.range as number};
  }
  return {
    ...(deck ? { deck } : {}),
    ...(light ? { light } : {}),
    ...(blocker ? { blocker } : {}),
    id: o.id.trim(),
    name: o.name.trim(),
    category: o.category,
    type: o.type,
    file: o.file.trim().replace(/\\/g, "/"),
  };
}

function isCategory(v: unknown): v is AssetCategory {
  return typeof v === "string" && (ASSET_CATEGORIES as readonly string[]).includes(v);
}

function isType(v: unknown): v is AssetType {
  return typeof v === "string" && (ASSET_TYPES as readonly string[]).includes(v);
}
