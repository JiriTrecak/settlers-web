import {Data3DTexture,RedFormat,LinearFilter,RepeatWrapping} from 'three';
/** 32 KiB repeating value-noise lattice; one filtered sample replaces eight hashes per march step. */
export function createAtmosphereNoise(){
 const size=32,data=new Uint8Array(size**3),fract=(v:number)=>v-Math.floor(v);
 for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let a=fract(x*.1031),b=fract(y*.1031),c=fract(z*.1031);
  const d=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);a+=d;b+=d;c+=d;
  data[x+y*size+z*size*size]=Math.round(fract((a+b)*c)*255);
 }
 const texture=new Data3DTexture(data,size,size,size);texture.format=RedFormat;texture.minFilter=texture.magFilter=LinearFilter;texture.wrapS=texture.wrapT=texture.wrapR=RepeatWrapping;texture.unpackAlignment=1;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
