import {spriteOcclusion,sampleSprite} from '../../../src/shared/map/occlusionSprites';
export {spriteOcclusion} from '../../../src/shared/map/occlusionSprites';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Matrix4,Quaternion,Vector3,Box3} from 'three';
import type {MapStamp} from '../../../src/shared/map/utcmap';
import type {SourceHeight} from '../../../src/shared/map/importedTerrain';

export type OcclusionVolume={boundsMin:number[];boundsMax:number[];size:number[];axes:string[];decodedBytes:number;decodedSha256:string;sourceSha256:string;source:string};
/** D3D clamp-linear normalized coordinates: texel centers are (i+.5)/size.
 * Storage order is X fastest, then model Z, then model Y. */
export function sampleVolume(data:Uint8Array,size:readonly number[],uv:readonly number[]):number {
 const p=size.map((n,i)=>Math.max(0,Math.min(n-1,uv[i]!*n-.5))),a=p.map(Math.floor),f=p.map((v,i)=>v-a[i]!);
 const at=(x:number,y:number,z:number)=>data[(Math.min(size[2]!-1,z)*size[1]!+Math.min(size[1]!-1,y))*size[0]!+Math.min(size[0]!-1,x)]!/255;
 let result=0;
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)result+=at(a[0]!+x,a[1]!+y,a[2]!+z)*(x?f[0]!:1-f[0]!)*(y?f[1]!:1-f[1]!)*(z?f[2]!:1-f[2]!);
 return result;
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/** LightMapCompute.fx::ComputeOcclusionLevel + occlusionModelPS. */
export function modelOcclusion(volume:OcclusionVolume,data:Uint8Array,inverse:Matrix4,world:Vector3,intensity=1):[number,number,number]{
 const local=new Vector3(),size=volume.boundsMax.map((v,i)=>v-volume.boundsMin[i]!);
 function level(offset:number,samples:number){
  let sum=0;
  for(let i=0;i<samples;i++){
   local.copy(world);local.y+=offset+i;local.applyMatrix4(inverse);
   const uv=[(local.x-volume.boundsMin[0]!)/size[0]!, (local.y-volume.boundsMin[1]!)/size[1]!, (local.z-volume.boundsMin[2]!)/size[2]!];
   let occlusion=sampleVolume(data,volume.size,[uv[0]!,uv[2]!,uv[1]!]);
   // Source fades both vertical borders even though the volume sampler clamps.
   occlusion+=(1-occlusion)*clamp((uv[1]!-.8)/.2);
   occlusion=1+(occlusion-1)*clamp(uv[1]!/.2);sum+=occlusion;
  }return sum/samples;
 }
 const b=level(6,3),g=Math.min(b,level(4.5,2)),r=Math.min(g,level(4,1));
 return [r,g,b].map(v=>1-(1-v)*.9*intensity) as [number,number,number];
}
/** Static model contribution only. Engine RT density, overlap blend and model
 * intensity are absent from the pack: 1 texel/unit, min and 1 are explicit choices.
 * Trees' sprite contribution must be added separately once its binding is verified. */
export function rasterModelOcclusion(stamps:readonly MapStamp[],volumes:Map<string,{metadata:OcclusionVolume;path:string}>,terrain:SourceHeight){
 const src=terrain.source,width=src.blocks[0]*16+1,height=src.blocks[1]*16+1;
 const rgba=new Uint8Array(width*height*4);for(let i=0;i<rgba.length;i+=4)rgba.fill(255,i,i+3);
 const cache=new Map<string,Uint8Array>();let instances=0;const sources=new Set<string>();
 const point=new Vector3();
 for(const stamp of stamps){
  const record=volumes.get(stamp.asset);if(!record||!stamp.sourceTransform)continue;
  const {metadata:v,path}=record;
  let data=cache.get(path);if(!data){data=gunzipSync(readFileSync(path));if(data.length!==v.decodedBytes||createHash('sha256').update(data).digest('hex')!==v.decodedSha256)throw Error('Invalid ODF payload');cache.set(path,data);}
  const matrix=new Matrix4().compose(new Vector3(stamp.x+.5,stamp.sourceTransform.height,stamp.y+.5),new Quaternion(...stamp.sourceTransform.quaternion),new Vector3().setScalar(stamp.scale??1)),inverse=matrix.clone().invert();
  const bounds=new Box3(new Vector3(...v.boundsMin as [number,number,number]),new Vector3(...v.boundsMax as [number,number,number])).applyMatrix4(matrix);
  const x0=Math.max(0,Math.floor(bounds.min.x-src.origin[0])),x1=Math.min(width-1,Math.ceil(bounds.max.x-src.origin[0]));
  const z0=Math.max(0,Math.floor(bounds.min.z-src.origin[1])),z1=Math.min(height-1,Math.ceil(bounds.max.z-src.origin[1]));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   point.set(src.origin[0]+x,terrain.sample(src.origin[0]+x,src.origin[1]+z),src.origin[1]+z);
   const ao=modelOcclusion(v,data,inverse,point),offset=(z*width+x)*4;
   for(let c=0;c<3;c++)rgba[offset+c]=Math.min(rgba[offset+c]!,Math.round(ao[c]!*255));
  }
  instances++;sources.add(v.source);
 }
 return {rgba,size:[width,height] as [number,number],instances,sources:[...sources].sort(),density:1,blend:'minimum',modelIntensity:1};
}

export type PlantOccluder={stamp:MapStamp;size:[number,number];height:number;intensity:number};
/** Fir sprite footprints follow source positions/scale and active XML sizes.
 * Height = transformed geometry bounds, intensity = XML (no inferred obscurance
 * attenuation). Runtime bounds/ObscureInfluence handling remain unverified. */
export function addPlantOcclusion(raster:{rgba:Uint8Array;size:[number,number]},plants:readonly PlantOccluder[],sprite:Uint8Array,spriteSize:readonly number[],origin:readonly number[]){
 const [width,height]=raster.size;
 for(const {stamp,size,height:casterHeight,intensity} of plants){
  const scale=stamp.scale??1,sx=size[0]*scale,sz=size[1]*scale;
  const centerX=stamp.x+.5-origin[0]!,centerZ=stamp.y+.5-origin[1]!;
  if(Math.abs(size[0]-size[1])>1e-6)throw Error('Non-square source occlusion sprite needs verified rotation mapping');
  const minX=Math.max(0,Math.ceil(centerX-sx/2)),maxX=Math.min(width-1,Math.floor(centerX+sx/2));
  const minZ=Math.max(0,Math.ceil(centerZ-sz/2)),maxZ=Math.min(height-1,Math.floor(centerZ+sz/2));
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
   const u=(x-centerX)/sx+.5,v=(z-centerZ)/sz+.5;
   const red=sampleSprite(sprite,spriteSize[0]!,spriteSize[1]!,u,v);
   const bands=spriteOcclusion(red,u,v,casterHeight,intensity),offset=(z*width+x)*4;
   for(let c=0;c<3;c++)raster.rgba[offset+c]=Math.min(raster.rgba[offset+c]!,Math.round(bands[c]!*255));
   raster.rgba[offset+3]=Math.max(raster.rgba[offset+3]!,Math.round(bands[3]*255));
  }
 }
 return plants.length;
}
