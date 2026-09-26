import type {Placement} from '../../content/schema';
import {biomeById} from '../../content/biomes';
import {HeightField,decodeHeight} from '../map/height';
import type {MapStamp,UtcMap} from '../map/utcmap';
import {generateScene,type GeneratedScene} from './generate';
import {generationAssets,type LandscapeAsset} from './catalogue';
import type {AuthoredObject} from './layers';
import {WatercourseIndex} from './watercourses';

export type CompiledMapScene={field:HeightField;generated?:GeneratedScene;stamps:MapStamp[];resources:Placement[];owners:Map<string,string>};
/** Shared by the map editor, asset fixtures and game loading. Never writes generated data into the document. */
export function compileMapScene(map:UtcMap,catalogue:readonly LandscapeAsset[]):CompiledMapScene{
 const field=new HeightField(map.size);field.biome=biomeById(map.biome).id;field.baseMaterial=biomeById(map.biome).ground;
 field.load(map.height?decodeHeight(map.height,map.size)??[]:[],map.waterLevel??0,map.landscape?.importedTerrain);
 if(!map.authoring)return {field,stamps:[...map.stamps],resources:[],owners:new Map()};
 // Imported high-resolution terrain is sampled before procedural edits. Keep the original document untouched.
 const samples=field.source?Float32Array.from(field.samples,(_,i)=>field.sample(field.origin+i%field.verts,field.origin+Math.floor(i/field.verts))):field.samples;
 const index=new Map(catalogue.map(a=>[a.id,a]));
 const sceneryIndex=new Map(catalogue.map(a=>[a.scenery,a.id]));
 const external=map.stamps.map((s,i):AuthoredObject=>({id:'external.'+i,asset:sceneryIndex.get(s.asset)??s.asset,x:s.x,z:s.y,scale:s.scale??1,elevation:s.elevation??0,yaw:s.yaw??0,heightMode:'absolute',visible:true,locked:true}));
 const generated=generateScene({...map.authoring,objects:[...map.authoring.objects,...external]},
  {originX:field.origin,originZ:field.origin,step:1,width:field.verts,height:field.verts,samples},generationAssets(catalogue));
 field.source=undefined;field.samples.set(generated.terrain.samples);
 field.watercourses=generated.rivers.map(r=>{const style=index.get(r.profile)?.water;if(!style)throw Error('Missing published water profile '+r.profile);return {...r,style};});
 field.courseWater=new WatercourseIndex(generated.rivers);
 field.grassCoverage=generated.landformSurface?.grass??new Float32Array(field.samples.length);
 field.rockCoverage=generated.landformSurface?.rock;
 field.surfacePaint=generated.paint;
 field.forestCoverage=new Float32Array(field.samples.length);
 // Derive the ground tint from actual vegetation, including baked placements.
 // The same objects therefore produce exactly the same ground before/after baking.
 const wet=new Uint8Array(field.samples.length);
 const groundCover=biomeById(field.biome).groundCover;
 for(const obj of [...map.authoring.objects,...generated.objects,...external]){
  const asset=index.get(obj.asset);
  if(!obj.visible||!asset||!['tree','foliage'].includes(asset.kind)||asset.scenery?.includes('water-leaves'))continue;
  const radius=(asset.kind==='tree'?3:groundCover?.radius??1.3)*obj.scale;
  for(let z=Math.max(0,Math.floor(obj.z-radius-field.origin));z<=Math.min(field.verts-1,Math.ceil(obj.z+radius-field.origin));z++)for(let x=Math.max(0,Math.floor(obj.x-radius-field.origin));x<=Math.min(field.verts-1,Math.ceil(obj.x+radius-field.origin));x++){
   const wx=x+field.origin,wz=z+field.origin,d=Math.hypot(wx-obj.x,wz-obj.z);
   if(d>=radius)continue;
   const i=z*field.verts+x;
   if(!wet[i])wet[i]=field.sample(wx,wz)<field.waterAt(wx,wz)+.15?2:1;
   if(wet[i]===2)continue;
   const w=(groundCover?.strength??.8)*(1-d/radius);
   field.grassCoverage[i]=Math.max(field.grassCoverage[i]!,w);
   if(asset.kind==='tree')field.forestCoverage[i]=Math.max(field.forestCoverage[i]!,Math.min(1,w*2));
  }
 }

 const resources:Placement[]=[],resourceCells=new Set<string>();
 const owners=new Map<string,string>();
 const stamps:MapStamp[]=[...map.stamps];
 for(const obj of [...map.authoring.objects,...generated.objects]){
  if(!obj.visible)continue;
  const asset=index.get(obj.asset);if(!asset?.scenery)throw Error(`Asset ${obj.asset} has no published scenery binding`);
  if('owner'in obj&&typeof obj.owner==='string')owners.set(obj.id,obj.owner);
  if(asset.harvesting&&obj.heightMode==='terrain'){
   const x=Math.floor(obj.x+.5),y=Math.floor(obj.z+.5),cell=x+':'+y;
   if(x>=0&&y>=0&&x<map.size&&y<map.size){
    if(!resourceCells.has(cell)){resourceCells.add(cell);resources.push({id:obj.id,definition:asset.harvesting.definition,position:{x,y},rotation:obj.yaw*180/Math.PI,owner:'none',appearance:{asset:asset.harvesting.asset,scale:obj.scale}});}
    continue;
   }
  }
  // Authored model scale belongs to the renderer prototype, not map placements.
  stamps.push({id:obj.id,asset:asset.scenery,x:obj.x,y:obj.z,yaw:obj.yaw,scale:obj.scale,
   ...(obj.heightMode==='absolute'?{sourceTransform:{height:obj.elevation,quaternion:[0,Math.sin(obj.yaw/2),0,Math.cos(obj.yaw/2)] as [number,number,number,number]}}:{elevation:obj.elevation})});
 }
 return {field,generated,stamps,resources,owners};
}
