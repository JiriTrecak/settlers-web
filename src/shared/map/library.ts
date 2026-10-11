import { stringifyUtcMap, parseUtcMap, type UtcMap } from "./utcmap";
import { mapRevision } from "./playable";
import {mapOverview,mapSourceHash,hasPlayableSlots,type MapOverview} from './overview';
import generated from '../../../assets/maps/previews/index.json';
const overviews=generated as Record<string,MapOverview>;
const images=import.meta.glob('../../../assets/maps/previews/*.webp',{query:'?url',import:'default',eager:true}) as Record<string,string>;
const sources = import.meta.glob("../../../assets/maps/{campaign,skirmish,showcase}/**/*.utcmap", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;
export type MapEntry = {
  id: string;
  name: string;
  players: number;
  source: "project" | "preview";
  overview:MapOverview;
  previewUrl?:string;
};
export type LoadedMapEntry=MapEntry & {map:UtcMap;revision:string};
const previews=new Map<string,MapEntry>();
const loaders=new WeakMap<MapEntry,()=>Promise<LoadedMapEntry>>();
function loadedEntry(item:MapEntry,map:UtcMap):LoadedMapEntry{
 let revision:string|undefined;
 return {...item,map,get revision(){return revision??=mapRevision(map);}};
}
function entry(id:string,map:UtcMap,source:MapEntry['source']):MapEntry{
 const item:MapEntry={id,name:map.name,source,players:map.playerStarts.length,overview:mapOverview(map)};
 const loaded=loadedEntry(item,map);loaders.set(item,async()=>loaded);return item;
}
const project:MapEntry[]=Object.entries(sources).map(([path,read])=>{
 const id=path.split('/').pop()!.replace('.utcmap','').toLowerCase(),overview=overviews[id];
 if(!overview)throw Error(`Missing map overview for ${id}. Run npm run maps:previews.`);
 const item:MapEntry={id,name:overview.name,source:'project',players:overview.starts.length,overview,
  previewUrl:overview.image?images[`../../../assets/maps/previews/${overview.image}`]:undefined};
 let pending:Promise<LoadedMapEntry>|undefined;
 loaders.set(item,()=>pending??=(async()=>{
  const raw=await read(),map=parseUtcMap(JSON.parse(raw));
  if(!map)throw Error(`Invalid authored map: ${path}`);
  if(item.overview.sourceHash!==mapSourceHash(raw)){
   item.overview=mapOverview(map,raw);item.name=map.name;item.players=map.playerStarts.length;item.previewUrl=undefined;
  }
  return loadedEntry(item,map);
 })().catch(error=>{pending=undefined;throw error;}));
 return item;
});
/** Loading a selection is explicit and shared by editor, local play and network play.
 * Concurrent requests share one parse; failures can be retried. Project browsing loads no terrain. */
export function loadMap(id:string):Promise<LoadedMapEntry>{const item=getMap(id);return loaders.get(item)!();}
export function authoredMaps(): MapEntry[] {
 return [...project].sort((a,b)=>a.name.localeCompare(b.name));
}
export function playableMaps():MapEntry[]{return authoredMaps().filter(m=>!m.overview.mission&&hasPlayableSlots(m.overview));}
export function getMap(id: string): MapEntry {
  const found = previews.get(id) ?? project.find((m) => m.id === id);
  if (!found) throw new Error(`Map not found: ${id}`);
  return found;
}
/** A test session is memory-only and never appears in map or campaign pickers. */
export function registerMapPreview(map:UtcMap):string {
 const saved=parseUtcMap(JSON.parse(stringifyUtcMap(map)));
 if(!saved)throw Error('Cannot preview an invalid map');
 const id=`preview:${crypto.randomUUID()}`;
 previews.set(id,entry(id,saved,'preview'));
 return id;
}
export function releaseMapPreview(id:string):void {previews.delete(id);}

export function overviewOf(entry:MapEntry):MapOverview{return entry.overview;}
export function missionMaps(campaign?:string):MapEntry[]{return authoredMaps().filter(m=>{const info=overviewOf(m);return info.mission&&(!campaign||info.mission.campaign===campaign)&&hasPlayableSlots(info);}).sort((a,b)=>overviewOf(a).mission!.order-overviewOf(b).mission!.order);}
