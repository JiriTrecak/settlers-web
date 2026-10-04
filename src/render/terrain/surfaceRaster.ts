import {heightChange} from '../../shared/map/heightChanges';
import type {HeightField} from '../../shared/map/height';

export type SurfaceRaster={heights:Float64Array;water:Float64Array;dx:Float64Array;dz:Float64Array};
const sources=new WeakMap<SurfaceRaster,{field:HeightField|null;xs:Float64Array;zs:Float64Array;slopeStep:number}>();
/** Sample geometry separately from material/vegetation coverage. Owners may
 * reuse this raster only after verifying that heights and water are unchanged.
 * Doubles preserve the exact scalar query results; this is not a lower-res LOD. */
export function sampleSurfaceRaster(field:HeightField|null,xs:Float64Array,zs:Float64Array,slopeStep:number):SurfaceRaster{
 const count=xs.length*zs.length,heights=new Float64Array(count),water=new Float64Array(count),dx=new Float64Array(count),dz=new Float64Array(count);
 for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++){
  const wx=xs[x],wz=zs[z],i=z*xs.length+x;
  heights[i]=field?.sample(wx,wz)??1;water[i]=field?.waterAt(wx,wz)??0;
  if(field){dx[i]=field.sample(wx+slopeStep,wz)-field.sample(wx-slopeStep,wz);dz[i]=field.sample(wx,wz+slopeStep)-field.sample(wx,wz-slopeStep);}
 }
 const raster={heights,water,dx,dz};sources.set(raster,{field,xs:xs.slice(),zs:zs.slice(),slopeStep});return raster;
}

/** Retain exact samples outside an immutable compiler delta. An untracked/mutable
 * field returns undefined so the owner falls back to a full sample. */
export function updateSurfaceRaster(previous:SurfaceRaster|undefined,field:HeightField|null,sameSurface=false):SurfaceRaster|undefined{
 if(!previous)return undefined;const source=sources.get(previous);if(!source)return undefined;
 if(sameSurface&&source.field?.size===field?.size){source.field=field;return previous;}
 const change=heightChange(field,source.field);if(!change||!field)return undefined;
 if(!change.bounds&&change.waterUnchanged){source.field=field;return previous;}
 const {xs,zs,slopeStep}=source,b=change.bounds;
 const raster:SurfaceRaster={heights:b?previous.heights.slice():previous.heights,dx:b?previous.dx.slice():previous.dx,dz:b?previous.dz.slice():previous.dz,water:change.waterUnchanged?previous.water:previous.water.slice()};
 // Bilinear interpolation reads a neighbouring vertex. Queries outside the map
 // clamp to boundary samples, so an edited edge extends all the way outward.
 const pad=1+slopeStep,minX=b?(b.loX===0?-Infinity:field.origin+b.loX-pad):Infinity,maxX=b?(b.hiX===field.verts-1?Infinity:field.origin+b.hiX+pad):-Infinity;
 const minZ=b?(b.loZ===0?-Infinity:field.origin+b.loZ-pad):Infinity,maxZ=b?(b.hiZ===field.verts-1?Infinity:field.origin+b.hiZ+pad):-Infinity;
 for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++){
  const wx=xs[x],wz=zs[z],i=z*xs.length+x;
  if(!change.waterUnchanged)raster.water[i]=field.waterAt(wx,wz);
  if(wx<minX||wx>maxX||wz<minZ||wz>maxZ)continue;
  raster.heights[i]=field.sample(wx,wz);raster.dx[i]=field.sample(wx+slopeStep,wz)-field.sample(wx-slopeStep,wz);raster.dz[i]=field.sample(wx,wz+slopeStep)-field.sample(wx,wz-slopeStep);
 }
 sources.set(raster,{...source,field});return raster;
}
