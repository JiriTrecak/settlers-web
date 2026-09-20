import {ClampToEdgeWrapping,Data3DTexture,LinearFilter,NoColorSpace,RGBAFormat,UnsignedByteType} from 'three';
import source from '../../../assets/library/asset.unregistered.textures.grading.scouring-reference-luts.json/data.json';
import type {DaytimeId,DaytimeSample} from '../../shared/environment/dayCycle';

/** The reference's uncompressed 16³ BGRX DDS volumes, losslessly converted to RGBA. */
export function createDaytimeLuts() {
 const textures={} as Record<DaytimeId,Data3DTexture>;
 for(const id of Object.keys(source) as DaytimeId[]){
  const {size,rgba}=source[id];
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
  pair:(sample:DaytimeSample)=>({from:textures[sample.from],to:textures[sample.to],blend:sample.blend}),
  dispose:()=>Object.values(textures).forEach(t=>t.dispose()),
 };
}
