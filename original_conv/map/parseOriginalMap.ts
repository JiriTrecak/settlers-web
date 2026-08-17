/** Original Settlers III .map reader. XOR-decrypts segments. Integers are little-endian. */

const VERSION_DEFAULT = 0x0a;
const VERSION_AMAZONS = 0x0b;

const PART = {
  eof: 0,
  mapInfo: 1,
  playerInfo: 2,
  area: 6,
  questText: 11,
} as const;

export type OriginalMapPlayer = {
  name: string;
  /** Grid cell of that player's HQ / first tower. */
  startX: number;
  startY: number;
  nation: number;
};

export type ParsedOriginalMap = {
  checksum: number;
  version: number;
  width: number;
  singlePlayer: boolean;
  players: OriginalMapPlayer[];
  quest: string;
  /** Original landscape ids (0, 16, 32, …). */
  landscape: Uint8Array;
  /** Original heights 0–255. */
  heights: Uint8Array;
  /** Original map-object ids (0 = empty). */
  objects: Uint8Array;
};

export function parseOriginalMap(source: ArrayBuffer | Uint8Array): ParsedOriginalMap {
  const data = source instanceof Uint8Array ? source.slice() : new Uint8Array(source);
  if (data.length < 16) throw new Error("map too small");

  const version = u32(data, 4);
  if (version !== VERSION_DEFAULT && version !== VERSION_AMAZONS) {
    throw new Error(`unknown map version ${version}`);
  }

  const parts = indexParts(data);
  const mapInfo = decryptPart(data, parts.get(PART.mapInfo));
  if (!mapInfo) throw new Error("missing MAP_INFO");

  let pos = mapInfo.offset;
  const mapType = u32(data, pos);
  pos += 4;
  const singlePlayer = mapType === 1;
  const playerCount = Math.min(20, u32(data, pos));
  pos += 4;

  const players: OriginalMapPlayer[] = [];
  const playerInfo = decryptPart(data, parts.get(PART.playerInfo));
  if (playerInfo) {
    pos = playerInfo.offset;
    for (let i = 0; i < playerCount; i++) {
      const nation = u32(data, pos);
      pos += 4;
      const startX = u32(data, pos);
      pos += 4;
      const startY = u32(data, pos);
      pos += 4;
      const name = cString(data, pos, 33);
      pos += 33;
      players.push({ name, startX, startY, nation });
    }
  }

  const questPart = decryptPart(data, parts.get(PART.questText));
  const quest = questPart ? cString(data, questPart.offset, questPart.size) : "";

  const area = decryptPart(data, parts.get(PART.area));
  if (!area || area.size < 4) throw new Error("missing AREA");
  const width = u32(data, area.offset);
  if (width < 2 || width > 2048) throw new Error(`bad map size ${width}`);

  const n = width * width;
  if (area.size < 4 + n * 6) throw new Error("AREA truncated");
  const landscape = new Uint8Array(n);
  const heights = new Uint8Array(n);
  const objects = new Uint8Array(n);
  pos = area.offset + 4;
  for (let i = 0; i < n; i++) {
    heights[i] = data[pos++]!;
    landscape[i] = data[pos++]!;
    objects[i] = data[pos++]!;
    pos += 3; // owner, accessible, resources
  }

  return {
    checksum: u32(data, 0),
    version,
    width,
    singlePlayer,
    players,
    quest,
    landscape,
    heights,
    objects,
  };
}

export function checksumValid(source: ArrayBuffer | Uint8Array): boolean {
  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  const expected = u32(data, 0) | 0;
  const count = data.length & 0xfffffffc;
  let current = 0;
  for (let i = 8; i < count; i += 4) {
    const word = u32(data, i) | 0;
    current = ((current >>> 31) | ((current << 1) ^ word)) | 0;
  }
  return current === expected;
}

type Part = { type: number; offset: number; size: number; key: number };

function indexParts(data: Uint8Array): Map<number, Part> {
  const parts = new Map<number, Part>();
  let filePos = 8;
  while (filePos + 8 <= data.length) {
    const typeFull = u32(data, filePos);
    const partLen = u32(data, filePos + 4);
    const type = typeFull & 0xffff;
    if (type === PART.eof || partLen < 8) break;
    parts.set(type, { type, offset: filePos + 8, size: partLen - 8, key: type });
    filePos += partLen;
  }
  return parts;
}

function decryptPart(data: Uint8Array, part: Part | undefined): Part | undefined {
  if (!part || part.size <= 0) return part;
  let key = part.key | 0;
  const end = Math.min(part.offset + part.size, data.length);
  for (let pos = part.offset; pos < end; pos++) {
    const signed = (data[pos]! << 24) >> 24;
    const byt = (signed ^ key) | 0;
    key = ((key << 1) ^ byt) | 0;
    data[pos] = byt & 0xff;
  }
  return part;
}

function u32(data: Uint8Array, offset: number): number {
  return (data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)) >>> 0;
}

function cString(data: Uint8Array, offset: number, length: number): string {
  let n = 0;
  while (n < length && offset + n < data.length && data[offset + n] !== 0) n++;
  if (n === 0) return "";
  return new TextDecoder("latin1").decode(data.subarray(offset, offset + n));
}

