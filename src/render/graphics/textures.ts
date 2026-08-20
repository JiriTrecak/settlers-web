/**
 * Catalog PNG loader. Shared by decoration and settler sheets.
 * Atlas frames first (`loadAtlases`); loose PNG if that path is not packed.
 * `px` is texels per world pixel (HD). Offsets stay dump/world pixels.
 * Overlay keys in `px.json`: path, `group:variant`, or group. Path wins.
 */
import { Sprite, Texture } from "pixi.js";
import { atlasTexture } from "./atlas";
import { currentLoadWatch } from "./loadWatch";
import hd from "./px.json";

const BASE = `${import.meta.env.BASE_URL}graphics/`;

export type FrameLayer = {
  texture: Texture;
  offsetX: number;
  offsetY: number;
  /** Texels per world pixel. 1 = dump native. */
  px: number;
};

export type PropFrame = FrameLayer & {
  torso?: FrameLayer;
  shadow?: FrameLayer;
};

export type CatalogSprite = {
  path: string;
  group?: string;
  variant?: string;
  frame?: number;
  offsetX: number;
  offsetY: number;
  /** Texels per world pixel. Overlay `px.json` wins if both are set. */
  px?: number;
  torso?: { path: string; offsetX: number; offsetY: number; px?: number };
  shadow?: { path: string; offsetX: number; offsetY: number; px?: number };
};

type PxKey = { path: string; group?: string; variant?: string; px?: number };

/** Path, then `group:variant`, then group, then the sprite's own `px`. */
export function catalogPx(s: PxKey): number {
  const table = hd as Record<string, number>;
  const n =
    table[s.path] ??
    (s.group != null && s.variant != null ? table[`${s.group}:${s.variant}`] : undefined) ??
    (s.group != null ? table[s.group] : undefined) ??
    s.px ??
    1;
  return n >= 1 ? n : 1;
}

export function frameWorldSize(frame: FrameLayer): { w: number; h: number } {
  const px = frame.px >= 1 ? frame.px : 1;
  return { w: frame.texture.width / px, h: frame.texture.height / px };
}

/** Place a catalog layer. `extraScale` is sapling/chop, not HD. */
export function placeLayer(sprite: Sprite, layer: FrameLayer, wx: number, wy: number, extraScale = 1): void {
  const px = layer.px >= 1 ? layer.px : 1;
  sprite.texture = layer.texture;
  sprite.scale.set(extraScale / px);
  sprite.position.set(wx + layer.offsetX * extraScale, wy + layer.offsetY * extraScale);
}

/** Blit a texture's frame (atlas sub-rect or whole PNG) onto a 2D canvas. */
export function blitTexture(ctx: CanvasRenderingContext2D, texture: Texture, dx: number, dy: number): void {
  const res = texture.source.resource;
  if (
    !(
      res instanceof HTMLImageElement ||
      (typeof ImageBitmap !== "undefined" && res instanceof ImageBitmap) ||
      (typeof HTMLCanvasElement !== "undefined" && res instanceof HTMLCanvasElement)
    )
  ) {
    return;
  }
  const f = texture.frame;
  ctx.drawImage(res, f.x, f.y, f.width, f.height, dx, dy, f.width, f.height);
}

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
      const frame: PropFrame = { texture, offsetX: s.offsetX, offsetY: s.offsetY, px: catalogPx(s) };
      if (s.torso) {
        const torsoTex = await loadTexture(s.torso.path);
        if (torsoTex) {
          frame.torso = {
            texture: torsoTex,
            offsetX: s.torso.offsetX,
            offsetY: s.torso.offsetY,
            px: catalogPx({ path: s.torso.path, px: s.torso.px }),
          };
        }
      }
      if (s.shadow) {
        const shadowTex = await loadTexture(s.shadow.path);
        if (shadowTex) {
          frame.shadow = {
            texture: shadowTex,
            offsetX: s.shadow.offsetX,
            offsetY: s.shadow.offsetY,
            px: catalogPx({ path: s.shadow.path, px: s.shadow.px }),
          };
        }
      }
      return frame;
    }),
  );
  return loaded.filter((f): f is PropFrame => f !== null);
}

const textures = new Map<string, Promise<Texture | null>>();

/** Decode a catalog PNG. Atlas frame if packed; else a loose file. Same path is reused. */
export async function loadTexture(rel: string): Promise<Texture | null> {
  const hit = textures.get(rel);
  if (hit) return hit;
  const packed = atlasTexture(rel);
  if (packed) {
    const p = Promise.resolve(packed);
    textures.set(rel, p);
    return packed;
  }
  currentLoadWatch()?.expectPath(rel);
  const p = decodeTexture(rel);
  textures.set(rel, p);
  return p;
}

async function decodeTexture(rel: string): Promise<Texture | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = BASE + rel;
    await img.decode();
    const texture = Texture.from(img);
    texture.source.autoGenerateMipmaps = false;
    texture.source.scaleMode = "nearest";
    currentLoadWatch()?.tick(rel);
    return texture;
  } catch {
    currentLoadWatch()?.tick(rel);
    return null;
  }
}
