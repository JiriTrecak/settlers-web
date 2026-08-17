/**
 * Loads `/graphics/catalog.json` + PNGs. Trees are seven sheet groups (`tree-1`…`7`).
 */
import { Texture } from "pixi.js";

const BASE = "/graphics/";

export type PropFrame = {
  texture: Texture;
  offsetX: number;
  offsetY: number;
  shadow?: { texture: Texture; offsetX: number; offsetY: number };
};

export type DecorationSheets = {
  trees: PropFrame[][];
  stones: PropFrame[];
  waves: PropFrame[];
};

type CatalogSprite = {
  path: string;
  group?: string;
  frame?: number;
  offsetX: number;
  offsetY: number;
  shadow?: { path: string; offsetX: number; offsetY: number };
};

type CatalogFile = { sprites?: CatalogSprite[] };

export async function loadDecorationSheets(): Promise<DecorationSheets | null> {
  try {
    const res = await fetch(`${BASE}catalog.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as CatalogFile;
    const sprites = data.sprites ?? [];
    const trees = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map((n) => loadGroup(sprites, `props/tree-${n}`)),
    );
    const stones = await loadGroup(sprites, "props/stone");
    const waves = await loadGroup(sprites, "props/waves");
    if (trees.some((t) => t.length === 0) || stones.length === 0 || waves.length === 0) return null;
    return { trees, stones, waves };
  } catch {
    return null;
  }
}

async function loadGroup(sprites: readonly CatalogSprite[], group: string): Promise<PropFrame[]> {
  const frames = sprites.filter((s) => s.group === group).sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
  const loaded = await Promise.all(
    frames.map(async (s): Promise<PropFrame | null> => {
      const texture = await loadTexture(s.path);
      if (!texture) return null;
      const frame: PropFrame = { texture, offsetX: s.offsetX, offsetY: s.offsetY };
      if (s.shadow) {
        const shadowTex = await loadTexture(s.shadow.path);
        if (shadowTex) {
          frame.shadow = { texture: shadowTex, offsetX: s.shadow.offsetX, offsetY: s.shadow.offsetY };
        }
      }
      return frame;
    }),
  );
  return loaded.filter((f): f is PropFrame => f !== null);
}

async function loadTexture(rel: string): Promise<Texture | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = BASE + rel;
    await img.decode();
    const texture = Texture.from(img);
    texture.source.autoGenerateMipmaps = false;
    texture.source.scaleMode = "nearest";
    return texture;
  } catch {
    return null;
  }
}
