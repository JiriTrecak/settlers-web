import { Bytes } from "./bytes";
import { SHADOW_RGBA, unpackColor, type DatColor } from "./color";
import type { DecodedImage, PixelKind } from "./types";

export type BitmapHeaderType = "displaced" | "landscape" | "gui";

const DISPLACED_MAGIC = [0x0c, 0x00, 0x00, 0x00] as const;

export const EMPTY_IMAGE: DecodedImage = {
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
  rgba: new Uint8ClampedArray(0),
};

export function readBitmapHeader(
  bytes: Bytes,
  header: BitmapHeaderType,
): { width: number; height: number; offsetX: number; offsetY: number } {
  if (header === "displaced") bytes.assume(DISPLACED_MAGIC);
  const width = bytes.read16();
  const height = bytes.read16();
  let offsetX = 0;
  let offsetY = 0;
  if (header === "displaced") {
    offsetX = bytes.read16signed();
    offsetY = bytes.read16signed();
  } else if (header === "gui") {
    bytes.read16();
    bytes.read16();
  } else {
    bytes.read16();
  }
  if (bytes.pos % 2 === 1) bytes.read8();
  return { width, height, offsetX, offsetY };
}

function readPixel(bytes: Bytes, kind: PixelKind, color: DatColor): [number, number, number, number] {
  if (kind === "shadow") return SHADOW_RGBA;
  if (kind === "torso") {
    const g = ((bytes.read8() & 0x1f) * 255) / 31 | 0;
    return [g, g, g, 255];
  }
  return unpackColor(bytes.read16(), color);
}

export function decodeRle(
  bytes: Bytes,
  width: number,
  height: number,
  kind: PixelKind,
  color: DatColor,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (width === 0 || height === 0) return rgba;

  for (let y = 0; y < height; y++) {
    let x = 0;
    let newLine = false;
    while (!newLine) {
      const meta = bytes.read16();
      const length = meta & 0xff;
      const skip = (meta & 0x7f00) >> 8;
      newLine = (meta & 0x8000) !== 0;
      x += skip;
      for (let i = 0; i < length; i++) {
        const px = readPixel(bytes, kind, color);
        if (x >= 0 && x < width) {
          const o = (y * width + x) * 4;
          rgba[o] = px[0];
          rgba[o + 1] = px[1];
          rgba[o + 2] = px[2];
          rgba[o + 3] = px[3];
        }
        x++;
      }
    }
  }
  return rgba;
}

export function decodeBitmap(
  bytes: Bytes,
  header: BitmapHeaderType,
  kind: PixelKind,
  color: DatColor,
): DecodedImage {
  const meta = readBitmapHeader(bytes, header);
  const rgba = decodeRle(bytes, meta.width, meta.height, kind, color);
  return { ...meta, rgba };
}

export function toImageData(img: DecodedImage): ImageData {
  const data = new ImageData(Math.max(img.width, 1), Math.max(img.height, 1));
  if (img.width > 0 && img.height > 0) data.data.set(img.rgba);
  return data;
}
