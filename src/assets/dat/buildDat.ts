import {
  COLOR_MAGIC,
  FILE_HEADER_END,
  FILE_START1,
  FILE_START2,
} from "./parseDat";
import type { DatColor } from "./types";

const ID_SETTLERS = 0x106;
const ID_TORSOS = 0x3112;
const ID_LANDSCAPE = 0x2412;
const ID_SHADOWS = 0x5982;
const ID_GUIS = 0x11306;
const SEQUENCE_START = [0x02, 0x14, 0x00, 0x00, 0x08, 0x00, 0x00];
const DISPLACED_MAGIC = [0x0c, 0x00, 0x00, 0x00];

export type RgbFrame = {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  /** row-major 16-bit color values (555 or 565 depending on file). 0 = transparent skip. */
  pixels: number[];
};

export type TorsoFrame = {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  /** row-major 0–31 gray. 0 = transparent. */
  pixels: number[];
};

export type ShadowFrame = {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  /** row-major 0/1 mask. */
  pixels: number[];
};

export type DatSpec = {
  color: DatColor;
  settlers?: RgbFrame[][];
  torsos?: TorsoFrame[][];
  shadows?: ShadowFrame[][];
  landscapes?: RgbFrame[];
  guis?: RgbFrame[];
};

class Buf {
  readonly bytes: number[] = [];

  get pos(): number {
    return this.bytes.length;
  }

  u8(n: number): void {
    this.bytes.push(n & 0xff);
  }

  u16(n: number): void {
    this.u8(n);
    this.u8(n >> 8);
  }

  i16(n: number): void {
    this.u16(n < 0 ? n + 0x10000 : n);
  }

  u32(n: number): void {
    this.u16(n);
    this.u16(n >>> 16);
  }

  raw(arr: readonly number[]): void {
    for (const b of arr) this.u8(b);
  }

  padEven(): void {
    if (this.pos % 2 === 1) this.u8(0);
  }

  patch32(at: number, n: number): void {
    this.bytes[at] = n & 0xff;
    this.bytes[at + 1] = (n >> 8) & 0xff;
    this.bytes[at + 2] = (n >> 16) & 0xff;
    this.bytes[at + 3] = (n >>> 24) & 0xff;
  }

  toBuffer(): ArrayBuffer {
    return new Uint8Array(this.bytes).buffer;
  }
}

type PixelKind = "rgb" | "torso" | "shadow";

function writeRle(buf: Buf, width: number, height: number, pixels: number[], kind: PixelKind): void {
  for (let y = 0; y < height; y++) {
    let x = 0;
    const row = pixels.slice(y * width, (y + 1) * width);
    while (x < width) {
      let skip = 0;
      while (x + skip < width && (row[x + skip] ?? 0) === 0) skip++;
      if (skip > 127) skip = 127;
      x += skip;
      let length = 0;
      while (x + length < width && (row[x + length] ?? 0) !== 0 && length < 255) length++;
      const linebreak = x + length >= width;
      buf.u16((linebreak ? 0x8000 : 0) | (skip << 8) | length);
      for (let i = 0; i < length; i++) {
        const p = row[x + i] ?? 0;
        if (kind === "rgb") buf.u16(p);
        else if (kind === "torso") buf.u8(p & 0x1f);
      }
      x += length;
      if (linebreak) break;
      if (length === 0 && skip === 0) {
        buf.u16(0x8000);
        break;
      }
    }
    if (width === 0) buf.u16(0x8000);
  }
}

function writeDisplaced(buf: Buf, frame: { width: number; height: number; offsetX?: number; offsetY?: number; pixels: number[] }, kind: PixelKind): number {
  const start = buf.pos;
  buf.raw(DISPLACED_MAGIC);
  buf.u16(frame.width);
  buf.u16(frame.height);
  buf.i16(frame.offsetX ?? 0);
  buf.i16(frame.offsetY ?? 0);
  buf.padEven();
  writeRle(buf, frame.width, frame.height, frame.pixels, kind);
  return start;
}

function writeLandscape(buf: Buf, frame: RgbFrame): number {
  const start = buf.pos;
  buf.u16(frame.width);
  buf.u16(frame.height);
  buf.u16(0);
  buf.padEven();
  writeRle(buf, frame.width, frame.height, frame.pixels, "rgb");
  return start;
}

function writeGui(buf: Buf, frame: RgbFrame): number {
  const start = buf.pos;
  buf.u16(frame.width);
  buf.u16(frame.height);
  buf.u16(0);
  buf.u16(0);
  buf.padEven();
  writeRle(buf, frame.width, frame.height, frame.pixels, "rgb");
  return start;
}

function writeSequence(buf: Buf, frames: { write: () => number }[]): number {
  const start = buf.pos;
  buf.raw(SEQUENCE_START);
  buf.u8(frames.length);
  const ptrAt = buf.pos;
  for (let i = 0; i < frames.length; i++) buf.u32(0);
  const rels: number[] = [];
  for (const frame of frames) rels.push(frame.write() - start);
  for (let i = 0; i < rels.length; i++) buf.patch32(ptrAt + i * 4, rels[i]!);
  return start;
}

function writeIndex(buf: Buf, typeId: number, pointers: number[]): number {
  const start = buf.pos;
  buf.u32(typeId);
  buf.u16(pointers.length * 4 + 8);
  buf.u16(pointers.length);
  for (const p of pointers) buf.u32(p);
  return start;
}

export function buildDat(spec: DatSpec): ArrayBuffer {
  const settlers = spec.settlers ?? [];
  const torsos = spec.torsos ?? [];
  const shadows = spec.shadows ?? [];
  const landscapes = spec.landscapes ?? [];
  const guis = spec.guis ?? [];

  const headerSize = 96;
  const indexSizes = [settlers, torsos, shadows, landscapes, guis, [] as number[]].map(
    (list) => 8 + 4 * list.length,
  );
  const bodyStart = headerSize + indexSizes.reduce((a, b) => a + b, 0);

  const buf = new Buf();
  buf.raw(FILE_START1);
  buf.raw(COLOR_MAGIC[spec.color]);
  buf.raw(FILE_START2);
  const sizeAt = buf.pos;
  buf.u32(0);
  buf.u32(0);
  const startsAt = buf.pos;
  for (let i = 0; i < 6; i++) buf.u32(0);
  buf.u32(0);
  buf.raw(FILE_HEADER_END);
  if (buf.pos !== headerSize) throw new Error(`header ${buf.pos} != ${headerSize}`);

  const indexStarts: number[] = [];
  const lists = [settlers, torsos, shadows, landscapes, guis, []];
  const typeIds = [ID_SETTLERS, ID_TORSOS, ID_SHADOWS, ID_LANDSCAPE, ID_GUIS, 0];
  const pointerSlots: number[][] = [];
  for (let i = 0; i < 6; i++) {
    indexStarts.push(writeIndex(buf, typeIds[i]!, new Array(lists[i]!.length).fill(0)));
    const slot: number[] = [];
    // pointer array starts 8 bytes into the block
    for (let j = 0; j < lists[i]!.length; j++) slot.push(indexStarts[i]! + 8 + j * 4);
    pointerSlots.push(slot);
  }
  if (buf.pos !== bodyStart) throw new Error(`indexes ${buf.pos} != ${bodyStart}`);

  for (let s = 0; s < settlers.length; s++) {
    const seq = settlers[s]!;
    const start = writeSequence(
      buf,
      seq.map((frame) => ({ write: () => writeDisplaced(buf, frame, "rgb") })),
    );
    buf.patch32(pointerSlots[0]![s]!, start);
  }
  for (let s = 0; s < torsos.length; s++) {
    const seq = torsos[s]!;
    const start = writeSequence(
      buf,
      seq.map((frame) => ({ write: () => writeDisplaced(buf, frame, "torso") })),
    );
    buf.patch32(pointerSlots[1]![s]!, start);
  }
  for (let s = 0; s < shadows.length; s++) {
    const seq = shadows[s]!;
    const start = writeSequence(
      buf,
      seq.map((frame) => ({ write: () => writeDisplaced(buf, frame, "shadow") })),
    );
    buf.patch32(pointerSlots[2]![s]!, start);
  }
  for (let i = 0; i < landscapes.length; i++) {
    const start = writeLandscape(buf, landscapes[i]!);
    buf.patch32(pointerSlots[3]![i]!, start);
  }
  for (let i = 0; i < guis.length; i++) {
    const start = writeGui(buf, guis[i]!);
    buf.patch32(pointerSlots[4]![i]!, start);
  }

  for (let i = 0; i < 6; i++) buf.patch32(startsAt + i * 4, indexStarts[i]!);
  buf.patch32(sizeAt, buf.pos);
  return buf.toBuffer();
}
