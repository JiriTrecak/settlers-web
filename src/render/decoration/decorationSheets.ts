/**
 * Loads `/graphics/catalog.json` + PNGs. Trees are seven sheet groups (`tree-1`…`7`).
 */
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type { PropFrame };

export type DecorationSheets = {
  trees: PropFrame[][];
  falls: PropFrame[][];
  stones: PropFrame[];
  waves: PropFrame[];
};

export async function loadDecorationSheets(): Promise<DecorationSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const trees = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => loadGroup(sprites, `props/tree-${n}`)));
    const falls = await Promise.all([1, 2, 3, 4].map((n) => loadGroup(sprites, `props/tree-fall-${n}`)));
    const stones = await loadGroup(sprites, "props/stone");
    const waves = await loadGroup(sprites, "props/waves");
    if (trees.some((t) => t.length === 0) || stones.length === 0 || waves.length === 0) return null;
    return { trees, falls, stones, waves };
  } catch {
    return null;
  }
}
