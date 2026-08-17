/**
 * Catalog PNG loader. Shared by decoration and settler sheets.
 */
import { Texture } from "pixi.js";

const BASE = `${import.meta.env.BASE_URL}graphics/`;

export type PropFrame = {
  texture: Texture;
  offsetX: number;
  offsetY: number;
  torso?: { texture: Texture; offsetX: number; offsetY: number };
  shadow?: { texture: Texture; offsetX: number; offsetY: number };
};

export type CatalogSprite = {
  path: string;
  group?: string;
  variant?: string;
  frame?: number;
  offsetX: number;
  offsetY: number;
  torso?: { path: string; offsetX: number; offsetY: number };
  shadow?: { path: string; offsetX: number; offsetY: number };
};

export async function fetchCatalogSprites(): Promise<CatalogSprite[] | null> {
  try {
    const res = await fetch(`${BASE}catalog.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as { sprites?: CatalogSprite[] };
    return data.sprites ?? [];
  } catch {
    return null;
  }
}

export async function loadGroup(
  sprites: readonly CatalogSprite[],
  group: string,
  variant?: string,
): Promise<PropFrame[]> {
  const frames = sprites
    .filter((s) => s.group === group && (variant === undefined || s.variant === variant))
    .sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
  const loaded = await Promise.all(
    frames.map(async (s): Promise<PropFrame | null> => {
      const texture = await loadTexture(s.path);
      if (!texture) return null;
      const frame: PropFrame = { texture, offsetX: s.offsetX, offsetY: s.offsetY };
      if (s.torso) {
        const torsoTex = await loadTexture(s.torso.path);
        if (torsoTex) {
          frame.torso = { texture: torsoTex, offsetX: s.torso.offsetX, offsetY: s.torso.offsetY };
        }
      }
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

export async function loadTexture(rel: string): Promise<Texture | null> {
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
