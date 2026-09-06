/**
 * Catalogue filter for MCP browse. Pure — no store, no URLs.
 */
import { ASSET_CATEGORIES, ASSET_TYPES, type AssetCategory, type AssetType, type CatalogEntry } from "../asset/catalog";

export type CatalogQuery = {
  readonly q?: string;
  readonly category?: AssetCategory;
  readonly type?: AssetType;
  readonly limit?: number;
};

export function filterCatalog(assets: readonly CatalogEntry[], query: CatalogQuery = {}): CatalogEntry[] {
  const needle = query.q?.trim().toLowerCase() ?? "";
  const limit = clampLimit(query.limit);
  const out: CatalogEntry[] = [];
  for (const a of assets) {
    if (query.category && a.category !== query.category) continue;
    if (query.type && a.type !== query.type) continue;
    if (needle && !a.id.includes(needle) && !a.name.toLowerCase().includes(needle)) continue;
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

export function parseCatalogQuery(raw: unknown): CatalogQuery {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const q = typeof o.q === "string" ? o.q : undefined;
  const category = isCat(o.category) ? o.category : undefined;
  const type = isType(o.type) ? o.type : undefined;
  const limit = typeof o.limit === "number" && Number.isFinite(o.limit) ? o.limit : undefined;
  return { ...(q ? { q } : {}), ...(category ? { category } : {}), ...(type ? { type } : {}), ...(limit !== undefined ? { limit } : {}) };
}

function clampLimit(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return 80;
  return Math.min(200, Math.max(1, Math.round(n)));
}

function isCat(v: unknown): v is AssetCategory {
  return typeof v === "string" && (ASSET_CATEGORIES as readonly string[]).includes(v);
}

function isType(v: unknown): v is AssetType {
  return typeof v === "string" && (ASSET_TYPES as readonly string[]).includes(v);
}
