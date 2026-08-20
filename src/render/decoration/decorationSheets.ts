/**
 * Loads `/graphics/catalog.json` + PNGs. Trees are seven sheet groups (`tree-1`…`7`).
 * Stacks are `props/stack-{material}`; missing material falls back to trunk.
 */
import type { Goods } from "../../sim/data/types";
import type { SignKind } from "../../sim/map/resource";
import { SIGN_KINDS } from "../../sim/map/resource";
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type { PropFrame };

const STACK_GOODS: Goods[] = [
  "trunk",
  "plank",
  "stone",
  "axe",
  "hammer",
  "blade",
  "pick",
  "saw",
  "ironore",
  "goldore",
  "crop",
  "flour",
  "bread",
  "fish",
  "meat",
  "pig",
  "water",
  "scythe",
  "fishingrod",
];

export type DecorationSheets = {
  trees: PropFrame[][];
  falls: PropFrame[][];
  stones: PropFrame[];
  waves: PropFrame[];
  stacks: Partial<Record<Goods, PropFrame[]>>;
  signs: Partial<Record<SignKind, PropFrame[]>>;
  border: PropFrame[];
  crops: PropFrame[];
};

export async function loadDecorationSheets(): Promise<DecorationSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const trees = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => loadGroup(sprites, `props/tree-${n}`)));
    const falls = await Promise.all([1, 2, 3, 4].map((n) => loadGroup(sprites, `props/tree-fall-${n}`)));
    const stones = await loadGroup(sprites, "props/stone");
    const waves = await loadGroup(sprites, "props/waves");
    const stacks: DecorationSheets["stacks"] = {};
    for (const g of STACK_GOODS) {
      const frames = await loadGroup(sprites, `props/stack-${g}`);
      if (frames.length > 0) stacks[g] = frames;
    }
    if (!stacks.trunk) {
      const legacy = await loadGroup(sprites, "props/stack-trunk");
      if (legacy.length > 0) stacks.trunk = legacy;
    }
    if (trees.some((t) => t.length === 0) || stones.length === 0 || waves.length === 0) return null;
    const site = await loadGroup(sprites, "props/site-sign");
    const signs: DecorationSheets["signs"] = {};
    for (const k of SIGN_KINDS) {
      const frames = await loadGroup(sprites, `props/found-${k}`);
      if (frames.length > 0) signs[k] = frames;
      else if (site.length > 0) signs[k] = site;
    }
    const border = await loadGroup(sprites, "props/border");
    const crops = await loadGroup(sprites, "props/corn");
    return { trees, falls, stones, waves, stacks, signs, border, crops };
  } catch {
    return null;
  }
}
