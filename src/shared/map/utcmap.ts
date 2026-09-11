import {missionSchema, type MissionDefinition} from "../scenario/schema";
import { z } from "zod";
import {
  placementSchema,
  campSchema,
  type Placement,
  type Camp,
} from "../../content/schema";
import { parseLandscape, type Landscape } from "../landscape/curve";
/**
 * Authored map file. `.utcmap` is JSON; `v` is the schema.
 * `name` is the document title. `stamps` are placed catalog assets (cell coords, optional yaw).
 * Optional `height` is base64 Int16 cm; `waterLevel` is meters (omit = 0 / flat).
 */
import { decodeHeight, encodeHeight } from "./height";
export const UTCMAP_EXT = ".utcmap";
export const UTCMAP_VERSION = 2;
export const DEFAULT_MAP_NAME = "Untitled";

export type MapStamp = {
  readonly id: string;
  readonly asset: string;
  readonly x: number;
  readonly y: number;
  /** Radians. Omitted on grid-snapped stamps. */
  readonly yaw?: number;
  /** Tree / prop lean in radians, applied around world X and Z. */
  readonly pitch?: number;
  readonly roll?: number;
  /** Uniform. Omitted when 1. */
  readonly scale?: number;
  /** Vertical proportion multiplier, defaults to 1. */
  readonly heightScale?: number;
  readonly widthScale?: number;
  readonly depthScale?: number;
  readonly elevation?: number;
  readonly variant?: "snow" | "gold" | "red" | "green" | "pink" | "slate";
};

const startSchema = z
  .object({
    player: z.number().int().min(1).max(8),
    x: z.number().int().min(0).max(511),
    z: z.number().int().min(0).max(511),
    setup: z.string(),
    mainFort: z.string(),
  })
  .strict();
export type PlayerStart = z.infer<typeof startSchema>;

export type UtcMap = {
  readonly size: 256 | 512;
  readonly playerStarts: readonly PlayerStart[];
  readonly entities: readonly Placement[];
  readonly camps: readonly Camp[];
  readonly v: typeof UTCMAP_VERSION;
  readonly name: string;
  readonly description?: string;
  readonly mission?: MissionDefinition;
  readonly stamps: readonly MapStamp[];
  readonly waterLevel?: number;
  readonly height?: string;
  readonly landscape?: Landscape;
};

export function emptyUtcMap(size: 256 | 512 = 256): UtcMap {
  return {
    v: UTCMAP_VERSION,
    size,
    name: DEFAULT_MAP_NAME,
    stamps: [],
    entities: [],
    camps: [],
    waterLevel: -1,
    playerStarts: [1, 2].map((player) => ({
      player,
      x: player === 1 ? size - 38 : 38,
      z: player === 1 ? size - 38 : 38,
      setup: "setup.ants",
      mainFort: `start.player.${player}/main-fort`,
    })),
  };
}

export function parseUtcMap(raw: unknown): UtcMap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== UTCMAP_VERSION) return null;
  if (
    Object.keys(o).some(
      (k) =>
        ![
          "v",
          "size",
          "name",
          "description",
          "mission",
          "stamps",
          "playerStarts",
          "entities",
          "camps",
          "waterLevel",
          "height",
          "landscape",
        ].includes(k),
    )
  )
    return null;
  if (o.size !== 256 && o.size !== 512) return null;
  const size = o.size;
  const mission = missionSchema.optional().safeParse(o.mission);
  if (!mission.success) return null;
  const starts = z.array(startSchema).min(mission.data ? 1 : 2).max(8).safeParse(o.playerStarts);
  const placements = z.array(placementSchema).safeParse(o.entities),
    camps = z.array(campSchema).safeParse(o.camps);
  if (!starts.success || !placements.success || !camps.success) return null;
  const playerStarts = starts.data;
  if (
    playerStarts.some((p) => p.x >= size || p.z >= size) ||
    placements.data.some((p) => p.position.x >= size || p.position.y >= size)
  )
    return null;
  if (new Set(playerStarts.map((p) => p.player)).size !== playerStarts.length)
    return null;
  if (
    o.description !== undefined &&
    (typeof o.description !== "string" || o.description.length > 1200)
  )
    return null;
  const description =
    typeof o.description === "string" ? o.description.trim() : undefined;
  const name = parseName(o.name);
  const stamps = parseStamps(o.stamps);
  if (!name || !stamps) return null;
  const waterLevel = parseWaterLevel(o.waterLevel);
  if (waterLevel === false) return null;
  const height = parseHeight(o.height, size);
  if (height === false) return null;
  const landscape = parseLandscape(o.landscape);
  if (o.landscape !== undefined && !landscape) return null;
  return {
    v: UTCMAP_VERSION,
    size,
    name,
    ...(description ? { description } : {}),
    ...(mission.data ? {mission:mission.data} : {}),
    stamps,
    playerStarts,
    entities: placements.data,
    camps: camps.data,
    ...(landscape ? { landscape } : {}),
    ...(waterLevel !== undefined ? { waterLevel } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

export function stringifyUtcMap(map: UtcMap): string {
  const height = map.height
    ? encodeHeight(decodeHeight(map.height, map.size) ?? [], map.size)
    : undefined;
  const waterLevel =
    map.waterLevel && map.waterLevel !== 0 ? map.waterLevel : undefined;
  return `${JSON.stringify(
    {
      v: map.v,
      size: map.size,
      name: map.name,
      ...(map.description ? { description: map.description } : {}),
      ...(map.mission ? {mission:map.mission} : {}),
      stamps: map.stamps,
      playerStarts: map.playerStarts,
      entities: map.entities,
      camps: map.camps,
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

function parseHeight(raw: unknown, size: number): string | undefined | false {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !raw) return false;
  const samples = decodeHeight(raw, size);
  if (!samples) return false;
  const packed = encodeHeight(samples, size);
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
    for (const axis of [s.heightScale, s.widthScale, s.depthScale])
      if (
        axis !== undefined &&
        (typeof axis !== "number" ||
          !Number.isFinite(axis) ||
          axis < 0.25 ||
          axis > 4)
      )
        return null;
    for (const angle of [s.pitch, s.roll])
      if (
        angle !== undefined &&
        (typeof angle !== "number" ||
          !Number.isFinite(angle) ||
          Math.abs(angle) > Math.PI / 2)
      )
        return null;
    if (yaw !== undefined && (typeof yaw !== "number" || !Number.isFinite(yaw)))
      return null;
    if (
      scale !== undefined &&
      (typeof scale !== "number" || !Number.isFinite(scale))
    )
      return null;
    if (
      s.elevation !== undefined &&
      (typeof s.elevation !== "number" ||
        !Number.isFinite(s.elevation) ||
        Math.abs(s.elevation) > 32)
    )
      return null;
    if (
      s.variant !== undefined &&
      !["snow", "gold", "red", "green", "pink", "slate"].includes(
        String(s.variant),
      )
    )
      return null;
    out.push({
      id: s.id,
      asset: s.asset,
      x: s.x,
      y: s.y,
      ...(yaw !== undefined ? { yaw } : {}),
      ...(typeof s.pitch === "number" ? { pitch: s.pitch } : {}),
      ...(typeof s.roll === "number" ? { roll: s.roll } : {}),
      ...(scale !== undefined && scale !== 1 ? { scale } : {}),
      ...(typeof s.heightScale === "number"
        ? { heightScale: s.heightScale }
        : {}),
      ...(typeof s.widthScale === "number" ? { widthScale: s.widthScale } : {}),
      ...(typeof s.depthScale === "number" ? { depthScale: s.depthScale } : {}),
      ...(typeof s.elevation === "number" ? { elevation: s.elevation } : {}),
      ...(s.variant ? { variant: s.variant as MapStamp["variant"] } : {}),
    });
  }
  return out;
}
