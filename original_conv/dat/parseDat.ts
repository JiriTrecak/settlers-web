import { Bytes } from "./bytes";
import type { DatColor } from "./color";
import { decodeBitmap, EMPTY_IMAGE, type BitmapHeaderType } from "./decodeBitmap";
import type { DecodedImage, PixelKind, SeqKind } from "./types";

export const FILE_START1 = [
  0x04, 0x13, 0x04, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x54, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00,
  0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00,
] as const;

export const FILE_START2 = [0x00, 0x00, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] as const;

export const FILE_HEADER_END = [0x04, 0x19, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] as const;

export const COLOR_MAGIC: Record<DatColor, readonly number[]> = {
  rgb555: [0x7c, 0x00, 0x00, 0xe0, 0x03],
  rgb565: [0xf8, 0x00, 0x00, 0xe0, 0x07],
};

const SEQUENCE_START = [0x02, 0x14, 0x00, 0x00, 0x08, 0x00, 0x00] as const;

const ID_SETTLERS = 0x106;
const ID_TORSOS = 0x3112;
const ID_LANDSCAPE = 0x2412;
const ID_SHADOWS = 0x5982;
const ID_GUIS = 0x11306;

const SEQUENCE_TYPE_COUNT = 6;

const DAT_NAME_RE = /^siedler3_(\d+)\.(7c003e01f|f8007e01f)\.dat$/i;

export type SequenceEntry = {
  offset: number;
  frames: number[];
};

export type DirectEntry = {
  offset: number;
};

export function parseDatFileName(name: string): { fileIndex: number; color: DatColor } | null {
  const base = name.split(/[/\\]/).pop() ?? name;
  const m = DAT_NAME_RE.exec(base);
  if (!m) return null;
  return {
    fileIndex: Number(m[1]),
    color: m[2]!.toLowerCase() === "f8007e01f" ? "rgb565" : "rgb555",
  };
}

function readSequenceIndexStarts(bytes: Bytes, fileLength: number, color: DatColor, errors: string[]): number[] {
  try {
    bytes.assume(FILE_START1);
    bytes.assume(COLOR_MAGIC[color]);
    bytes.assume(FILE_START2);
  } catch (e) {
    errors.push(`header magic: ${e instanceof Error ? e.message : String(e)}`);
    bytes.skipTo(48);
  }

  const fileSize = bytes.read32();
  if (fileSize !== fileLength) {
    errors.push(`stored size ${fileSize} != actual ${fileLength}`);
  }
  bytes.read32();
  const starts: number[] = [];
  for (let i = 0; i < SEQUENCE_TYPE_COUNT; i++) starts.push(bytes.read32());
  bytes.read32();
  try {
    bytes.assume(FILE_HEADER_END);
  } catch (e) {
    errors.push(`header end: ${e instanceof Error ? e.message : String(e)}`);
  }
  return starts;
}

function readIndexBlock(bytes: Bytes, start: number): { typeId: number; pointers: number[] } {
  bytes.skipTo(start);
  const typeId = bytes.read32();
  const byteCount = bytes.read16();
  const pointerCount = bytes.read16();
  if (byteCount !== pointerCount * 4 + 8) {
    throw new Error(`index block length ${byteCount} != ${pointerCount * 4 + 8}`);
  }
  const pointers: number[] = [];
  for (let i = 0; i < pointerCount; i++) pointers.push(bytes.read32());
  return { typeId, pointers };
}

function readSequenceHeader(bytes: Bytes, position: number): number[] {
  bytes.skipTo(position);
  bytes.assume(SEQUENCE_START);
  const frameCount = bytes.read8();
  const frames: number[] = [];
  for (let i = 0; i < frameCount; i++) frames.push(bytes.read32() + position);
  return frames;
}

const KIND_PIXEL: Record<SeqKind, { header: BitmapHeaderType; pixel: PixelKind; sequenced: boolean }> = {
  settler: { header: "displaced", pixel: "rgb", sequenced: true },
  torso: { header: "displaced", pixel: "torso", sequenced: true },
  shadow: { header: "displaced", pixel: "shadow", sequenced: true },
  landscape: { header: "landscape", pixel: "rgb", sequenced: false },
  gui: { header: "gui", pixel: "rgb", sequenced: false },
};

export class DatArchive {
  readonly settlers: SequenceEntry[] = [];
  readonly torsos: SequenceEntry[] = [];
  readonly shadows: SequenceEntry[] = [];
  readonly landscapes: DirectEntry[] = [];
  readonly guis: DirectEntry[] = [];
  readonly errors: string[] = [];

  private readonly bytes: Bytes;
  private readonly cache = new Map<string, DecodedImage>();

  constructor(
    buffer: ArrayBuffer,
    readonly color: DatColor,
    readonly fileIndex: number,
    readonly name: string,
  ) {
    this.bytes = new Bytes(buffer);
    this.parseIndex();
    this.alignSettlerLayers();
  }

  counts(): Record<SeqKind, number> {
    return {
      settler: this.settlers.length,
      torso: this.torsos.length,
      shadow: this.shadows.length,
      landscape: this.landscapes.length,
      gui: this.guis.length,
    };
  }

  frameCount(kind: SeqKind, sequence: number): number {
    if (kind === "landscape" || kind === "gui") return sequence >= 0 && sequence < this.direct(kind).length ? 1 : 0;
    const seq = this.sequenced(kind)[sequence];
    return seq?.frames.length ?? 0;
  }

  decode(kind: SeqKind, sequence: number, frame = 0): DecodedImage {
    if (kind === "shadow") {
      sequence = this.mapShadowIndex(sequence);
      if (sequence < 0) return EMPTY_IMAGE;
    }
    const key = `${kind}:${sequence}:${frame}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const img = this.decodeUncached(kind, sequence, frame);
    this.cache.set(key, img);
    return img;
  }

  private sequenced(kind: "settler" | "torso" | "shadow"): SequenceEntry[] {
    if (kind === "settler") return this.settlers;
    if (kind === "torso") return this.torsos;
    return this.shadows;
  }

  private direct(kind: "landscape" | "gui"): DirectEntry[] {
    return kind === "landscape" ? this.landscapes : this.guis;
  }

  private decodeUncached(kind: SeqKind, sequence: number, frame: number): DecodedImage {
    const spec = KIND_PIXEL[kind];
    try {
      let offset = 0;
      if (spec.sequenced) {
        const seq = this.sequenced(kind as "settler").at(sequence);
        const pos = seq?.frames[frame];
        if (pos === undefined || pos === 0) return EMPTY_IMAGE;
        offset = pos;
      } else {
        const entry = this.direct(kind as "landscape").at(sequence);
        if (!entry || entry.offset === 0) return EMPTY_IMAGE;
        offset = entry.offset;
      }
      this.bytes.skipTo(offset);
      return decodeBitmap(this.bytes, spec.header, spec.pixel, this.color);
    } catch (e) {
      this.errors.push(`${kind} ${sequence}:${frame}: ${e instanceof Error ? e.message : String(e)}`);
      return EMPTY_IMAGE;
    }
  }

  private parseIndex(): void {
    const starts = readSequenceIndexStarts(this.bytes, this.bytes.length, this.color, this.errors);
    for (const start of starts) {
      if (start === 0) continue;
      try {
        const block = readIndexBlock(this.bytes, start);
        this.ingestBlock(block.typeId, block.pointers);
      } catch (e) {
        this.errors.push(`index @${start}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Torso/shadow lists are shorter than settlers — pad to match Java AdvancedDatFileReader. */
  private alignSettlerLayers(): void {
    const n = this.settlers.length;
    const empty = (): SequenceEntry => ({ offset: 0, frames: [] });
    const tPad = n - this.torsos.length;
    if (tPad > 0) this.torsos.unshift(...Array.from({ length: tPad }, empty));

    const sPad = n - this.shadows.length;
    if (sPad > 0) {
      if (sPad === 7 || sPad === 8) this.shadows.unshift(...Array.from({ length: sPad }, empty));
      else this.shadows.push(...Array.from({ length: sPad }, empty));
      this.fixupShadows(sPad, empty);
    } else if (sPad === 0 && n === 239) {
      const old = this.shadows.slice();
      for (let i = 171; i >= 13; i--) this.shadows[i] = old[i - 13] ?? empty();
    }
  }

  private fixupShadows(diff: number, empty: () => SequenceEntry): void {
    const s = this.shadows;
    if (diff === 26) {
      for (let i = 0; i < 27; i++) s[i] = s[i + 3] ?? empty();
      for (let i = 27; i < 36; i++) s[i] = s[i + 2] ?? empty();
      s[28] = empty();
      s[44] = s[38] ?? empty();
      s[45] = s[39] ?? empty();
      for (let i = 36; i < 44; i++) s[i] = empty();
      for (let i = 46; i < s.length; i++) s[i] = empty();
    } else if (diff === 28) {
      s[4] = s[1] ?? empty();
      s[6] = empty();
      s[2] = empty();
    }
  }

  /** Extra per-file shadow remaps from Java ShadowMapping. */
  private mapShadowIndex(settlerIndex: number): number {
    const f = this.fileIndex;
    if (f === 1) {
      if (settlerIndex === 26) return -1;
      if (settlerIndex > 26) settlerIndex--;
      if (settlerIndex === 32) return -1;
      if (settlerIndex > 32) settlerIndex--;
      return settlerIndex;
    }
    if (f === 6) return settlerIndex >= 15 ? settlerIndex - 8 : settlerIndex;
    if (f === 22) {
      if ((settlerIndex >= 8 && settlerIndex <= 13) || settlerIndex === 1) return -1;
      if (settlerIndex === 0) return 19;
      if (settlerIndex < 14) return settlerIndex + 18;
      return settlerIndex - 14;
    }
    if (f === 42) return settlerIndex <= 6 ? settlerIndex + 19 : settlerIndex - 6;
    return settlerIndex;
  }

  private ingestBlock(typeId: number, pointers: number[]): void {
    if (typeId === ID_SETTLERS) this.settlers.push(...this.loadSequences(pointers, "settler"));
    else if (typeId === ID_TORSOS) this.torsos.push(...this.loadSequences(pointers, "torso"));
    else if (typeId === ID_SHADOWS) this.shadows.push(...this.loadSequences(pointers, "shadow"));
    else if (typeId === ID_LANDSCAPE) this.landscapes.push(...pointers.filter((p) => p !== 0).map((offset) => ({ offset })));
    else if (typeId === ID_GUIS) this.guis.push(...pointers.filter((p) => p !== 0).map((offset) => ({ offset })));
  }

  private loadSequences(pointers: number[], kind: string): SequenceEntry[] {
    const out: SequenceEntry[] = [];
    for (const offset of pointers) {
      if (offset === 0) {
        out.push({ offset: 0, frames: [] });
        continue;
      }
      try {
        out.push({ offset, frames: readSequenceHeader(this.bytes, offset) });
      } catch (e) {
        this.errors.push(`${kind} seq @${offset}: ${e instanceof Error ? e.message : String(e)}`);
        out.push({ offset, frames: [] });
      }
    }
    return out;
  }
}

export function parseDat(buffer: ArrayBuffer, color: DatColor, fileIndex = 0, name = ""): DatArchive {
  return new DatArchive(buffer, color, fileIndex, name);
}

export async function loadGfxFiles(files: Iterable<File>): Promise<{ archives: DatArchive[]; skipped: string[]; errors: string[] }> {
  const byIndex = new Map<number, DatArchive>();
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const parsed = parseDatFileName(file.name) ?? parseDatFileName(file.webkitRelativePath || file.name);
    if (!parsed) {
      if (file.name.toLowerCase().endsWith(".dat")) skipped.push(file.name);
      continue;
    }
    const prev = byIndex.get(parsed.fileIndex);
    if (prev?.color === "rgb565" && parsed.color === "rgb555") continue;
    try {
      const buf = await file.arrayBuffer();
      byIndex.set(parsed.fileIndex, new DatArchive(buf, parsed.color, parsed.fileIndex, file.name));
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const archives = [...byIndex.values()].sort((a, b) => a.fileIndex - b.fileIndex);
  return { archives, skipped, errors };
}
