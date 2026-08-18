/**
 * Fetch catalog + dumped maps from `/maps`. Sim parses; this is the HTTP edge.
 */
import { MAPS } from "../../sim/map/generateIsland";
import {
  gridFromDumpedMap,
  isDumpedMap,
  startsFromDumpedMap,
  type MapCatalogEntry,
  type MapStart,
} from "../../sim/map/dumpedMap";
import { objectsFromDumpedMap, type ObjectGrid } from "../../sim/object/object";
import type { MapGrid } from "../../sim/map/mapGrid";
import type { MapOption } from "../../ui/menu/menu";

export type { DumpedMap, MapCatalogEntry, MapGroup } from "../../sim/map/dumpedMap";

export async function fetchMapCatalog(): Promise<MapCatalogEntry[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}maps/catalog.json`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("maps" in data)) return [];
    const maps = (data as { maps: unknown }).maps;
    return Array.isArray(maps) ? (maps as MapCatalogEntry[]) : [];
  } catch {
    // Dev without dumps: generated maps still show in the picker.
    return [];
  }
}

export async function fetchDumpedMap(
  file: string,
): Promise<{ grid: MapGrid; objects: ObjectGrid; starts: MapStart[] }> {
  // Nested paths in the catalog (`tutorial/foo.json`) need each segment encoded.
  const path = file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const res = await fetch(`${import.meta.env.BASE_URL}maps/${path}`);
  if (!res.ok) throw new Error(`map ${file}: ${res.status}`);
  const data: unknown = await res.json();
  if (!isDumpedMap(data)) throw new Error(`map ${file}: bad dump`);
  return {
    grid: gridFromDumpedMap(data),
    objects: objectsFromDumpedMap(data),
    starts: startsFromDumpedMap(data),
  };
}

export function mapPickerOptions(catalog: readonly MapCatalogEntry[]): MapOption[] {
  return [
    ...catalog.map((m) => ({
      id: m.id,
      name: m.name,
      group: m.group,
      detail: `${m.size} · ${m.players}p`,
      players: Math.max(1, m.players | 0),
    })),
    ...MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      group: "generated" as const,
      detail: String(m.size),
      players: 1,
    })),
  ];
}

export function defaultMapId(catalog: readonly MapCatalogEntry[]): string {
  return catalog.find((m) => m.group === "tutorial")?.id ?? catalog[0]?.id ?? MAPS[0].id;
}

export const FALLBACK_MAP_ID = MAPS[0].id;
