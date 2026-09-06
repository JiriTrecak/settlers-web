/**
 * Authored map file. `.utcmap` is JSON; `v` is the schema.
 * `name` is the document title. `stamps` are placed catalog assets (cell coords, optional yaw).
 */
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
};

export type UtcMap = {
  readonly v: typeof UTCMAP_VERSION;
  readonly name: string;
  readonly stamps: readonly MapStamp[];
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
  return { v: UTCMAP_VERSION, name, stamps };
}

export function stringifyUtcMap(map: UtcMap): string {
  return `${JSON.stringify({ v: map.v, name: map.name, stamps: map.stamps }, null, 2)}\n`;
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
    out.push({
      id: s.id,
      asset: s.asset,
      x: s.x,
      y: s.y,
      ...(yaw !== undefined ? { yaw } : {}),
      ...(scale !== undefined && scale !== 1 ? { scale } : {}),
    });
  }
  return out;
}
