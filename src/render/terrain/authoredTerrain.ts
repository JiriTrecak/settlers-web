import {indexedPaints} from '../../shared/authoring/sparseWeights';
import {perf} from '../../debug/performance';
import {setTerrainMask} from './terrainMasks';
import {sampleSurfaceRaster,type SurfaceRaster} from './surfaceRaster';
import {biomeById,biomeTerrainTile} from '../../content/biomes';
import {CurveIndex} from '../../shared/landscape/curveIndex';
import type {HeightField} from '../../shared/map/height';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {groundTextures,isCliffMaterial} from '../../shared/authoring/groundTextures';
import {sampleCurve,type TerrainStroke,type CoverPatch} from '../../shared/landscape/curve';
const pack=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
// Geometry rasters are immutable snapshots. Coverage edits retain their identity;
// sculpting produces another snapshot, including when the HeightField is mutable.
const encodedSurfaces=new WeakMap<SurfaceRaster,{height:string;slots:string}>();
/** Compile editable ground into the same six-slot material inputs as supplied terrain.
 * This is derived GPU data; it is never stored in the map document. */
export function authoredTerrain(field:HeightField,strokes:readonly TerrainStroke[],cover:readonly CoverPatch[],surface?:SurfaceRaster):ImportedTerrain{
 const blocks=field.span/16,hw=field.verts,mw=field.verts,origin=field.origin;
 const coords=surface?undefined:Float64Array.from({length:hw},(_,i)=>origin+i);
 surface??=sampleSurfaceRaster(field,coords!,coords!,.5);
 let stage=perf.start(),encoded=encodedSurfaces.get(surface);
 if(!encoded){
  const heights=new Uint8Array(hw*hw*2),heightView=new DataView(heights.buffer);
  for(let z=0;z<hw;z++)for(let x=0;x<hw;x++)heightView.setUint16((z*hw+x)*2,Math.round(Math.max(0,Math.min(1,(surface.heights[z*hw+x]+16)/64))*65535),true);
  const slots=new Uint8Array(blocks*blocks*16*6);for(let i=0;i<slots.length;i++)slots[i]=i%6;
  encoded={height:pack(heights),slots:pack(slots)};encodedSurfaces.set(surface,encoded);
 }
 perf.end('Terrain · height and slot encoding (event)',stage);stage=perf.start();
 const biome=biomeById(field.biome);
 const channels=['soil','grass','dirt','waterbed','stones','rock'] as const;
 const sourcePaint=field.surfacePaint??[],paintVertices=indexedPaints(sourcePaint,mw*mw);
 const custom=[...new Set(sourcePaint.filter(p=>groundTextures.has(p.material)).map(p=>p.material))].sort((a,b)=>Number(isCliffMaterial(a))-Number(isCliffMaterial(b)));
 const customCliffs=custom.map(isCliffMaterial);
 const paints=sourcePaint.map(p=>({...p,cliff:isCliffMaterial(p.material),channel:custom.includes(p.material)?6+custom.indexOf(p.material):channels.findIndex(c=>{const ar=biomeTerrainTile(biome,c).ar;return p.material===ar;})}));
 const masks=Array.from({length:5+custom.length},()=>new Uint8Array(mw*mw));
 const curves=strokes.map(s=>({...s,curve:new CurveIndex(sampleCurve(s.points,s.radius,1))}));
 for(let z=0;z<mw;z++)for(let x=0;x<mw;x++){
  const wx=origin+x,wz=origin+z,i=z*mw+x,h=surface.heights[i],water=surface.water[i],depth=water-h;
  const gx=Math.max(0,Math.min(field.verts-1,Math.round(wx-field.origin))),gz=Math.max(0,Math.min(field.verts-1,Math.round(wz-field.origin)));
  let grass=field.grassCoverage?.[gz*field.verts+gx]??0,road=0,stones=0,bed=0,rock=field.rockCoverage?.[gz*field.verts+gx]??0;
  for(const c of cover){const d=Math.hypot(wx-c.x,wz-c.z)/c.radius;if(d<1)grass=Math.max(grass,Math.min(1,(1-d)*6)*Math.min(1,c.density));}
  for(const s of curves){const d=s.curve.distance(wx,wz);if(d>=1)continue;const w=s.opacity*Math.min(1,(1-d)/.45);grass=grass*(1-w)+(s.layer==='grass'?w:0);road=road*(1-w)+(['road','mud'].includes(s.layer)?w:0);rock=rock*(1-w)+(s.layer==='rock'?w:0);}
  for(let j=paintVertices.offsets[i];j<paintVertices.offsets[i+1];j++){
   const p=paints[paintVertices.layers[j]];if(p.channel<0)continue;const w=p.weights[i],cliff=p.cliff;
   if(!cliff){grass=grass*(1-w)+(p.channel===1?w:0);road=road*(1-w)+(p.channel===2?w:0);stones=stones*(1-w)+(p.channel===4?w:0);rock=rock*(1-w)+(p.channel===5?w:0);bed=bed*(1-w)+(p.channel===3?w:0);}
   for(let k=5;k<masks.length;k++)if(customCliffs[k-5]===cliff)masks[k][i]=Math.round(masks[k][i]*(1-w)+(p.channel===k+1?255*w:0));
  }
  const slope=Math.hypot(surface.dx[i],surface.dz[i]);
  // Grass runs to within ~20 cm of the waterline, leaving a thin wet-sand strip (bed tile
  // ~10 cm above water) instead of a wide bare apron across the flattened bank.
  masks[0]![i]=Math.round(255*grass*Math.max(0,Math.min(1,(h-water)/.2)));
  masks[1]![i]=Math.round(255*road);
  masks[2]![i]=Math.round(255*Math.min(1,Math.max(0,(depth+.1)*5,bed)));
  masks[3]![i]=Math.round(255*stones);
  masks[4]![i]=Math.round(255*Math.max(rock,Math.min(1,Math.max(0,slope-.7))));
 }
 perf.end('Terrain · material mask raster (event)',stage);stage=perf.start();
 const kinds=[[field.baseMaterial,.25,-1,0],['grass',.25,.5,0],['dirt',.2,.5,0],['waterbed',.05,-1,0],['stones',.4,.25,0],['rock',.16,-1,1]] as const;
 const result:ImportedTerrain={version:1,source:'authored-layered',sha256:'0'.repeat(64),origin:[origin,origin],sourceOrigin:[origin,origin],blocks:[blocks,blocks],heightSamplesPerUnit:1,maskSamplesPerUnit:1,heightSize:[hw,hw],height:encoded.height,heightOffset:-16,maskSize:[mw,mw],layers:kinds.map(([name,tiling,blend,edge],i)=>({name,...biomeTerrainTile(biome,name),tiling:biomeTerrainTile(biome,name).tiling??tiling,blend:biomeTerrainTile(biome,name).blend??blend,edge,verticality:0,desaturation:0,...(i?{mask:''}:{})})),layerSlots:encoded.slots,...(field.rockCoverage?.some(v=>v>0)?{displacement:{mask:'',texture:'asset.terrain.woodland-rock-displacement',tiling:.16}}:{}),grass:[],water:[]};
 for(const id of custom)result.layers.push({name:id,ar:id,nh:id,tiling:1,blend:0,edge:0,verticality:0,desaturation:0,mask:''});
 // Resolve corner connectivity once for a render update, not once per fragment.
 // A cell entirely covered by authored textures uses its lowest layer as a full
 // base tile. Higher materials use the atlas's declared corner masks.
 const cells=field.span/4,connections=custom.map(()=>new Uint8Array(cells*cells));
 const weight=(mask:Uint8Array,x:number,z:number)=>{
  x=Math.max(0,Math.min(mw-1,x));z=Math.max(0,Math.min(mw-1,z));const ix=Math.floor(x),iz=Math.floor(z),jx=Math.min(mw-1,ix+1),jz=Math.min(mw-1,iz+1),u=x-ix,v=z-iz;
  return (mask[iz*mw+ix]*(1-u)+mask[iz*mw+jx]*u)*(1-v)+(mask[jz*mw+ix]*(1-u)+mask[jz*mw+jx]*u)*v;
 };
 for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){
  const totals=[0,0,0,0],codes=custom.map((_,j)=>{
   if(customCliffs[j])return 0;
   let code=0;for(let c=0;c<4;c++){const w=weight(masks[j+5],x*4-.5+(c%2)*4,z*4-.5+Math.floor(c/2)*4);totals[c]+=w;if(w>=127.5)code|=1<<c;}return code;
  });
  const base=totals.every(w=>w>=254)?codes.findIndex(c=>c>0):-1;
  codes.forEach((code,j)=>connections[j][z*cells+x]=code|(base===j?16:0));
 }
 connections.forEach((bytes,j)=>{
  result.layers[j+6].connections=pack(bytes);
  const variants=sourcePaint.find(p=>p.material===custom[j]&&p.variants)?.variants;
  if(variants)result.layers[j+6].variants=pack(variants);
 });
 for(let i=1;i<result.layers.length;i++)setTerrainMask(result.layers[i]!,masks[i-1]!);
 if(result.displacement)setTerrainMask(result.displacement,masks[4]!);
 perf.end('Terrain · mask bindings (event)',stage);
 return result;
}
