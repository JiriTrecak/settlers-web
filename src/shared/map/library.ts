import { UTCMAP_VERSION, stringifyUtcMap, parseUtcMap, type UtcMap } from "./utcmap";
import { mapRevision, type PlayableMap } from "./playable";
import {mapOverview,mapSourceHash,hasPlayableSlots,type MapOverview} from './overview';
import generated from '../../../assets/maps/previews/index.json';
const overviews=generated as Record<string,MapOverview>;
const images=import.meta.glob('../../../assets/maps/previews/*.webp',{query:'?url',import:'default',eager:true}) as Record<string,string>;
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
  overview?:MapOverview;
  previewUrl?:string;
};
export const LOCAL_MAPS_KEY = "utc.authored-maps.threewater-1";
function entry(id: string, map: UtcMap, source: MapEntry["source"]): MapEntry {
  let revision:string|undefined;
  return {
    id,
    name: map.name,
    map,
    source,
    get revision(){return revision??=mapRevision(map);},
    players: map.playerStarts?.length ?? 0,
    overview:mapOverview(map),
  };
}
const project:MapEntry[] = Object.entries(sources).filter(([,raw])=>{
 // Retired procedural documents are not playable maps. New maps contain only
 // committed cells and placements; there is deliberately no migration path.
 return JSON.parse(raw).v===UTCMAP_VERSION;
}).map(([path, raw]) => {
  const id=path.split('/').pop()!.replace('.utcmap','').toLowerCase();
  let parsed:UtcMap|undefined,revision:string|undefined;
  const load=()=>{if(!parsed){parsed=parseUtcMap(JSON.parse(raw))??undefined;if(!parsed)throw Error(`Invalid authored map: ${path}`);}return parsed;};
  const saved=overviews[id],overview=saved?.sourceHash===mapSourceHash(raw)?saved:mapOverview(load(),raw);
  return {id,name:overview.name,source:'project' as const,players:overview.starts.length,overview,
    previewUrl:overview.image?images[`../../../assets/maps/previews/${overview.image}`]:undefined,
    get map(){return load();},get revision(){return revision??=mapRevision(load());}};
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
  return authoredMaps().filter((m) => {const info=overviewOf(m);return !info.mission&&hasPlayableSlots(info);}) as (MapEntry & {
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
    JSON.stringify(maps.map(({ id, map }) => ({ id, map:JSON.parse(stringifyUtcMap(map)) }))),
  );
  return id;
}

export function overviewOf(entry:MapEntry):MapOverview{return entry.overview??mapOverview(entry.map);}
export function missionMaps(campaign?:string):MapEntry[]{return authoredMaps().filter(m=>{const info=overviewOf(m);return info.mission&&(!campaign||info.mission.campaign===campaign)&&hasPlayableSlots(info);}).sort((a,b)=>overviewOf(a).mission!.order-overviewOf(b).mission!.order);}
