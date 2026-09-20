/** Deterministic intermediate-to-UTC conversion; no procedural replacement placement. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap,type MapStamp} from '../../../src/shared/map/utcmap';
import {HeightField,encodeHeight} from '../../../src/shared/map/height';
import {importedTerrainSchema,sourceHeight,type ImportedTerrain} from '../../../src/shared/map/importedTerrain';
import {rasterUnderlays} from './underlays';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Box3,Vector3,Quaternion,Matrix4} from 'three';
import {rasterModelOcclusion,addPlantOcclusion,type PlantOccluder,type OcclusionVolume} from './occlusion';
const folder='art/references/scouring-maps/eldenvale';
const src=JSON.parse(readFileSync(join(folder,'terrain.json'),'utf8'));
const manifest=JSON.parse(readFileSync('art/references/trees-water-study/import-manifest.json','utf8'));
const b64=(name:string)=>readFileSync(join(folder,name)).toString('base64');
const slug=(name:string)=>`reference-${name.replaceAll('_','-')}`;
const texture=(name:string)=>name.replaceAll('/','_').replace(/\.tga$/,'');
const [nx,nz]=src.grid.blocks;
const source:ImportedTerrain=importedTerrainSchema.parse({
 version:1,source:'The Scouring · Eldenvale',sha256:src.sourceSha256,
 origin:src.grid.origin.map((n:number)=>n+256),sourceOrigin:src.grid.origin,blocks:src.grid.blocks,
 groundColor:{size:manifest.groundColor.size,rgba:b64('ground-color.rgba')},
 displacement:{mask:b64('terrain-auxiliary.u8'),texture:texture(manifest.terrain.rock.attributes.TextureDisplacement),tiling:Number(manifest.terrain.rock.attributes.TilingScale)},
 heightSize:src.grid.heightSize,height:b64(src.height),heightOffset:-24,maskSize:src.grid.maskSize,
 layers:src.layers.map((l:{name:string;mask?:string})=>{
  const a=manifest.terrain[l.name].attributes;
  return {name:l.name,...(l.mask?{mask:b64(l.mask)}:{}),ar:texture(a.TextureAlbedoRoughness),nh:texture(a.TextureNormalHeight),tiling:Number(a.TilingScale??.25),blend:a.BlendHeightRange!==undefined?Number(a.BlendHeightRange):-Number(a.BlendingSharpness??1),verticality:Number(a.VerticalityMultiplier??0),edge:Number(a.EdgeSharpen??0),desaturation:Number(a.BaseDesaturationBrightness??0)};
 }),
 layerSlots:Buffer.from(src.blocks.flatMap((b:{layers:number[][]})=>b.layers.flatMap(l=>[...l,...Array(6-l.length).fill(255)]))).toString('base64'),
 grass:src.grass.map((g:{type:number;packedInstances:string})=>({asset:slug('grass_'+src.grassTypes[g.type].replace(/^grass_/,'')),instances:b64(g.packedInstances),water:manifest.grass[src.grassTypes[g.type]]?.IsWaterGrass==='true'})),
 water:src.blocks.filter((b:{waterPayload?:string})=>b.waterPayload).map((b:{x:number;z:number;waterPayload:string})=>({x:b.x,z:b.z,payload:b64(b.waterPayload)})),
});
const raster=sourceHeight(source),field=new HeightField(512);
// Navigation retains the engine's unit grid; rendering and draping use the original raster.
for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++)field.samples[z*field.verts+x]=raster.sample(x+field.origin,z+field.origin);
const stamps:MapStamp[]=[];
const helpers=new Map<string,unknown>();
const plantOccluders:PlantOccluder[]=[],plantBounds=new Map<string,Box3>();
const place=(p:{position:number[];quaternion:[number,number,number,number];scale:number;packedUserData?:[number,number,number]},key:string)=>{
 const asset=manifest.meshes[key]?.output.split('/').at(-2);if(!asset)throw Error(`Unresolved source asset ${key}`);
 if(!helpers.has(key)){
  const glb=readFileSync(manifest.meshes[key].output),gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  helpers.set(key,key==='models_wooden_bridge_small'?gltf.nodes.flatMap((n:{extras?:{heightHelpers?:unknown[]}})=>n.extras?.heightHelpers??[])[0]:undefined);
 }
 const helper=helpers.get(key) as NonNullable<NonNullable<MapStamp['walk']>['mesh']>|undefined;
 stamps.push({...(helper?{walk:{level:1,connections:{start:0,end:0},mesh:helper}}:{}),id:`scouring.${stamps.length}`,asset,x:p.position[0]!+255.5,y:p.position[2]!+255.5,scale:p.scale,sourceTransform:{height:p.position[1]!+source.heightOffset,quaternion:p.quaternion,...(p.packedUserData?{packedUserData:p.packedUserData}:{})}});
 const occlusion=manifest.plantOcclusion?.[key.replace(/^plants_/,'')]?.attributes;
 if(key.startsWith('plants_')&&occlusion?.Size){
  if(!plantBounds.has(key)){
   const glb=readFileSync(manifest.meshes[key].output),g=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString()),bounds=new Box3();
   for(const mesh of g.meshes)for(const part of mesh.primitives){
    if(g.materials[part.material].extras?.underlay)continue;
    const a=g.accessors[part.attributes.POSITION];bounds.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)));
   }
   plantBounds.set(key,bounds);
  }
  const bounds=plantBounds.get(key)!.clone().applyMatrix4(new Matrix4().compose(new Vector3(),new Quaternion(...p.quaternion),new Vector3().setScalar(p.scale)));
  const size=occlusion.Size.match(/-?[\d.]+/g).map(Number) as [number,number];
  if(size.length!==2||!size.every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid source plant occlusion size');
  plantOccluders.push({stamp:stamps.at(-1)!,size,height:bounds.max.y-bounds.min.y,intensity:Number(occlusion.Intensity)});
 }

};
for(const p of src.plants)place(p,'plants_'+src.plantTypes[p.type]);
for(const p of src.models)place(p,'models_'+p.type);
const gameplay=JSON.parse(readFileSync(join(folder,'gameplay.json'),'utf8'));
const neutralAssets:Record<string,string>={
 neutral_goblin:'units_neutral_goblin',neutral_troll:'units_neutral_troll',neutral_wolf:'units_neutral_wolf',neutral_bandit:'units_neutral_bandit_a',
 neutral_goblin_hut:'models_goblin_hut',neutral_troll_cave:'models_neutral_troll_cave',neutral_wolf_den:'models_neutral_wolf_den_a',neutral_bandit_tent:'models_neutral_bandit_tent',
};
const objectAudit:Array<{type:string;asset:string;position:number[];direction:number[];variantPolicy?:string}>=[];
function placeGameplay(type:string,position:number[],direction:number[],asset:string){
 const angle=Math.atan2(direction[0]!,direction[1]!);
 place({position:[position[0]!,raster.sample(position[0]!+256,position[1]!+256)-source.heightOffset,position[1]!],quaternion:[0,Math.sin(angle/2),0,Math.cos(angle/2)],scale:1},asset);
 objectAudit.push({type,asset,position,direction,...(['neutral_bandit','neutral_wolf_den'].includes(type)?{variantPolicy:'First declared class variant; source map does not store runtime RNG choice'}:{})});
}
for(const p of gameplay.neutrals){const asset=neutralAssets[p.type];if(!asset)throw Error(`Unresolved neutral ${p.type}`);placeGameplay(p.type,p.position,p.direction,asset);}
for(const p of gameplay.sites)if(p.type==='neutral_outpost')placeGameplay(p.type,p.position,[0,1],'models_neutral_outpost');
const underlay=await rasterUnderlays(stamps,new Map(Object.values(manifest.meshes).map((m:any)=>[m.output.split('/').at(-2),m.output])),source.origin,source.blocks);
source.underlayMask={size:underlay.size,mask:Buffer.from(underlay.mask).toString('base64')};
writeFileSync(join(folder,'underlay-mask.u8'),underlay.mask);
writeFileSync(join(folder,'underlay-mask.json'),JSON.stringify({size:underlay.size,instances:underlay.instances,density:underlay.density,blend:underlay.blend,source:'Rasterized original underlay geometry and texture alpha; original RT resolution and blend state are not recorded in the map'},null,2)+'\n');
if(!manifest.occlusionVolumes)throw Error('Re-run source asset importer to decode model occlusion volumes');
const volumes=new Map<string,{metadata:OcclusionVolume;path:string}>();
for(const [key,metadata] of Object.entries(manifest.occlusionVolumes))if(metadata){
 volumes.set(manifest.meshes[key].output.split('/').at(-2),{metadata:metadata as OcclusionVolume,path:`assets/textures/reference/scouring/occlusion/${key.replace(/^models_/,'')}.bin`});
}
const occlusion=rasterModelOcclusion(stamps,volumes,raster);
const spriteMetadata=manifest.occlusionSprite;
if(!spriteMetadata||!manifest.plantOcclusion)throw Error('Re-run source importer for plant occlusion metadata');
const sprite=gunzipSync(readFileSync('assets/textures/reference/scouring/occlusion-sprite.bin'));
if(sprite.length!==spriteMetadata.decodedBytes||createHash('sha256').update(sprite).digest('hex')!==spriteMetadata.decodedSha256)throw Error('Invalid source occlusion sprite');
const modelOcclusionBase=Buffer.from(occlusion.rgba).toString('base64');
const plantOcclusionCount=addPlantOcclusion(occlusion,plantOccluders,sprite,spriteMetadata.size,source.origin);
source.occlusion={size:occlusion.size,rgba:Buffer.from(occlusion.rgba).toString('base64'),dynamic:{base:modelOcclusionBase,sprite:{size:spriteMetadata.size,red:sprite.toString('base64')},plants:plantOccluders.map(p=>({id:p.stamp.id,asset:p.stamp.asset,x:p.stamp.x+.5,z:p.stamp.y+.5,scale:p.stamp.scale??1,size:p.size,height:p.height,intensity:p.intensity}))}};
writeFileSync(join(folder,'model-occlusion.rgba'),occlusion.rgba);
const {rgba:occlusionBytes,...occlusionAudit}=occlusion;
writeFileSync(join(folder,'model-occlusion.json'),JSON.stringify({...occlusionAudit,plantInstances:plantOcclusionCount,sprite:spriteMetadata,coverage:'Static model ODF and active fir-class sprite contributions',spriteOffsetBlend:'maximum',unverified:['RT resolution','overlap blend and model/sprite priority','model intensity uniform','sprite texture binding inferred from executable reference','plant height from transformed geometry bounds','ObscureInfluence attenuation not applied; engine formula unavailable']},null,2)+'\n');
// dungeon_entrance declares IsHeroesModeOnly: excluded from this normal skirmish.
const map={...emptyUtcMap(512),name:'Eldenvale · Source Import',description:'Source-map rendering test: original terrain raster, layer masks, vegetation, water, bridge decks, outposts and neutral camp placements. Neutral units use a fixed source stand pose; gameplay scripts and rendering calibration remain under reconstruction.',sandbox:true,playerStarts:[{player:1,x:Math.round(gameplay.starts[0].position[0]+256),z:Math.round(gameplay.starts[0].position[1]+256),setup:'setup.ants',mainFort:'unused'}],height:encodeHeight(field.samples,512),waterLevel:-100,
 landscape:{importedTerrain:source,strokes:[],cover:[],environment:{hour:12,season:'summer' as const,playing:false}},stamps,entities:[],camps:[]};
const parsed=parseUtcMap(map);if(!parsed)throw Error('Converted map failed UTC schema');
mkdirSync('assets/maps/showcase',{recursive:true});writeFileSync('assets/maps/showcase/scouring-eldenvale.utcmap',stringifyUtcMap(parsed));
writeFileSync(join(folder,'conversion-audit.json'),JSON.stringify({source:src.sourceSha256,translation:[256,-24,256],terrainSamples:raster.values.length,sourceTerrainResolution:1/3,navigationResolution:1,layerCount:source.layers.length,plants:src.plants.length,models:src.models.length,grass:src.counts.grass,waterBlocks:source.water.length,gameplayPreservedIn:'gameplay.json',objects:objectAudit,excludedSites:gameplay.sites.filter((p:{type:string})=>p.type==='dungeon_entrance').map((p:unknown)=>({object:p,reason:'Source class IsHeroesModeOnly; normal skirmish comparison'})),remaining:['Neutral AI/gameplay scripts and source collision grid semantics','Runtime random variant choice and source unit facing convention verification','Outpost floor/ladder traversal','Source player starts preserved in gameplay.json; UTC scene still uses a single sandbox start','Source adaptive tessellation versus fixed 1/3-unit grid; auxiliary uint16-grid semantics; SSAO, bounce and model/tree occlusion RT/blend/intensity/obscurance verification','Source underlay RT density/blend and caustics projection/RT size require original-frame verification','Dynamic water disturbances; source screen-reflection RT resolution needs verification','Ground-color binding, remaining material defaults and shader/lighting equivalence require same-camera original screenshot']},null,2)+'\n');
console.log({blocks:nx*nz,stamps:stamps.length,grass:src.counts.grass,sourceHeights:raster.values.length,output:'assets/maps/showcase/scouring-eldenvale.utcmap'});
