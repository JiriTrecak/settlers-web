/**
 * Loads assets/graphics/landscape-atlas.png (1024², nearest, no mips).
 */
import { Texture } from "pixi.js";

export const LANDSCAPE_ATLAS_URL = `${import.meta.env.BASE_URL}graphics/landscape-atlas.png`;

export async function loadLandscapeAtlas(): Promise<Texture | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = LANDSCAPE_ATLAS_URL;
    await img.decode();
    const texture = Texture.from(img);
    texture.source.autoGenerateMipmaps = false;
    texture.source.scaleMode = "nearest";
    texture.source.addressMode = "clamp-to-edge";
    return texture;
  } catch {
    return null;
  }
}
