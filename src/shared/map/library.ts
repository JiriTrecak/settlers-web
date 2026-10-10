import {localMapStorage} from './localMapStorage';
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
  source: "project" | "local";
  overview:MapOverview;
  previewUrl?:string;
};
export type LoadedMapEntry=MapEntry & {map:UtcMap;revision:string};
const localMaps=new Map<string,MapEntry>();
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
/** Hydrate once before opening menus. Failed storage does not hide project maps. */
export async function initializeMapLibrary():Promise<void>{
 const rows=await localMapStorage.read(),loaded=new Map<string,MapEntry>();
 for(const row of rows){
  try{
   if(typeof row.id!=='string'||!row.id.startsWith('local:'))continue;
   const map=parseUtcMap(JSON.parse(row.json));if(!map)continue;
   const item=entry(row.id,map,'local');item.name=`${map.name} (local copy)`;loaded.set(row.id,item);
  }catch{/* One damaged local document must not hide other maps. */}
 }
 localMaps.clear();for(const [id,item] of loaded)localMaps.set(id,item);
}
export function authoredMaps(): MapEntry[] {
 return [...project,...localMaps.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function playableMaps():MapEntry[]{return authoredMaps().filter(m=>!m.overview.mission&&hasPlayableSlots(m.overview));}
export function getMap(id: string): MapEntry {
  const found = authoredMaps().find((m) => m.id === id);
  if (!found) throw new Error(`Map not found: ${id}`);
  return found;
}
export async function rememberAuthoredMap(map: UtcMap): Promise<string> {
 const slug=map.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'untitled',id=`local:${slug}`;
 const json=stringifyUtcMap(map),saved=parseUtcMap(JSON.parse(json));
 if(!saved)throw Error('Cannot save an invalid map');
 await localMapStorage.write({id,json});
 const item=entry(id,saved,'local');item.name=`${saved.name} (local copy)`;localMaps.set(id,item);
 return id;
}

export function overviewOf(entry:MapEntry):MapOverview{return entry.overview;}
export function missionMaps(campaign?:string):MapEntry[]{return authoredMaps().filter(m=>{const info=overviewOf(m);return info.mission&&(!campaign||info.mission.campaign===campaign)&&hasPlayableSlots(info);}).sort((a,b)=>overviewOf(a).mission!.order-overviewOf(b).mission!.order);}
