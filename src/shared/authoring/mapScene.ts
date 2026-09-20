import {HeightField,decodeHeight} from '../map/height';
import type {MapStamp,UtcMap} from '../map/utcmap';
import {generateScene,type GeneratedScene} from './generate';
import {generationAssets,type LandscapeAsset} from './catalogue';
import type {AuthoredObject} from './layers';
import {WatercourseIndex} from './watercourses';

export type CompiledMapScene={field:HeightField;generated?:GeneratedScene;stamps:MapStamp[];owners:Map<string,string>};
/** Shared by the map editor, asset fixtures and game loading. Never writes generated data into the document. */
export function compileMapScene(map:UtcMap,catalogue:readonly LandscapeAsset[]):CompiledMapScene{
 const field=new HeightField(map.size);
 field.load(map.height?decodeHeight(map.height,map.size)??[]:[],map.waterLevel??0,map.landscape?.importedTerrain);
 if(!map.authoring)return {field,stamps:[...map.stamps],owners:new Map()};
 // Imported high-resolution terrain is sampled before procedural edits. Keep the original document untouched.
 const samples=field.source?Float32Array.from(field.samples,(_,i)=>field.sample(field.origin+i%field.verts,field.origin+Math.floor(i/field.verts))):field.samples;
 const index=new Map(catalogue.map(a=>[a.id,a]));
 const external=map.stamps.map((s,i):AuthoredObject=>({id:'external.'+i,asset:[...index.values()].find(a=>a.scenery===s.asset)?.id??s.asset,x:s.x,z:s.y,scale:s.scale??1,elevation:s.elevation??0,yaw:s.yaw??0,heightMode:'absolute',visible:true,locked:true}));
 const generated=generateScene({...map.authoring,objects:[...map.authoring.objects,...external]},
  {originX:field.origin,originZ:field.origin,step:1,width:field.verts,height:field.verts,samples},generationAssets(catalogue));
 field.source=undefined;field.samples.set(generated.terrain.samples);
 field.watercourses=generated.rivers.map(r=>{const style=index.get(r.profile)?.water;if(!style)throw Error('Missing published water profile '+r.profile);return {...r,style};});
 field.courseWater=new WatercourseIndex(generated.rivers);
 const owners=new Map<string,string>();
 const stamps:MapStamp[]=[...map.stamps];
 for(const obj of [...map.authoring.objects,...generated.objects]){
  if(!obj.visible)continue;
  const asset=index.get(obj.asset);if(!asset?.scenery)throw Error(`Asset ${obj.asset} has no published scenery binding`);
  if('owner'in obj&&typeof obj.owner==='string')owners.set(obj.id,obj.owner);
  // Authored model scale belongs to the renderer prototype, not map placements.
  stamps.push({id:obj.id,asset:asset.scenery,x:obj.x,y:obj.z,yaw:obj.yaw,scale:obj.scale,
   ...(obj.heightMode==='absolute'?{sourceTransform:{height:obj.elevation,quaternion:[0,Math.sin(obj.yaw/2),0,Math.cos(obj.yaw/2)] as [number,number,number,number]}}:{elevation:obj.elevation})});
 }
 return {field,generated,stamps,owners};
}
