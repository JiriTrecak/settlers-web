import {z} from 'zod';
import {MAP_HALO} from './map';
import type {HeightField} from './height';

const packed=z.string();
/** Editable samples, not generator inputs or a render cache. Arrays are packed
 * only to keep JSON documents small. All floats have explicit little-endian encoding. */
export const terrainDataSchema=z.object({
 version:z.literal(1),size:z.number().int().min(16).max(2048),
 heights:packed,waterHeights:packed,waterFlow:packed,waterProfiles:z.array(z.string().min(1)).max(255),
 grass:packed,rock:packed,
 paint:z.array(z.object({material:z.string().min(1),weights:packed}).strict()).max(256),
}).strict().superRefine((data,ctx)=>{
 const span=data.size+MAP_HALO*2,n=(span+1)**2;
 for(const [name,value,count,float] of [
  ['heights',data.heights,n,true],['waterHeights',data.waterHeights,n,true],
  ['grass',data.grass,n,true],['rock',data.rock,n,true],['waterFlow',data.waterFlow,span*span*4,false],
  ...data.paint.map((p,i)=>[`paint.${i}`,p.weights,n,true] as const),
 ] as const){
  try{const bytes=decodeBytes(value);if(bytes.length!==count*(float?4:1))throw Error('Wrong dimensions');
   if(float){const view=new DataView(bytes.buffer);for(let i=0;i<count;i++)if(!Number.isFinite(view.getFloat32(i*4,true)))throw Error('Non-finite sample');}
   else for(let i=3;i<bytes.length;i+=4)if(bytes[i]>data.waterProfiles.length)throw Error('Unknown water profile');
  }catch(error){ctx.addIssue({code:'custom',path:[name],message:(error as Error).message});}
 }
 if(new Set(data.paint.map(p=>p.material)).size!==data.paint.length)ctx.addIssue({code:'custom',path:['paint'],message:'Duplicate ground material'});
});
export type TerrainData=z.infer<typeof terrainDataSchema>;
export type CellWater={heights:Float32Array;flow:Uint8Array;profiles:string[]};

export function encodeBytes(bytes:Uint8Array):string{
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export function decodeBytes(text:string):Uint8Array{return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export function encodeFloats(values:ArrayLike<number>):string{
 const bytes=new Uint8Array(values.length*4),view=new DataView(bytes.buffer);
 for(let i=0;i<values.length;i++)view.setFloat32(i*4,values[i]!,true);return encodeBytes(bytes);
}
export function decodeFloats(text:string):Float32Array{
 const bytes=decodeBytes(text),view=new DataView(bytes.buffer),out=new Float32Array(bytes.length/4);
 for(let i=0;i<out.length;i++)out[i]=view.getFloat32(i*4,true);return out;
}
export function cellWaterAt(field:HeightField,x:number,z:number):number|undefined{
 const water=field.cellWater;if(!water)return undefined;
 const gx=Math.max(0,Math.min(field.span,x-field.origin)),gz=Math.max(0,Math.min(field.span,z-field.origin));
 const ix=Math.floor(gx),iz=Math.floor(gz),jx=Math.min(ix+1,field.span),jz=Math.min(iz+1,field.span),u=gx-ix,v=gz-iz,w=field.verts,h=water.heights;
 return (h[iz*w+ix]*(1-u)+h[iz*w+jx]*u)*(1-v)+(h[jz*w+ix]*(1-u)+h[jz*w+jx]*u)*v;
}
export function restoreTerrain(field:HeightField,data:TerrainData):void{
 if(data.size!==field.size)throw Error('Terrain dimensions disagree with map');
 field.source=undefined;field.sourceWater=undefined;field.courseWater=undefined;field.watercourses=[];
 field.samples.set(decodeFloats(data.heights));
 field.grassCoverage=decodeFloats(data.grass);field.rockCoverage=decodeFloats(data.rock);
 field.surfacePaint=data.paint.map(p=>({owner:'terrain',material:p.material,weights:decodeFloats(p.weights)}));
 field.cellWater={heights:decodeFloats(data.waterHeights),flow:decodeBytes(data.waterFlow),profiles:[...data.waterProfiles]};
}

/** A new editable map starts with explicit flat cells, not a generation recipe. */
export function flatTerrainData(size:number,ground=0,water=-1):TerrainData{
 const span=size+MAP_HALO*2,n=(span+1)**2,flow=new Uint8Array(span*span*4);
 for(let i=0;i<flow.length;i+=4)flow[i]=flow[i+1]=128;
 const zero=encodeFloats(new Float32Array(n));
 return {version:1,size,heights:ground===0?zero:encodeFloats(new Float32Array(n).fill(ground)),waterHeights:encodeFloats(new Float32Array(n).fill(water)),waterFlow:encodeBytes(flow),waterProfiles:[],grass:zero,rock:zero,paint:[]};
}
