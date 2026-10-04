import {Vector4,type Material} from 'three';
import type {VisualLayer} from '../../content/effects/schema';
export type Flipbook=NonNullable<VisualLayer['flipbook']>;
type AnimatedMaterial={definition:Flipbook;rect:{value:Vector4}};
const animated=new WeakMap<Material,AnimatedMaterial>();

/** Row-major frames, starting at the image's top left; no mutable playback clock. */
export function flipbookFrame(definition:Flipbook,ageTicks:number,seed=0){
 const d=definition,phase=d.randomStart?Math.floor(Math.max(0,Math.min(.999999,seed))*d.frames):0;
 const step=Math.floor(Math.max(0,ageTicks)/d.frameTicks)+phase;
 const cycle=Math.max(1,d.frames*2-2),ping=step%cycle;
 const frame=d.mode==='once'?Math.min(d.frames-1,step):d.mode==='loop'?step%d.frames:Math.min(ping,cycle-ping);
 return d.firstFrame+frame;
}
export function sampleFlipbook(material:Material,ageTicks:number,seed=0){
 const a=animated.get(material);if(!a)return;
 const d=a.definition,frame=flipbookFrame(d,ageTicks,seed);
 a.rect.value.set(1/d.columns,1/d.rows,(frame%d.columns)/d.columns,1-(Math.floor(frame/d.columns)+1)/d.rows);
}
/** Each material owns its UV uniform; every sprite still shares the same texture. */
export function configureFlipbook(material:Material,definition:Flipbook){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),rect={value:new Vector4()};
 animated.set(material,{definition,rect});sampleFlipbook(material,0);
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);shader.uniforms.uEffectAtlas=rect;
  shader.vertexShader='uniform vec4 uEffectAtlas;\n'+shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * uEffectAtlas.xy + uEffectAtlas.zw;\n#endif');
 };
 material.customProgramCacheKey=()=>key+'|effect-atlas-v1';
}
