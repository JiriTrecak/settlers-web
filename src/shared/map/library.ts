import { parseUtcMap, type UtcMap } from "./utcmap";
import { mapRevision, playableMapError, type PlayableMap } from "./playable";
const sources = import.meta.glob("../../../assets/maps/{campaign,skirmish,showcase}/**/*.utcmap", {
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
export const LOCAL_MAPS_KEY = "utc.authored-maps.threewater-1";
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
    for (const item of JSON.parse(localStorage.getItem(LOCAL_MAPS_KEY) ?? "[]")) {
      const map = parseUtcMap(item.map);
      if (map && typeof item.id === "string") {
        const id = item.id.startsWith("local:") ? item.id : `local:${item.id}`;
        const local = entry(id, map, "local");
        local.name = `${map.name} (local copy)`;
        maps.set(id, local);
      }
    }
  } catch {
    /* Storage unavailable or damaged: project files remain available. */
  }
  return [...maps.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function playableMaps(): (MapEntry & { map: PlayableMap })[] {
  return authoredMaps().filter((m) => !m.map.mission && !playableMapError(m.map)) as (MapEntry & {
    map: PlayableMap;
  })[];
}
export function getMap(id: string): MapEntry {
  const found = authoredMaps().find((m) => m.id === id);
  if (!found) throw new Error(`Map not found: ${id}`);
  return found;
}
export function rememberAuthoredMap(map: UtcMap): string {
  const slug =
    map.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";
  const id = `local:${slug}`;
  const maps = authoredMaps().filter(
    (m) => m.source === "local" && m.id !== id,
  );
  maps.push(entry(id, map, "local"));
  localStorage.setItem(
    LOCAL_MAPS_KEY,
    JSON.stringify(maps.map(({ id, map }) => ({ id, map }))),
  );
  return id;
}

export function missionMaps(campaign?:string):MapEntry[]{return authoredMaps().filter(m=>m.map.mission && (!campaign || m.map.mission.campaign===campaign) && !playableMapError(m.map)).sort((a,b)=>a.map.mission!.order-b.map.mission!.order);}
