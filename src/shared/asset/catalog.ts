/**
 * Asset catalogue file. JSON; `v` is the schema. `file` is relative to the catalogue.
 */
export const CATALOGUE_VERSION = 1;
export const PROJECT_CATALOG_PATH = "assets/catalog.json";

export const ASSET_TYPES = ["prop", "water"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CATEGORIES = ["foliage", "terrain", "water", "landmark", "resource", "other"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type CatalogEntry = {
  readonly id: string;
  readonly name: string;
  readonly category: AssetCategory;
  readonly type: AssetType;
  readonly file: string;
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
  return {
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
