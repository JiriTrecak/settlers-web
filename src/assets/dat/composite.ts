import { EMPTY_IMAGE } from "./decodeBitmap";
import type { DecodedImage } from "./types";

export type Rgb = readonly [number, number, number];

function blit(
  dw: number,
  dh: number,
  src: DecodedImage,
  originX: number,
  originY: number,
  paint: (sr: number, sg: number, sb: number, sa: number, di: number) => void,
): void {
  if (src.width === 0 || src.height === 0) return;
  const dx0 = src.offsetX - originX;
  const dy0 = src.offsetY - originY;
  for (let y = 0; y < src.height; y++) {
    const dy = dy0 + y;
    if (dy < 0 || dy >= dh) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = dx0 + x;
      if (dx < 0 || dx >= dw) continue;
      const si = (y * src.width + x) * 4;
      const sa = src.rgba[si + 3]!;
      if (sa === 0) continue;
      paint(src.rgba[si]!, src.rgba[si + 1]!, src.rgba[si + 2]!, sa, (dy * dw + dx) * 4);
    }
  }
}

/** Hotspot = min offsets of the three layers, same as Java SettlerImage. */
export function compositeSettler(
  body: DecodedImage,
  torso: DecodedImage | null,
  shadow: DecodedImage | null,
  player: Rgb,
): DecodedImage {
  const layers = [body, torso, shadow].filter((l): l is DecodedImage => !!l && (l.width > 0 || l.height > 0));
  if (layers.length === 0) return EMPTY_IMAGE;

  let ox = body.offsetX;
  let oy = body.offsetY;
  let rx = body.offsetX + body.width;
  let ry = body.offsetY + body.height;
  for (const l of layers) {
    ox = Math.min(ox, l.offsetX);
    oy = Math.min(oy, l.offsetY);
    rx = Math.max(rx, l.offsetX + l.width);
    ry = Math.max(ry, l.offsetY + l.height);
  }
  const width = Math.max(0, rx - ox);
  const height = Math.max(0, ry - oy);
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (shadow) {
    blit(width, height, shadow, ox, oy, (_r, _g, _b, a, di) => {
      rgba[di] = 0;
      rgba[di + 1] = 0;
      rgba[di + 2] = 0;
      rgba[di + 3] = a;
    });
  }

  blit(width, height, body, ox, oy, (r, g, b, a, di) => {
    rgba[di] = r;
    rgba[di + 1] = g;
    rgba[di + 2] = b;
    rgba[di + 3] = a;
  });

  if (torso) {
    blit(width, height, torso, ox, oy, (r, _g, _b, a, di) => {
      const t = r / 255;
      rgba[di] = (player[0] * t) | 0;
      rgba[di + 1] = (player[1] * t) | 0;
      rgba[di + 2] = (player[2] * t) | 0;
      rgba[di + 3] = a;
    });
  }

  return { width, height, offsetX: ox, offsetY: oy, rgba };
}
