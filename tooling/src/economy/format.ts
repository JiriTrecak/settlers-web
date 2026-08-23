/**
 * Authoring file for buildings. Canonical copy lives at
 * `assets/game_data/buildings.json` (tools Save/Load). World does not ingest
 * this yet. Construction wood is stored as `plank`; the UI labels it Lumber.
 */
import { DIRECTIONS, type Direction } from "../../../src/shared";
import { isWorker, jobOf, parseJob, type Job } from "./job";

export const BUILDINGS_FORMAT = "forest-empire.buildings";
export const BUILDINGS_VERSION = 1;

export const CIVS = ["roman", "egyptian", "asian", "amazon"] as const;
export type Civ = (typeof CIVS)[number];

export const CIV_LABEL: Record<Civ, string> = {
  roman: "Roman",
  egyptian: "Egyptian",
  asian: "Asian",
  amazon: "Amazon",
};

export type Rel = { dx: number; dy: number };
export type DirRel = Rel & { direction: Direction };
export type StackSlot = Rel & { material: string; required?: number };

export type BuildingDraft = {
  /** Stable slug, unique within `civ`. Same id across civs is the same hut. */
  id: string;
  civ: Civ;
  name: string;
  /** Catalog group for the finished hut, e.g. `buildings/roman/lumberjack`. */
  built: string;
  /** Catalog group for the scaffold. Often the same group, variant `scaffold`. */
  scaffold: string;
  plank: number;
  stone: number;
  /** Walk-blocked iso cells, relative to origin. Same as the sim `blocked` set. */
  blocked: Rel[];
  /** Placement occupancy. Superset of `blocked` (XML `block="false"` skirt). */
  protected: Rel[];
  /** Fence-post cells (`buildmark`). Authored, not inferred from the plot. */
  buildMarks: Rel[];
  /** Diggers level the plot. `false` for mines. Omit in old saves → true. */
  flatten: boolean;
  /** Occupying profession. Null for house / military / store. */
  worker: string | null;
  viewDistance: number;
  ground: string[];
  door: Rel;
  flag: Rel;
  workSpot: DirRel | null;
  workCenter: Rel | null;
  requestStacks: StackSlot[];
  offerStacks: StackSlot[];
  job: Job;
};

export type BuildingsFile = {
  format: typeof BUILDINGS_FORMAT;
  version: number;
  buildings: BuildingDraft[];
};

export function emptyBuildingsFile(): BuildingsFile {
  return { format: BUILDINGS_FORMAT, version: BUILDINGS_VERSION, buildings: [] };
}

export function emptyDraft(civ: Civ, id: string): BuildingDraft {
  return {
    id,
    civ,
    name: "New building",
    built: "",
    scaffold: "",
    plank: 0,
    stone: 0,
    blocked: [],
    protected: [],
    buildMarks: [],
    flatten: true,
    worker: null,
    viewDistance: 0,
    ground: ["grass", "earth", "flattened"],
    door: { dx: 0, dy: 0 },
    flag: { dx: 0, dy: 0 },
    workSpot: null,
    workCenter: null,
    requestStacks: [],
    offerStacks: [],
    job: jobOf(id),
  };
}

export function isCiv(value: string): value is Civ {
  return (CIVS as readonly string[]).includes(value);
}

export function uniqueId(buildings: readonly BuildingDraft[], civ: Civ, base: string): string {
  const slug = slugify(base) || "building";
  const taken = new Set(buildings.filter((b) => b.civ === civ).map((b) => b.id));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function prettyName(id: string): string {
  return id.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function relKey(r: Rel): string {
  return `${r.dx},${r.dy}`;
}

export function copyRels(rs: readonly Rel[]): Rel[] {
  return rs.map((r) => ({ dx: r.dx, dy: r.dy }));
}

export function hasRel(rs: readonly Rel[], dx: number, dy: number): boolean {
  return rs.some((r) => r.dx === dx && r.dy === dy);
}

export function setRel(rs: readonly Rel[], dx: number, dy: number, on: boolean): Rel[] {
  const next = rs.filter((r) => r.dx !== dx || r.dy !== dy);
  if (on) next.push({ dx, dy });
  return next;
}

export function setStack(rs: readonly StackSlot[], dx: number, dy: number, on: boolean, material: string): StackSlot[] {
  const next = rs.filter((r) => r.dx !== dx || r.dy !== dy);
  if (on) next.push({ dx, dy, material });
  return next;
}

export function parseBuildingsFile(raw: unknown): BuildingsFile | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== BUILDINGS_FORMAT) return null;
  if (typeof o.version !== "number" || o.version < 1) return null;
  if (!Array.isArray(o.buildings)) return null;
  const buildings: BuildingDraft[] = [];
  for (const item of o.buildings) {
    const b = parseDraft(item);
    if (!b) return null;
    buildings.push(b);
  }
  return { format: BUILDINGS_FORMAT, version: BUILDINGS_VERSION, buildings };
}

/** Pretty file, but each cell object stays on one line so occupancy diffs stay readable. */
export function serializeBuildingsFile(file: BuildingsFile): string {
  const json = JSON.stringify({ ...file, format: BUILDINGS_FORMAT, version: BUILDINGS_VERSION }, null, 2);
  return `${compactCells(json)}\n`;
}

function compactCells(json: string): string {
  return json
    .replace(
      /\{\s*"dx": (-?\d+),\s*"dy": (-?\d+),\s*"material": "([^"]+)",\s*"required": (\d+)\s*\}/g,
      '{"dx": $1, "dy": $2, "material": "$3", "required": $4}',
    )
    .replace(
      /\{\s*"dx": (-?\d+),\s*"dy": (-?\d+),\s*"material": "([^"]+)"\s*\}/g,
      '{"dx": $1, "dy": $2, "material": "$3"}',
    )
    .replace(
      /\{\s*"dx": (-?\d+),\s*"dy": (-?\d+),\s*"direction": "([a-z]+)"\s*\}/g,
      '{"dx": $1, "dy": $2, "direction": "$3"}',
    )
    .replace(/\{\s*"dx": (-?\d+),\s*"dy": (-?\d+)\s*\}/g, '{"dx": $1, "dy": $2}');
}

function parseDraft(raw: unknown): BuildingDraft | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) return null;
  if (typeof o.civ !== "string" || !isCiv(o.civ)) return null;
  if (typeof o.name !== "string") return null;
  if (typeof o.built !== "string") return null;
  if (typeof o.scaffold !== "string") return null;
  const plank = asCount(o.plank);
  const stone = asCount(o.stone);
  if (plank == null || stone == null) return null;
  return {
    id: o.id,
    civ: o.civ,
    name: o.name,
    built: o.built,
    scaffold: o.scaffold,
    plank,
    stone,
    blocked: asRels(o.blocked),
    protected: asRels(o.protected),
    buildMarks: asRels(o.buildMarks),
    flatten: o.flatten === false ? false : true,
    worker: typeof o.worker === "string" && isWorker(o.worker) ? o.worker : typeof o.worker === "string" && o.worker ? o.worker : null,
    viewDistance: asCount(o.viewDistance) ?? 0,
    ground: asGrounds(o.ground),
    door: asRel(o.door) ?? { dx: 0, dy: 0 },
    flag: asRel(o.flag) ?? { dx: 0, dy: 0 },
    workSpot: asDirRel(o.workSpot),
    workCenter: asRel(o.workCenter),
    requestStacks: asStacks(o.requestStacks),
    offerStacks: asStacks(o.offerStacks),
    job: parseJob(o.job) ?? jobOf(o.id),
  };
}

function asRels(value: unknown): Rel[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  const out: Rel[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item == null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.dx !== "number" || typeof r.dy !== "number") continue;
    if (!Number.isFinite(r.dx) || !Number.isFinite(r.dy)) continue;
    const rel = { dx: Math.trunc(r.dx), dy: Math.trunc(r.dy) };
    const k = relKey(rel);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rel);
  }
  return out;
}

function asRel(value: unknown): Rel | null {
  if (typeof value !== "object" || value == null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.dx !== "number" || typeof r.dy !== "number") return null;
  if (!Number.isFinite(r.dx) || !Number.isFinite(r.dy)) return null;
  return { dx: Math.trunc(r.dx), dy: Math.trunc(r.dy) };
}

function asDirRel(value: unknown): DirRel | null {
  const rel = asRel(value);
  if (!rel || typeof value !== "object" || value == null) return null;
  const dir = (value as Record<string, unknown>).direction;
  if (typeof dir !== "string" || !isDirection(dir)) return { ...rel, direction: "ne" };
  return { ...rel, direction: dir };
}

function asStacks(value: unknown): StackSlot[] {
  if (value == null || !Array.isArray(value)) return [];
  const out: StackSlot[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const rel = asRel(item);
    if (!rel) continue;
    const material = typeof item === "object" && item != null ? (item as Record<string, unknown>).material : null;
    if (typeof material !== "string" || !material) continue;
    const k = relKey(rel);
    if (seen.has(k)) continue;
    seen.add(k);
    const required =
      typeof item === "object" && item != null ? (item as Record<string, unknown>).required : undefined;
    const slot: StackSlot = { ...rel, material };
    if (typeof required === "number" && Number.isFinite(required) && required > 0) slot.required = Math.floor(required);
    out.push(slot);
  }
  return out;
}

function asGrounds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return ["grass", "earth", "flattened"];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item && !out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : ["grass", "earth", "flattened"];
}

function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}
