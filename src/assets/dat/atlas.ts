import { TEXTURE_GRID, TEXTURE_POSITIONS, TEXTURE_SIZE } from "./atlasPositions";
import { EMPTY_IMAGE } from "./decodeBitmap";
import type { DecodedImage } from "./types";

export { TEXTURE_GRID, TEXTURE_POSITIONS, TEXTURE_SIZE };

/** Pack file-0 landscape frames into Java's 1024 atlas. Tiles wrap to fill each cell. */
export function packLandscapeAtlas(images: readonly DecodedImage[]): DecodedImage {
  const rgba = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const n = Math.min(images.length, TEXTURE_POSITIONS.length);
  for (let i = 0; i < n; i++) {
    const img = images[i];
    const pos = TEXTURE_POSITIONS[i];
    if (!img || !pos || img.width === 0 || img.height === 0) continue;
    const [gx, gy, size] = pos;
    const destX = gx * TEXTURE_GRID;
    const destY = gy * TEXTURE_GRID;
    const cell = size * TEXTURE_GRID;
    for (let row = 0; row < cell; row++) {
      const srcY = row % img.height;
      const dy = destY + row;
      if (dy >= TEXTURE_SIZE) break;
      for (let col = 0; col < cell; col++) {
        const srcX = col % img.width;
        const dx = destX + col;
        if (dx >= TEXTURE_SIZE) break;
        const si = (srcY * img.width + srcX) * 4;
        const di = (dy * TEXTURE_SIZE + dx) * 4;
        rgba[di] = img.rgba[si]!;
        rgba[di + 1] = img.rgba[si + 1]!;
        rgba[di + 2] = img.rgba[si + 2]!;
        rgba[di + 3] = img.rgba[si + 3]!;
      }
    }
  }
  if (n === 0) return EMPTY_IMAGE;
  return { width: TEXTURE_SIZE, height: TEXTURE_SIZE, offsetX: 0, offsetY: 0, rgba };
}
