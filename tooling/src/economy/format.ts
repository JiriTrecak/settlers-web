/**
 * Authoring file for buildings. Not ingested by World yet — this is the
 * editor's save format. Construction wood is stored as `plank` (the good);
 * the UI labels it Lumber.
 */
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
  return { id, civ, name: "New building", built: "", scaffold: "", plank: 0, stone: 0 };
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

export function serializeBuildingsFile(file: BuildingsFile): string {
  return `${JSON.stringify({ ...file, format: BUILDINGS_FORMAT, version: BUILDINGS_VERSION }, null, 2)}\n`;
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
  return { id: o.id, civ: o.civ, name: o.name, built: o.built, scaffold: o.scaffold, plank, stone };
}

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}
