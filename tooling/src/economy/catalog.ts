/**
 * Catalog lookup for the economy editor: building groups + stack icons.
 * Paths are under `/graphics/`. Missing dump → empty index, broken imgs hide.
 */
import { fetchCatalogSprites, type CatalogSprite } from "../../../src/render/graphics/textures";
import type { Civ } from "./format";

const GRAPHICS = `${import.meta.env.BASE_URL}graphics/`;

type CatSprite = { path: string; group?: string; variant?: string; frame?: number };

const first = new Map<string, string>();

export type BuildingAsset = {
  group: string;
  civ: Civ;
  kind: string;
  gui?: string;
  built?: string;
  scaffold?: string;
};

export function gfxUrl(rel: string): string {
  return GRAPHICS + rel;
}

export function stackGfx(material: "plank" | "stone"): string {
  return gfxUrl(catalogPath(`props/stack-${material}`) ?? `props/stack-${material}/000.png`);
}

export function catalogPath(group: string, variant?: string): string | undefined {
  return first.get(variant != null ? `${group}:${variant}` : group);
}

export function thumbOf(asset: BuildingAsset): string | undefined {
  return asset.gui ?? asset.built ?? asset.scaffold;
}

export async function loadEconomyCatalog(): Promise<{
  sprites: CatalogSprite[] | null;
  assets: Map<string, BuildingAsset>;
}> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return { sprites: null, assets: new Map() };
  ingestPaths(sprites);
  return { sprites, assets: indexBuildingAssets(sprites) };
}

export function indexBuildingAssets(sprites: readonly CatalogSprite[]): Map<string, BuildingAsset> {
  const out = new Map<string, BuildingAsset>();
  for (const s of sprites) {
    const group = s.group;
    if (!group?.startsWith("buildings/") || !s.path) continue;
    const parts = group.split("/");
    const civ = parts[1];
    const kind = parts[2];
    if (civ == null || kind == null) continue;
    if (civ !== "roman" && civ !== "egyptian" && civ !== "asian" && civ !== "amazon") continue;
    let rec = out.get(group);
    if (!rec) {
      rec = { group, civ, kind };
      out.set(group, rec);
    }
    const frame = s.frame ?? 0;
    const take = (cur: string | undefined): boolean => cur == null || frame === 0;
    if (s.variant === "gui" && take(rec.gui)) rec.gui = s.path;
    else if (s.variant === "built" && take(rec.built)) rec.built = s.path;
    else if (s.variant === "scaffold" && take(rec.scaffold)) rec.scaffold = s.path;
  }
  return out;
}

export function assetsForCiv(assets: Map<string, BuildingAsset>, civ: Civ): BuildingAsset[] {
  return [...assets.values()].filter((a) => a.civ === civ).sort((a, b) => a.kind.localeCompare(b.kind));
}

function ingestPaths(sprites: readonly CatSprite[]): void {
  first.clear();
  const best = new Map<string, number>();
  for (const s of sprites) {
    if (!s.group || !s.path) continue;
    const key = s.variant != null ? `${s.group}:${s.variant}` : s.group;
    const frame = s.frame ?? 0;
    const prev = best.get(key);
    if (prev == null || frame < prev) {
      best.set(key, frame);
      first.set(key, s.path);
    }
  }
}
