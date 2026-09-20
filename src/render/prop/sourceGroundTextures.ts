import {DataTexture,FloatType,RedFormat,RGBAFormat,NearestFilter,LinearFilter,Vector2,Vector4} from 'three';
import {unpackSourceBytes,type SourceHeight,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {liveSourceOcclusion,type OcclusionRect} from './liveSourceOcclusion';

const shared=new WeakMap<ImportedTerrain,SourceGroundTextures>();
/** Immutable imported terrain shares GPU images across terrain, grass and props.
 * One occlusion listener resamples/uploads changed rows for all consumers. */
export function acquireSourceGround(field:SourceHeight){
 let result=shared.get(field.source);
 if(!result){result=new SourceGroundTextures(field);shared.set(field.source,result);}
 result.users++;return result;
}
export function releaseSourceGround(textures:SourceGroundTextures){
 if(--textures.users===0){textures.dispose();shared.delete(textures.source.source);}
}
export class SourceGroundTextures {
 users=0;
 private unsubscribeOcclusion?:()=>void;
 readonly occlusionLayout={value:new Vector4(0,0,1,1)};
 readonly occlusionSize={value:new Vector2(1,1)};
 readonly color={value:new DataTexture(new Uint8Array([128,128,128,255]),1,1)};
 readonly underlay={value:new DataTexture(new Uint8Array([0,255,255,255]),1,1)};
 readonly colorLayout={value:new Vector4(0,0,1,1)};
 readonly sourceOffset={value:new Vector2()};
 readonly macroScale={value:.02};
 readonly colorEnabled={value:0};
 readonly texture={value:new DataTexture(new Float32Array(1),1,1,RedFormat,FloatType)};
 readonly grid={value:new Vector2(0,1)};
 readonly layout={value:new Vector4(0,0,1,1)};
 readonly dimensions={value:new Vector2(1,1)};
 constructor(readonly source:SourceHeight){
  const field=source;
  this.color.value.needsUpdate=true;
  const src=field.source,c=src.groundColor;this.colorEnabled.value=c?1:0;
  this.sourceOffset.value.set(src.origin[0]-src.sourceOrigin[0],src.origin[1]-src.sourceOrigin[1]);this.macroScale.value=.01;
  this.colorLayout.value.set(...src.origin,1/(src.blocks[0]*16),1/(src.blocks[1]*16));
  if(c){this.color.value.dispose();this.color.value=new DataTexture(unpackSourceBytes(c.rgba),...c.size);this.color.value.minFilter=this.color.value.magFilter=LinearFilter;this.color.value.needsUpdate=true;}
  this.underlay.value.dispose();
  const mask=src.underlayMask,ao=src.occlusion;
  const size=mask?.size??ao?.size??[1,1] as [number,number];
  const maskBytes=mask?unpackSourceBytes(mask.mask):undefined,aoBytes=ao?liveSourceOcclusion(src).rgba:undefined;
  const combined=new Uint8Array(size[0]*size[1]*4);
  // Existing underlay R is preserved. GBA are free, so the ambient bands cost
  // no extra fragment sampler (terrain already reaches WebGL's minimum 16).
  for(let z=0;z<size[1];z++)for(let x=0;x<size[0];x++){
   const offset=(z*size[0]+x)*4;combined[offset]=maskBytes?.[z*size[0]+x]??0;
   for(let c=0;c<3;c++){
    let value=255;
    if(ao&&aoBytes){
     const fx=x*(ao.size[0]-1)/Math.max(1,size[0]-1),fz=z*(ao.size[1]-1)/Math.max(1,size[1]-1),ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
     const at=(xx:number,zz:number)=>aoBytes[(Math.min(ao.size[1]-1,zz)*ao.size[0]+Math.min(ao.size[0]-1,xx))*4+c]!;
     value=(at(ix,iz)*(1-tx)+at(ix+1,iz)*tx)*(1-tz)+(at(ix,iz+1)*(1-tx)+at(ix+1,iz+1)*tx)*tz;
    }
    combined[offset+c+1]=Math.round(value);
   }
  }
  this.underlay.value=new DataTexture(combined,...size);
  this.underlay.value.minFilter=this.underlay.value.magFilter=LinearFilter;this.underlay.value.needsUpdate=true;
  this.occlusionSize.value.set(...size);
  this.occlusionLayout.value.set(...src.origin,(size[0]-1)/(src.blocks[0]*16),(size[1]-1)/(src.blocks[1]*16));
  const [w,h]=field.source.heightSize;this.texture.value.dispose();
  const data=new Float32Array(w*h*4);
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
   const i=z*w+x;data[i*4]=field.values[i]!*64/65535+field.source.heightOffset;
   if(ao&&aoBytes){
    const fx=x*(ao.size[0]-1)/(w-1),fz=z*(ao.size[1]-1)/(h-1),ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
    const at=(xx:number,zz:number)=>aoBytes[(Math.min(ao.size[1]-1,zz)*ao.size[0]+Math.min(ao.size[0]-1,xx))*4+3]!/255;
    data[i*4+1]=(at(ix,iz)*(1-tx)+at(ix+1,iz)*tx)*(1-tz)+(at(ix,iz+1)*(1-tx)+at(ix+1,iz+1)*tx)*tz;
   }
  }
  this.texture.value=new DataTexture(data,w,h,RGBAFormat,FloatType);this.texture.value.minFilter=this.texture.value.magFilter=NearestFilter;this.texture.value.needsUpdate=true;
  this.layout.value.set(...field.source.origin,3,3);this.dimensions.value.set(w,h);
  this.unsubscribeOcclusion=liveSourceOcclusion(src).subscribe(rect=>this.refreshOcclusion(rect));
 }
 /** Update changed texels only. Three's partial texture uploads require RGBA,
  * so source heights keep R and sprite offsets G in a four-channel float image. */
 private refreshOcclusion(rect:OcclusionRect){
  const src=this.source!.source,ao=src.occlusion!,[aw,ah]=ao.size,bytes=liveSourceOcclusion(src).rgba;
  const sample=(x:number,z:number,c:number)=>{
   const ix=Math.floor(x),iz=Math.floor(z),tx=x-ix,tz=z-iz,jx=Math.min(aw-1,ix+1),jz=Math.min(ah-1,iz+1);
   return (bytes[(iz*aw+ix)*4+c]!*(1-tx)+bytes[(iz*aw+jx)*4+c]!*tx)*(1-tz)+(bytes[(jz*aw+ix)*4+c]!*(1-tx)+bytes[(jz*aw+jx)*4+c]!*tx)*tz;
  };
  for(const target of [this.underlay.value,this.texture.value]){
   const w=target.image.width,h=target.image.height,data=target.image.data!;
   // Include the bilinear interpolation apron around each changed source cell.
   const x0=Math.max(0,Math.floor((rect.x0-1)*(w-1)/(aw-1))),x1=Math.min(w-1,Math.ceil((rect.x1+1)*(w-1)/(aw-1)));
   const z0=Math.max(0,Math.floor((rect.z0-1)*(h-1)/(ah-1))),z1=Math.min(h-1,Math.ceil((rect.z1+1)*(h-1)/(ah-1)));
   for(let z=z0;z<=z1;z++){
    for(let x=x0;x<=x1;x++){
     const ax=x*(aw-1)/(w-1),az=z*(ah-1)/(h-1),offset=(z*w+x)*4;
     if(target===this.underlay.value){for(let c=0;c<3;c++)data[offset+c+1]=Math.round(sample(ax,az,c));}
     else data[offset+1]=sample(ax,az,3)/255;
    }
    target.addUpdateRange((z*w+x0)*4,(x1-x0+1)*4);
   }
   target.needsUpdate=true;
  }
 }
 dispose(){this.unsubscribeOcclusion?.();this.texture.value.dispose();this.color.value.dispose();this.underlay.value.dispose();}
}
