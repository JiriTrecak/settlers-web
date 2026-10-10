import {rememberHeightChange} from '../map/heightChanges';
import type {Placement} from '../../content/schema';
import {biomeById} from '../../content/biomes';
import {HeightField} from '../map/height';
import type {MapStamp,UtcMap} from '../map/utcmap';
import {generateScene,type GeneratedScene,type TerrainGrid} from './generate';
import {generationAssets,type LandscapeAsset} from './catalogue';
import type {AuthoredObject,AuthoringScene} from './layers';
/** Only the editor constructs this transient preview input. It is never saved. */
export type PreviewMap=Omit<UtcMap,'authoring'>&{authoring:AuthoringScene & {terrain:UtcMap['authoring']['terrain']}};
export const previewLayers=(map:UtcMap)=>(map as PreviewMap).authoring?.layers??[];
import {WatercourseIndex} from './watercourses';
import {BuildProfile} from './buildProfile';
import {restoreTerrain} from '../map/terrainData';

export type CompiledMapScene={field:HeightField;generated?:GeneratedScene;stamps:MapStamp[];resources:Placement[];owners:Map<string,string>;profile?:ReturnType<BuildProfile['report']>};
// Compile dependencies live outside serialized results. Keep only the immutable
// document and catalogue that produced each snapshot; old plans are collectable.
const compiledSources=new WeakMap<CompiledMapScene,{map:UtcMap;catalogue:readonly LandscapeAsset[]}>();
/** Restore dependency provenance for a trusted compiler snapshot decoded with
 * the same map and catalogue. Serialized data alone cannot establish freshness. */
export function rememberCompiledSource(scene:CompiledMapScene,map:UtcMap,catalogue:readonly LandscapeAsset[]):void{
 compiledSources.set(scene,{map,catalogue});
}
// Reused carved surfaces retain their rivers and heights. Wetness is independent
// of vegetation, so keep lazy samples across object edits (including undo).
const wetSurfaces=new WeakMap<TerrainGrid,{waterLevel:number;values:Uint8Array}>();
export function reusableMapSurface(map:UtcMap,catalogue:readonly LandscapeAsset[],previous?:CompiledMapScene,vegetationEdits=false):GeneratedScene|undefined{
 const source=previous?compiledSources.get(previous):undefined;if(!source||source.catalogue!==catalogue)return undefined;
 const before=source.map;
 if(before.biome!==map.biome||before.size!==map.size||
  before.authoring?.version!==map.authoring?.version||before.authoring?.terrain!==map.authoring?.terrain)return undefined;
 // Only known vegetation recipes can change without carving a new surface.
 // Unknown/future recipe types conservatively participate in invalidation.
 const recipes=new Map(catalogue.map(a=>[a.id,a.recipe]));
 const surfaceLayers=(layers:typeof map.authoring)=>layers?previewLayers({authoring:layers} as UtcMap).filter(l=>!vegetationEdits||!['forest','grass','meadow','ground-cover'].includes(recipes.get(l.recipe)?.type??'')):undefined;
 if(JSON.stringify(surfaceLayers(before.authoring))!==JSON.stringify(surfaceLayers(map.authoring)))return undefined;
 return previous?.generated;
}
/** Shared by the map editor, asset fixtures and game loading. Never writes generated data into the document. */
export function compileMapScene(map:UtcMap,catalogue:readonly LandscapeAsset[],previous?:CompiledMapScene):CompiledMapScene{
 const profile=new BuildProfile();
 const field=new HeightField(map.size);field.biome=biomeById(map.biome).id;field.baseMaterial=biomeById(map.biome).ground;
 if(!map.authoring?.terrain)throw Error('Map has no committed terrain cells');
 restoreTerrain(field,map.authoring.terrain);
 const samples=field.samples;
 const index=new Map(catalogue.map(a=>[a.id,a]));
 const sceneryIndex=new Map(catalogue.map(a=>[a.scenery,a.id]));
 const external=map.stamps.map((s,i):AuthoredObject=>({id:'external.'+i,asset:sceneryIndex.get(s.asset)??s.asset,x:s.x,z:s.y,scale:s.scale??1,elevation:s.elevation??0,yaw:s.yaw??0,heightMode:'absolute',visible:true,locked:true}));
 profile.mark('Base terrain and catalogue');
 const source=previous?compiledSources.get(previous):undefined;
 // Layer sampling plans are independent of base heights; generation validates
 // each layer and exclusion dependency before reusing any positions or rasters.
 const plan=source?.catalogue===catalogue&&source.map.size===map.size&&source.map.biome===map.biome?previous?.generated:undefined;
 const base={originX:field.origin,originZ:field.origin,step:1,width:field.verts,height:field.verts,samples};
 const generated:GeneratedScene=previewLayers(map).length?generateScene({...map.authoring,layers:previewLayers(map),objects:[...map.authoring.objects,...external]},
  base,generationAssets(catalogue),profile,reusableMapSurface(map,catalogue,previous,true),plan):
  {terrain:base,objects:[],rivers:[],paint:[],scatterLayers:[],issues:[]};
 field.source=undefined;field.samples.set(generated.terrain.samples);
 field.watercourses=generated.rivers.map(r=>{const style=index.get(r.profile)?.water;if(!style)throw Error('Missing published water profile '+r.profile);return {...r,style};});
 field.courseWater=new WatercourseIndex(generated.rivers);
 const savedGrass=field.grassCoverage,savedRock=field.rockCoverage,savedPaint=field.surfacePaint;
 field.grassCoverage=generated.landformSurface?.grass.slice()??new Float32Array(field.samples.length);
 if(savedGrass)for(let i=0;i<savedGrass.length;i++)field.grassCoverage[i]=Math.max(field.grassCoverage[i],savedGrass[i]);
 if(generated.meadow)for(let i=0;i<generated.meadow.length;i++)field.grassCoverage[i]=Math.max(field.grassCoverage[i]!,generated.meadow[i]!);
 // Apply saves deliberate terrain coverage, not the tint derived from object
 // positions below. Removing or moving an applied tree must remove its tint.
 field.terrainGrassCoverage=field.grassCoverage;
 field.grassCoverage=field.grassCoverage.slice();
 field.rockCoverage=generated.landformSurface?.rock?.slice()??savedRock;
 if(savedRock&&field.rockCoverage)for(let i=0;i<savedRock.length;i++)field.rockCoverage[i]=Math.max(field.rockCoverage[i],savedRock[i]);
 field.surfacePaint=savedPaint?.length?[...savedPaint,...generated.paint]:generated.paint;
 field.forestCoverage=new Float32Array(field.samples.length);
 // Derive the ground tint from actual vegetation, including baked placements.
 // The same objects therefore produce exactly the same ground before/after baking.
 let wetSurface=wetSurfaces.get(generated.terrain);
 if(!wetSurface||wetSurface.waterLevel!==field.waterLevel){wetSurface={waterLevel:field.waterLevel,values:new Uint8Array(field.samples.length)};wetSurfaces.set(generated.terrain,wetSurface);}
 const wet=wetSurface.values;
 const groundCover=biomeById(field.biome).groundCover,strength=groundCover?.strength??.8;
 profile.mark('Water index and surface buffers');
 for(const obj of [...map.authoring.objects,...generated.objects,...external]){
  const asset=index.get(obj.asset);
  if(!obj.visible||!asset||!['tree','foliage'].includes(asset.kind)||asset.scenery?.includes('water-leaves'))continue;
  const tree=asset.kind==='tree',radius=(tree?3:groundCover?.radius??1.3)*obj.scale;
  for(let z=Math.max(0,Math.floor(obj.z-radius-field.origin));z<=Math.min(field.verts-1,Math.ceil(obj.z+radius-field.origin));z++)for(let x=Math.max(0,Math.floor(obj.x-radius-field.origin));x<=Math.min(field.verts-1,Math.ceil(obj.x+radius-field.origin));x++){
   const wx=x+field.origin,wz=z+field.origin,i=z*field.verts+x;
   // Skip distances that cannot increase either max-blended mask. Use a
   // conservative squared bound; candidates still use the original hypot and
   // Float32 writes, so this preserves the exact raster rather than an LOD.
   const threshold=tree&&field.forestCoverage[i]<1?Math.min(field.grassCoverage[i],field.forestCoverage[i]/2):field.grassCoverage[i];
   if(strength<=threshold)continue;
   const reach=radius*(1-threshold/strength)+1e-10,dx=wx-obj.x,dz=wz-obj.z;
   if(dx*dx+dz*dz>reach*reach)continue;
   const d=Math.hypot(dx,dz);if(d>=radius)continue;
   if(!wet[i])wet[i]=field.sample(wx,wz)<field.waterAt(wx,wz)+.15?2:1;
   if(wet[i]===2)continue;
   const w=strength*(1-d/radius);
   field.grassCoverage[i]=Math.max(field.grassCoverage[i]!,w);
   if(tree)field.forestCoverage[i]=Math.max(field.forestCoverage[i]!,Math.min(1,w*2));
  }
 }

 profile.mark('Vegetation ground coverage');
 const projection=projectMapObjects(map,generated,catalogue);
 profile.mark('Resource and scenery projections');
 const result={field,generated,...projection,profile:profile.report()};
 if(previous)rememberHeightChange(field,previous.field,map.authoring?.terrain===source?.map.authoring?.terrain&&generated.rivers===previous.generated?.rivers&&field.waterLevel===previous.field.waterLevel&&field.sourceWater===previous.field.sourceWater);
 compiledSources.set(result,{map,catalogue});return result;
}

/** Preserve dependency provenance when only scene projections changed. */
export function inheritSceneSource(result:CompiledMapScene,previous:CompiledMapScene):void{
 const source=compiledSources.get(previous);if(source)compiledSources.set(result,source);
}

/** Re-project authored transforms without touching generated terrain or vegetation. */
export function projectMapObjects(map:UtcMap,generated:GeneratedScene,catalogue:readonly LandscapeAsset[]):Pick<CompiledMapScene,'stamps'|'resources'|'owners'>{
 const index=new Map(catalogue.map(a=>[a.id,a]));
 const resources:Placement[]=[],resourceCells=new Set<string>();
 let owners:Map<string,string>|undefined;
 const stamps:MapStamp[]=[...map.stamps];
 for(const obj of map.authoring?.objects??[]){
  if(!obj.visible)continue;
  const asset=index.get(obj.asset);if(!asset?.scenery)throw Error(`Asset ${obj.asset} has no published scenery binding`);
  if('owner'in obj&&typeof obj.owner==='string')(owners??=new Map()).set(obj.id,obj.owner);
  const projected=projectObject(obj,asset,map.size);
  if(projected.resource){
   if(!resourceCells.has(projected.cell!)){resourceCells.add(projected.cell!);resources.push(projected.resource);}
  }else if(projected.stamp)stamps.push(projected.stamp);
 }
 const tail=generatedProjection(generated.objects,catalogue,index,map.size);
 // Authored resources precede generated ones. A moved/reordered authored tree
 // must still win its occupied cell, even when the generated tail is retained.
 for(const {cell,resource} of tail.resources)if(!resourceCells.has(cell))resources.push(resource);
 if(owners)for(const [id,owner] of tail.owners)owners.set(id,owner);
 return {stamps:stamps.concat(tail.stamps),resources,owners:owners??tail.owners};
}

type GeneratedProjection={stamps:MapStamp[];resources:{cell:string;resource:Placement}[];owners:Map<string,string>};
const generatedProjections=new WeakMap<GeneratedScene['objects'],{catalogue:readonly LandscapeAsset[];size:number;value:GeneratedProjection}>();
/** Immutable generated collections survive pose edits. Avoid re-walking their
 * records and rebuilding a large owner Map; weak keys follow snapshot lifetime. */
function generatedProjection(objects:GeneratedScene['objects'],catalogue:readonly LandscapeAsset[],index:Map<string,LandscapeAsset>,size:number):GeneratedProjection{
 const old=generatedProjections.get(objects);if(old?.catalogue===catalogue&&old.size===size)return old.value;
 const value:GeneratedProjection={stamps:[],resources:[],owners:new Map()},cells=new Set<string>();
 for(const obj of objects){
  if(!obj.visible)continue;
  const asset=index.get(obj.asset);if(!asset?.scenery)throw Error(`Asset ${obj.asset} has no published scenery binding`);
  if(typeof obj.owner==='string')value.owners.set(obj.id,obj.owner);
  const projected=projectObject(obj,asset,size);
  if(projected.resource){
   if(!cells.has(projected.cell!)){cells.add(projected.cell!);value.resources.push({cell:projected.cell!,resource:projected.resource});}
  }else if(projected.stamp)value.stamps.push(projected.stamp);
 }
 generatedProjections.set(objects,{catalogue,size,value});return value;
}

// Generated objects are immutable and survive unrelated pose edits. Retain their
// projection too: recreating every stamp defeats the renderer/transport identity
// fast paths. Weak keys release these records with their generation plan.
type ObjectProjection={stamp?:MapStamp;resource?:Placement;cell?:string};
const objectProjections=new WeakMap<AuthoredObject,{asset:LandscapeAsset;size:number;value:ObjectProjection}>();
function projectObject(obj:AuthoredObject,asset:LandscapeAsset,size:number):ObjectProjection{
 const old=objectProjections.get(obj);if(old?.asset===asset&&old.size===size)return old.value;
 let value:ObjectProjection={};
 if(asset.harvesting&&obj.heightMode==='terrain'){
  const x=Math.floor(obj.x+.5),y=Math.floor(obj.z+.5);
  if(x>=0&&y>=0&&x<size&&y<size)value={cell:x+':'+y,resource:{id:obj.id,definition:asset.harvesting.definition,position:{x,y},rotation:obj.yaw*180/Math.PI,owner:'none',appearance:{asset:asset.harvesting.asset,scale:obj.scale}}};
 }
 // Harvestable objects outside the playable bounds remain decorative scenery.
 if(!value.resource)value={stamp:{id:obj.id,asset:asset.scenery!,x:obj.x,y:obj.z,yaw:obj.yaw,scale:obj.scale,
  ...(obj.heightMode==='absolute'?{sourceTransform:{height:obj.elevation,quaternion:[0,Math.sin(obj.yaw/2),0,Math.cos(obj.yaw/2)] as [number,number,number,number]}}:{elevation:obj.elevation})}};
 objectProjections.set(obj,{asset,size,value});return value;
}
