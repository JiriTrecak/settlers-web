import { parseUtcMap, type UtcMap } from "./utcmap";
import { mapRevision, playableMapError, type PlayableMap } from "./playable";
const sources = import.meta.glob("../../../assets/maps/**/*.utcmap", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
export type MapEntry = {
  id: string;
  name: string;
  map: UtcMap;
  revision: string;
  players: number;
  source: "project" | "local";
};
const key = "utc.authored-maps.worldroot-1";
function entry(id: string, map: UtcMap, source: MapEntry["source"]): MapEntry {
  return {
    id,
    name: map.name,
    map,
    source,
    revision: mapRevision(map),
    players: map.playerStarts?.length ?? 0,
  };
}
const project = Object.entries(sources).map(([path, raw]) => {
  const map = parseUtcMap(JSON.parse(raw));
  if (!map) throw new Error(`Invalid authored map: ${path}`);
  return entry(
    path.split("/").pop()!.replace(".utcmap", "").toLowerCase(),
    map,
    "project",
  );
});
export function authoredMaps(): MapEntry[] {
  const maps = new Map(project.map((m) => [m.id, m]));
  try {
    for (const item of JSON.parse(localStorage.getItem(key) ?? "[]")) {
      const map = parseUtcMap(item.map);
      if (map && typeof item.id === "string")
        maps.set(item.id, entry(item.id, map, "local"));
    }
  } catch {
    /* Storage unavailable or damaged: project files remain available. */
  }
  return [...maps.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function playableMaps(): (MapEntry & { map: PlayableMap })[] {
  return authoredMaps().filter((m) => !playableMapError(m.map)) as (MapEntry & {
    map: PlayableMap;
  })[];
}
export function getMap(id: string): MapEntry {
  const found = authoredMaps().find((m) => m.id === id);
  if (!found) throw new Error(`Map not found: ${id}`);
  return found;
}
export function rememberAuthoredMap(map: UtcMap): void {
  const id =
    map.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";
  const maps = authoredMaps().filter(
    (m) => m.source === "local" && m.id !== id,
  );
  maps.push(entry(id, map, "local"));
  localStorage.setItem(
    key,
    JSON.stringify(maps.map(({ id, map }) => ({ id, map }))),
  );
}
