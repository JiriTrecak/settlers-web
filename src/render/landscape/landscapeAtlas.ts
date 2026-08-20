/**
 * Loads assets/graphics/landscape-atlas.png (1024², nearest, no mips).
 */
import { loadNote } from "../graphics/loadWatch";
import { loadTexture } from "../graphics/textures";

export const LANDSCAPE_ATLAS_URL = `${import.meta.env.BASE_URL}graphics/landscape-atlas.png`;

export async function loadLandscapeAtlas() {
  loadNote("landscape atlas");
  const texture = await loadTexture("landscape-atlas.png");
  if (texture) texture.source.addressMode = "clamp-to-edge";
  return texture;
}
