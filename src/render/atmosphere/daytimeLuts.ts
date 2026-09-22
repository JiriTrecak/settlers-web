import {ClampToEdgeWrapping,Data3DTexture,LinearFilter,NoColorSpace,RGBAFormat,UnsignedByteType} from 'three';
import source from '../../../assets/library/asset.texture.woodland-daytime-grades/data.json';
import type {DaytimeId,DaytimeSample} from '../../shared/environment/dayCycle';

/** Original channel curves, authored as a filterable 32³ color volume. */
export function createDaytimeLuts() {
 const textures={} as Record<DaytimeId|'winter_day',Data3DTexture>;
 const volumes=source;
 for(const id of Object.keys(volumes) as (DaytimeId|'winter_day')[]){
  const {size,rgba}=volumes[id];
  const data=Uint8Array.from(atob(rgba),c=>c.charCodeAt(0));
  const texture=new Data3DTexture(data,size,size,size);
  texture.name=`Daytime LUT · ${id}`;
  texture.format=RGBAFormat;texture.type=UnsignedByteType;texture.colorSpace=NoColorSpace;
  texture.minFilter=texture.magFilter=LinearFilter;
  texture.wrapS=texture.wrapT=texture.wrapR=ClampToEdgeWrapping;
  texture.unpackAlignment=1;texture.generateMipmaps=false;texture.needsUpdate=true;
  textures[id]=texture;
 }
 return {
  textures,
  pair:(sample:DaytimeSample)=>({from:textures[sample.profile==='winter'&&sample.from==='day'?'winter_day':sample.from],to:textures[sample.profile==='winter'&&sample.to==='day'?'winter_day':sample.to],blend:sample.blend}),
  dispose:()=>Object.values(textures).forEach(t=>t.dispose()),
 };
}
