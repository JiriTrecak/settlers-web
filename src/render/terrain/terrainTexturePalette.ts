import {publishedAssets} from '../../shared/assets/manifest';
import {groundTextures} from '../../shared/authoring/groundTextures';
import {unpackSourceBytes,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {terrainMaskBytes} from './terrainMasks';

type Channel='ar'|'nh'|'om';
const channels:Channel[]=['ar','nh','om'];
const resources=new Map(publishedAssets.flatMap(a=>a.outputs.map(o=>[o.path,o.sha256] as const)));
export type TerrainTexturePalette={names:Record<Channel,string[]>;keys:Record<Channel,string[]>;indices:number[][]};
function key(id:string,channel:Channel):string {
 const ref=groundTextures.get(id)?.terrain?.runtime?.[channel==='ar'?'albedoRoughness':channel==='nh'?'normalOpacity':'occlusionMetalness'];
 const path=`assets/library/${id}/${ref?.role??'data'}${ref&&ref.index!==1?'_'+ref.index:''}.bin`;
 return resources.get(path)??path;
}
/** Paint layers remain independent. Only their immutable published pixels share
 * array slices; tints, atlas connections, variants and masks never get merged. */
export function terrainTexturePalette(source:ImportedTerrain):TerrainTexturePalette {
 const names:TerrainTexturePalette['names']={ar:[],nh:[],om:[]},keys:TerrainTexturePalette['keys']={ar:[],nh:[],om:[]};
 const indices=source.layers.map((layer,i)=>{
  const used=i===0||terrainMaskBytes(layer)?.some(v=>v!==0)||!!(layer.connections&&unpackSourceBytes(layer.connections).some(v=>v!==0));
  return channels.map(channel=>{
   if(!used||(channel==='om'&&!groundTextures.has(layer.ar)))return -1;
   const id=channel==='nh'?layer.nh:layer.ar,hash=key(id,channel);
   let index=keys[channel].indexOf(hash);
   if(index<0){index=keys[channel].length;keys[channel].push(hash);names[channel].push(id);}
   return index;
  });
 });
 return {names,keys,indices};
}
/** Compatible mask edits reuse resident arrays, including temporary erasure.
 * New pixels require a new owner. Its fresh palette also drops unused slices. */
export function reuseTerrainTexturePalette(next:TerrainTexturePalette,resident:TerrainTexturePalette):TerrainTexturePalette|undefined {
 const remap=channels.map(channel=>next.keys[channel].map(hash=>resident.keys[channel].indexOf(hash)));
 if(remap.some(indices=>indices.some(i=>i<0)))return undefined;
 return {...resident,indices:next.indices.map(indices=>indices.map((i,c)=>i<0?-1:remap[c][i]))};
}
