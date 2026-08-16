import buildingsJson from "./buildings.json";
import type { BuildingEntry, CatalogRef } from "./types";

export type { BuildingEntry, CatalogRef, Civ } from "./types";
export { catalogId, originKey } from "./types";

export const buildings: BuildingEntry[] = buildingsJson.buildings as BuildingEntry[];

const byId = new Map(buildings.map((b) => [b.id, b]));

export function buildingById(id: string): BuildingEntry | undefined {
  return byId.get(id);
}

/** Resolve "lumberjack", "roman lumberjack", "building/roman/lumberjack". */
export function findBuildings(query: string): BuildingEntry[] {
  const q = query.trim().toLowerCase().replace(/^building\//, "");
  if (!q) return [];
  const exact = byId.get(`building/${q}`) ?? byId.get(q);
  if (exact) return [exact];
  const parts = q.split(/[/.\s]+/).filter(Boolean);
  return buildings.filter((b) => {
    const hay = `${b.civ} ${b.building} ${b.id}`;
    return parts.every((p) => hay.includes(p));
  });
}

export function labelForSequence(file: number, sequence: number): string | null {
  const hits = buildings.filter(
    (b) =>
      b.built.some((r) => r.file === file && r.sequence === sequence) ||
      b.scaffold.some((r) => r.file === file && r.sequence === sequence),
  );
  if (hits.length === 0) return null;
  return hits.map((b) => `${b.civ}/${b.building}`).join(", ");
}

export function primaryRef(entry: BuildingEntry): CatalogRef | null {
  return entry.built[0] ?? entry.scaffold[0] ?? entry.gui;
}
