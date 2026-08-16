import { parseOriginalMap, type MapCatalogEntry, type ParsedOriginalMap } from "../assets/map";

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

export async function fetchOriginalMap(file: string): Promise<ParsedOriginalMap> {
  const path = file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const res = await fetch(`/maps/${path}`);
  if (!res.ok) throw new Error(`map ${file}: ${res.status}`);
  return parseOriginalMap(await res.arrayBuffer());
}
