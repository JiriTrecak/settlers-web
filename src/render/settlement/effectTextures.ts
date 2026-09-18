import {DataTexture,RGBAFormat,LinearFilter} from 'three';
import type {EffectLayer} from '../../content/effectLayers';
/** Tiny deterministic masks. Shared by all effects; no image requests or canvas work. */
export function effectTexture(kind:EffectLayer['texture']):DataTexture {
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),a=Math.atan2(v,u);
  let alpha=0;
  if(kind==='soft')alpha=Math.max(0,1-r*r)**3;
  if(kind==='spark')alpha=Math.max(0,1-r)*Math.max(Math.exp(-Math.abs(u)*35),Math.exp(-Math.abs(v)*35),.2);
  if(kind==='rune'){
   const rings=Math.exp(-(((r-.8)*60)**2))+Math.exp(-(((r-.66)*70)**2));
   const glyph=Math.abs(Math.sin(a*12))<.2&&r>.67&&r<.79?1:0;
   alpha=Math.min(1,rings+glyph);
  }
  if(kind==='cracks'){
   const spoke=Math.abs(Math.sin(a*7+Math.sin(r*23)*.5));
   alpha=Math.max(0,1-spoke*28)*Math.max(0,1-r)*Math.min(1,r*8);
  }
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.min(1,alpha)*255);
 }
 const texture=new DataTexture(data,size,size,RGBAFormat);texture.magFilter=texture.minFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
