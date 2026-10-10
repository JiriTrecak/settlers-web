import {BIOMES, type MapSize} from '../../content/biomes';
import {missionSchema, type MissionDefinition} from "../scenario/schema";
import {savedSceneSchema,type SavedScene} from '../authoring/layers';
import {flatTerrainData} from './terrainData';
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
 * Terrain and local water are explicit committed samples in authoring.terrain.
 */
export const UTCMAP_EXT = ".utcmap";
export const UTCMAP_VERSION = 3;
export const DEFAULT_MAP_NAME = "Untitled";

export type MapStamp = {
  readonly locked?: boolean;
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
  /** Authored source transform; avoids re-grounding imported models or losing quaternion precision. */
  readonly sourceTransform?: {height:number;quaternion:[number,number,number,number];packedUserData?:[number,number,number]};
  /** Navigation level, optional absolute center height, and explicit end connections. */
  readonly walk?: {readonly mesh?:{positions:[number,number,number][];indices:number[]};readonly level:number;readonly height?:number;readonly connections?:{readonly start?:number;readonly end?:number}};
  readonly variant?: "snow" | "gold" | "red" | "green" | "pink" | "slate";
};

const startSchema = z
  .object({
    player: z.number().int().min(1).max(8),
    x: z.number().multipleOf(.5).min(0).max(2047),
    z: z.number().multipleOf(.5).min(0).max(2047),
    rotation: z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]).optional(),
    setup: z.string(),
    mainFort: z.string(),
  })
  .strict();
export type PlayerStart = z.infer<typeof startSchema>;

export type UtcMap = {
  readonly size: MapSize;
  readonly biome?: string;
  readonly playerStarts: readonly PlayerStart[];
  readonly entities: readonly Placement[];
  readonly camps: readonly Camp[];
  readonly v: typeof UTCMAP_VERSION;
  readonly name: string;
  readonly description?: string;
  readonly mission?: MissionDefinition;
  /** Local, fully revealed testbed: authored entities only, no opponents or victory rules. */
  readonly sandbox?: boolean;
  readonly stamps: readonly MapStamp[];
  readonly landscape?: Landscape;
  /** Committed editable terrain and placed objects. Generator previews are editor-only. */
  readonly authoring: SavedScene;
};

export function emptyUtcMap(size: MapSize = 256): UtcMap {
  return {
    v: UTCMAP_VERSION,
    size,
    name: DEFAULT_MAP_NAME,
    authoring:{version:1,terrain:flatTerrainData(size),objects:[]},
    stamps: [],
    entities: [],
    camps: [],

    playerStarts: [1, 2].map((player) => ({
      player,
      x: player === 1 ? size - 38.5 : 37.5,
      z: player === 1 ? size - 38.5 : 37.5,
      setup: "setup.ants",
      mainFort: `start.player.${player}/main-fort`,
    })),
  };
}

/** Parsed map, or null when invalid. Use readUtcMap for the reason. */
export function parseUtcMap(raw: unknown): UtcMap | null {
  const read = readUtcMap(raw);
  return "map" in read ? read.map : null;
}

/** First Zod issue as `path: message`, so a rejected map names the offending field. */
function issue(label: string, error: z.ZodError): string {
  const first = error.issues[0];
  return `${[label, ...(first?.path ?? [])].join(".")}: ${first?.message ?? "invalid"}`;
}

/** Validate a `.utcmap` document; on rejection, say which field failed and why. */
export function readUtcMap(raw: unknown): { map: UtcMap } | { error: string } {
  const fail = (error: string) => ({ error });
  if (!raw || typeof raw !== "object") return fail("Map must be a JSON object");
  const o = raw as Record<string, unknown>;
  if (o.v !== UTCMAP_VERSION) return fail(`v: expected ${UTCMAP_VERSION}, got ${JSON.stringify(o.v)}`);
  const unknown = Object.keys(o).find(
    (k) =>
      ![
          "v",
          "size",
          "name",
          "description",
          "mission",
          "sandbox",
          "stamps",
          "playerStarts",
          "entities",
          "camps",
          "waterLevel",
          "height",
          "landscape",
          "authoring",
          "biome",
        ].includes(k),
  );
  if (unknown) return fail(`Unknown top-level key: ${unknown}`);
  if (o.size !== 256 && o.size !== 512 && o.size !== 1024 && o.size !== 2048) return fail(`size: must be 256, 512, 1024 or 2048, got ${JSON.stringify(o.size)}`);
  if (o.biome !== undefined && !BIOMES.some(b => b.id === o.biome)) return fail(`biome: unknown ${JSON.stringify(o.biome)}`);
  const size = o.size;
  const mission = missionSchema.optional().safeParse(o.mission);
  if (!mission.success) return fail(issue("mission", mission.error));
  const authoring=savedSceneSchema.safeParse(o.authoring);
  if(!authoring.success)return fail(issue("authoring", authoring.error));
  if(authoring.data?.terrain&&authoring.data.terrain.size!==size)return fail('authoring.terrain.size: must match map size');
  if (o.sandbox !== undefined && typeof o.sandbox !== "boolean") return fail("sandbox: must be a boolean");
  if (o.sandbox && mission.data) return fail("A testbed (sandbox) cannot also be a mission");
  const starts = z.array(startSchema).min(mission.data || o.sandbox ? 1 : 2).max(o.sandbox ? 1 : 8).safeParse(o.playerStarts);
  if (o.sandbox && starts.success && starts.data[0].player !== 1) return fail("playerStarts.0.player: a testbed uses player 1");
  const placements = z.array(placementSchema).safeParse(o.entities),
    camps = z.array(campSchema).safeParse(o.camps);
  if (!starts.success) return fail(issue("playerStarts", starts.error));
  if (!placements.success) return fail(issue("entities", placements.error));
  if (!camps.success) return fail(issue("camps", camps.error));
  const playerStarts = starts.data;
  const outside = playerStarts.find((p) => p.x >= size || p.z >= size);
  if (outside) return fail(`playerStarts: player ${outside.player} at ${outside.x},${outside.z} is outside the ${size} map`);
  const stray = placements.data.find((p) => p.position.x >= size || p.position.y >= size);
  if (stray) return fail(`entities: ${stray.id} at ${stray.position.x},${stray.position.y} is outside the ${size} map`);
  if (new Set(playerStarts.map((p) => p.player)).size !== playerStarts.length)
    return fail("playerStarts: duplicate player number");
  if (
    o.description !== undefined &&
    (typeof o.description !== "string" || o.description.length > 1200)
  )
    return fail("description: must be a string of at most 1200 characters");
  const description =
    typeof o.description === "string" ? o.description.trim() : undefined;
  const name = parseName(o.name);
  const stamps = parseStamps(o.stamps);
  if (!name) return fail("name: must be a string");
  if (!stamps) {
    const bad = Array.isArray(o.stamps) ? o.stamps.findIndex((item) => !parseStamps([item])) : -1;
    return fail(bad < 0 ? "stamps: must be an array" : `stamps.${bad}: invalid stamp ${JSON.stringify((o.stamps as {id?: unknown}[])[bad]?.id ?? null)}`);
  }
  if(o.height!==undefined||o.waterLevel!==undefined)return fail('Terrain must be stored as committed cells, not legacy height/water fields');
  const rawLandscape=o.landscape as Record<string,unknown>|undefined;
  if(rawLandscape&&(!rawLandscape||typeof rawLandscape!=='object'||Object.keys(rawLandscape).some(k=>!['environment','water','decals'].includes(k))))return fail('landscape: only environment, water appearance and placed decals belong in a saved map');
  const landscape = rawLandscape?parseLandscape({...rawLandscape,strokes:[],cover:[]}):undefined;
  if (o.landscape !== undefined && !landscape) return fail("landscape: invalid strokes, cover or environment");
  if(landscape&&(landscape.strokes.length||landscape.cover.length||landscape.rivers?.length||landscape.importedTerrain))return fail('Generator inputs do not belong in a saved map');
  return { map: {
    v: UTCMAP_VERSION,
    size,
    name,
    ...(typeof o.biome === "string" ? {biome: o.biome} : {}),
    ...(description ? { description } : {}),
    ...(mission.data ? {mission:mission.data} : {}),
    ...(o.sandbox ? {sandbox:true} : {}),
    stamps,
    playerStarts,
    entities: placements.data,
    camps: camps.data,
    ...(landscape ? { landscape } : {}),
    authoring:authoring.data,
  } };
}

export function stringifyUtcMap(map: UtcMap): string {
  if(!map.authoring?.terrain)throw Error('Map has no committed terrain cells');
  if(map.authoring.terrain.size!==map.size)throw Error('Committed terrain dimensions must match map size');
  if('height' in map||'waterLevel' in map)throw Error('Legacy terrain fields cannot be saved');
  const landscape=map.landscape;
  if(landscape&&(landscape.strokes.length||landscape.cover.length||landscape.rivers?.length||landscape.importedTerrain))throw Error('Apply generator results before saving the map');
  return `${JSON.stringify(
    {
      v: map.v,
      size: map.size,
      name: map.name,
      ...(map.biome ? {biome: map.biome} : {}),
      ...(map.description ? { description: map.description } : {}),
      ...(map.mission ? {mission:map.mission} : {}),
      ...(map.sandbox ? {sandbox:true} : {}),
      stamps: map.stamps,
      playerStarts: map.playerStarts,
      entities: map.entities,
      camps: map.camps,
      ...(map.landscape ? { landscape: {environment:map.landscape.environment,...(map.landscape.water?{water:map.landscape.water}:{}),...(map.landscape.decals?.length?{decals:map.landscape.decals}:{})} } : {}),
      ...(map.authoring?{authoring:savedSceneSchema.parse(map.authoring)}:{}),

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

function parseName(raw: unknown): string | null {
  if (raw === undefined) return DEFAULT_MAP_NAME;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name || DEFAULT_MAP_NAME;
}

const level=z.number().int().min(0).max(31);
const walkMeshSchema=z.object({positions:z.array(z.tuple([z.number().finite(),z.number().finite(),z.number().finite()])).min(3).max(4096),indices:z.array(z.number().int().nonnegative()).min(3).max(24576)}).strict().refine(m=>m.indices.length%3===0&&m.indices.every(i=>i<m.positions.length));
export const walkStampSchema=z.object({mesh:walkMeshSchema.optional(),level:level.min(1),height:z.number().finite().min(-16).max(64).optional(),connections:z.object({start:level.optional(),end:level.optional()}).strict().optional()}).strict();
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
    if(s.locked!==undefined&&typeof s.locked!=="boolean")return null;
    const walk=walkStampSchema.optional().safeParse(s.walk);if(!walk.success)return null;
    const sourceTransform=z.object({packedUserData:z.tuple([z.number().int().min(0).max(255),z.number().int().min(0).max(255),z.number().int().min(0).max(255)]).optional(),height:z.number().finite(),quaternion:z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]).refine(q=>Math.abs(Math.hypot(...q)-1)<.001)}).strict().optional().safeParse(s.sourceTransform);
    if(!sourceTransform.success)return null;
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
      ...(s.locked!==undefined?{locked:s.locked as boolean}:{}),
      asset: s.asset,
      ...(walk.data?{walk:walk.data}:{}),
      ...(sourceTransform.data?{sourceTransform:sourceTransform.data}:{}),
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
