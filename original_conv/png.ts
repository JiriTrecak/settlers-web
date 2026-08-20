/**
 * PNG encode/decode used by dump + atlas pack. 8-bit RGBA out.
 */
import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 4, "ascii");
  const crcBuf = Buffer.concat([head.subarray(4, 8), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([head, data, tail]);
}

export function encodePng(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array,
  level = 6,
): Buffer {
  const row = width * 4;
  const raw = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (row + 1)] = 0;
    Buffer.from(rgba.subarray(y * row, y * row + row)).copy(raw, y * (row + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export type DecodedPng = { width: number; height: number; rgba: Uint8ClampedArray };

/** 8-bit non-interlaced PNG → RGBA. Dump files are type 6 / filter 0; other types still decode. */
export function decodePng(buf: Buffer): DecodedPng {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("not a png");
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let trans: Buffer | null = null;
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trans = Buffer.from(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  if (width <= 0 || height <= 0) throw new Error("bad ihdr");
  if (bitDepth !== 8) throw new Error(`png bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced png");
  const inflated = inflateSync(Buffer.concat(idat));
  const bpp = bytesPerPixel(colorType);
  const stride = width * bpp;
  const raw = unfilter(inflated, width, height, bpp);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = raw.subarray(y * stride, y * stride + stride);
    expandRow(src, rgba, y * width * 4, width, colorType, palette, trans);
  }
  return { width, height, rgba };
}

function bytesPerPixel(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 3) return 1;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`png color type ${colorType}`);
}

function unfilter(data: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let si = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[si++]!;
    const row = data.subarray(si, si + stride);
    si += stride;
    const dest = out.subarray(y * stride, y * stride + stride);
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    applyFilter(filter, row, dest, prev, bpp);
  }
  return out;
}

function applyFilter(filter: number, src: Buffer, dest: Buffer, prev: Buffer | null, bpp: number): void {
  for (let x = 0; x < src.length; x++) {
    const a = x >= bpp ? dest[x - bpp]! : 0;
    const b = prev ? prev[x]! : 0;
    const c = prev && x >= bpp ? prev[x - bpp]! : 0;
    let v = src[x]!;
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) v += paeth(a, b, c);
    else if (filter !== 0) throw new Error(`png filter ${filter}`);
    dest[x] = v & 255;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function expandRow(
  src: Buffer,
  rgba: Uint8ClampedArray,
  di: number,
  width: number,
  colorType: number,
  palette: Buffer | null,
  trans: Buffer | null,
): void {
  for (let x = 0; x < width; x++) {
    if (colorType === 6) {
      rgba[di] = src[x * 4]!;
      rgba[di + 1] = src[x * 4 + 1]!;
      rgba[di + 2] = src[x * 4 + 2]!;
      rgba[di + 3] = src[x * 4 + 3]!;
    } else if (colorType === 2) {
      rgba[di] = src[x * 3]!;
      rgba[di + 1] = src[x * 3 + 1]!;
      rgba[di + 2] = src[x * 3 + 2]!;
      rgba[di + 3] = 255;
    } else if (colorType === 0) {
      const g = src[x]!;
      rgba[di] = g;
      rgba[di + 1] = g;
      rgba[di + 2] = g;
      rgba[di + 3] = trans && trans.length >= 2 && g === trans.readUInt16BE(0) ? 0 : 255;
    } else if (colorType === 4) {
      const g = src[x * 2]!;
      rgba[di] = g;
      rgba[di + 1] = g;
      rgba[di + 2] = g;
      rgba[di + 3] = src[x * 2 + 1]!;
    } else if (colorType === 3) {
      if (!palette) throw new Error("png missing PLTE");
      const idx = src[x]!;
      rgba[di] = palette[idx * 3]!;
      rgba[di + 1] = palette[idx * 3 + 1]!;
      rgba[di + 2] = palette[idx * 3 + 2]!;
      rgba[di + 3] = trans && idx < trans.length ? trans[idx]! : 255;
    }
    di += 4;
  }
}
