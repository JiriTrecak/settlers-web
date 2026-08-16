import {
  decorationsFromDumpedMap,
  gridFromDumpedMap,
  isDumpedMap,
  type DumpedMap,
  type MapCatalogEntry,
} from "../../sim/map/dumpedMap";
import type { MapDecoration } from "../../sim/decorations/decorations";
import type { MapGrid } from "../../sim/map/mapGrid";

export type { MapCatalogEntry, MapGroup } from "../../sim/map/dumpedMap";

export async function fetchMapCatalog(): Promise<MapCatalogEntry[]> {
  try {
    const res = await fetch("/maps/catalog.json");
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("maps" in data)) return [];
    const maps = (data as { maps: unknown }).maps;
    return Array.isArray(maps) ? (maps as MapCatalogEntry[]) : [];
  } catch {
    return [];
  }
}

export async function fetchDumpedMap(file: string): Promise<{ grid: MapGrid; decorations: MapDecoration[] }> {
  const path = file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const res = await fetch(`/maps/${path}`);
  if (!res.ok) throw new Error(`map ${file}: ${res.status}`);
  const data: unknown = await res.json();
  if (!isDumpedMap(data)) throw new Error(`map ${file}: bad dump`);
  return { grid: gridFromDumpedMap(data), decorations: decorationsFromDumpedMap(data) };
}

export type { DumpedMap };
