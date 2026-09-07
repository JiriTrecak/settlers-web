import { parseLandscape, type Landscape } from "../landscape/curve";
/**
 * Authored map file. `.utcmap` is JSON; `v` is the schema.
 * `name` is the document title. `stamps` are placed catalog assets (cell coords, optional yaw).
 * Optional `height` is base64 Int16 cm; `waterLevel` is meters (omit = 0 / flat).
 */
import { decodeHeight, encodeHeight } from "./height";
export const UTCMAP_EXT = ".utcmap";
export const UTCMAP_VERSION = 1;
export const DEFAULT_MAP_NAME = "Untitled";

export type MapStamp = {
  readonly id: string;
  readonly asset: string;
  readonly x: number;
  readonly y: number;
  /** Radians. Omitted on grid-snapped stamps. */
  readonly yaw?: number;
  /** Uniform. Omitted when 1. */
  readonly scale?: number;
  readonly elevation?: number;
  readonly variant?: "snow" | "gold" | "red" | "green";
};

export type UtcMap = {
  readonly v: typeof UTCMAP_VERSION;
  readonly name: string;
  readonly stamps: readonly MapStamp[];
  readonly waterLevel?: number;
  readonly height?: string;
  readonly landscape?: Landscape;
};

export function emptyUtcMap(): UtcMap {
  return { v: UTCMAP_VERSION, name: DEFAULT_MAP_NAME, stamps: [] };
}

export function parseUtcMap(raw: unknown): UtcMap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== UTCMAP_VERSION) return null;
  const name = parseName(o.name);
  const stamps = parseStamps(o.stamps);
  if (!name || !stamps) return null;
  const waterLevel = parseWaterLevel(o.waterLevel);
  if (waterLevel === false) return null;
  const height = parseHeight(o.height);
  if (height === false) return null;
  return {
    v: UTCMAP_VERSION,
    name,
    stamps,
    ...(parseLandscape(o.landscape) ? { landscape: parseLandscape(o.landscape) } : {}),
    ...(waterLevel !== undefined ? { waterLevel } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

export function stringifyUtcMap(map: UtcMap): string {
  const height = map.height ? encodeHeight(decodeHeight(map.height) ?? []) : undefined;
  const waterLevel = map.waterLevel && map.waterLevel !== 0 ? map.waterLevel : undefined;
  return `${JSON.stringify(
    {
      v: map.v,
      name: map.name,
      stamps: map.stamps,
      ...(map.landscape ? { landscape: map.landscape } : {}),
      ...(waterLevel !== undefined ? { waterLevel } : {}),
      ...(height ? { height } : {}),
    },
    null,
    2,
  )}\n`;
}

/** Suggested `.utcmap` filename from the document title. */
export function mapFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "untitled"}${UTCMAP_EXT}`;
}

function parseWaterLevel(raw: unknown): number | undefined | false {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
  return raw;
}

function parseHeight(raw: unknown): string | undefined | false {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !raw) return false;
  const samples = decodeHeight(raw);
  if (!samples) return false;
  const packed = encodeHeight(samples);
  return packed ?? undefined;
}

function parseName(raw: unknown): string | null {
  if (raw === undefined) return DEFAULT_MAP_NAME;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name || DEFAULT_MAP_NAME;
}

function parseStamps(raw: unknown): MapStamp[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: MapStamp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.asset !== "string") return null;
    if (typeof s.x !== "number" || typeof s.y !== "number") return null;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    const yaw = s.yaw;
    const scale = s.scale;
    if (yaw !== undefined && (typeof yaw !== "number" || !Number.isFinite(yaw))) return null;
    if (scale !== undefined && (typeof scale !== "number" || !Number.isFinite(scale))) return null;
    if(s.elevation!==undefined&&(typeof s.elevation!=='number'||!Number.isFinite(s.elevation)||Math.abs(s.elevation)>32))return null;
    if(s.variant!==undefined&&!['snow','gold','red','green'].includes(String(s.variant)))return null;
    out.push({
      id: s.id,
      asset: s.asset,
      x: s.x,
      y: s.y,
      ...(yaw !== undefined ? { yaw } : {}),
      ...(scale !== undefined && scale !== 1 ? { scale } : {}),
      ...(typeof s.elevation === "number" ? { elevation:s.elevation } : {}),
      ...(s.variant ? {variant:s.variant as MapStamp["variant"]} : {}),
    });
  }
  return out;
}
