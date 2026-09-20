import {Mesh,MeshDepthMaterial,RGBADepthPacking,ShaderChunk,type Material,type Object3D,type Vector2} from 'three';
import {sourceTreeSwayGLSL} from './sourceTreeSway';
/** Authored GLB extras: metres of tip travel and cycles/second. Roots remain pinned. */
export type FoliageWind={amplitude:number;speed:number};
export function foliageWind(value:unknown):FoliageWind|null{
 if(!value||typeof value!=='object')return null;
 const o=value as Record<string,unknown>;
 return typeof o.amplitude==='number'&&Number.isFinite(o.amplitude)&&o.amplitude>0&&o.amplitude<=.5&&typeof o.speed==='number'&&Number.isFinite(o.speed)&&o.speed>=0&&o.speed<=3?{amplitude:o.amplitude,speed:o.speed}:null;
}
export class FoliageWindLayer {
 private readonly time={value:0};
 private depths=new Set<MeshDepthMaterial>();
 tick(milliseconds:number){this.time.value=milliseconds*.001;}
 attach(root:Object3D,settings:FoliageWind,height:number,sourceOffset?:{value:Vector2}){
  const attached=new Set<Material>(),depths:MeshDepthMaterial[]=[];
  const hook=(material:Material)=>{
   if(attached.has(material))return;attached.add(material);
   const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
   material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    const leaf=!!material.userData.foliage;
    if(leaf&&!shader.vertexShader.includes('attribute vec4 _leaf;'))shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 _leaf;');
    shader.uniforms.uFoliageClock=this.time;
    if(sourceOffset){
     shader.uniforms.uSourceWindOffset=sourceOffset;
     shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nuniform vec2 uSourceWindOffset;\n${sourceTreeSwayGLSL}`);
     // Source instance B is shelter, not albedo. Keep authored vertex AO intact.
     shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;',''));
    }
    shader.uniforms.uFoliageWind={value:[settings.amplitude,settings.speed,Math.max(.1,height)]};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uFoliageClock; uniform vec3 uFoliageWind;')
     .replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 foliageAnchor=modelMatrix[3].xyz;
      #ifdef USE_INSTANCING
       foliageAnchor=(modelMatrix*instanceMatrix[3]).xyz;
      #endif
      float foliageBend=pow(clamp(position.y/uFoliageWind.z,0.,1.),2.);
      float foliagePhase=uFoliageClock*uFoliageWind.y*6.283185+foliageAnchor.x*.37+foliageAnchor.z*.29;
      ${sourceOffset?'':`transformed.x+=sin(foliagePhase)*foliageBend*uFoliageWind.x;
      transformed.z+=cos(foliagePhase*.73)*foliageBend*uFoliageWind.x*.55;`}
      ${leaf?`// Source pivot offsets have a four-unit packing range. Preserve
      // branch length while adding the faster, independently phased leaf motion.
      vec3 leafOffset=(_leaf.rgb*2.-1.)*4.;
      float leafLength=length(leafOffset);
      float leafMask=clamp(leafLength/1.5,0.,1.)*step(.001,_leaf.a);
      vec3 pivot=position-leafOffset;
      float leafPhase=uFoliageClock*2.1+dot(pivot+foliageAnchor,vec3(.73,.41,.57));
      vec3 leafTravel=vec3(sin(leafPhase),sin(leafPhase*.63)*.2,cos(leafPhase*.81))*uFoliageWind.x*.45*leafMask;
      transformed+=normalize(leafOffset+leafTravel+vec3(.000001))*leafLength-leafOffset;
      ${sourceOffset?'':'transformed=normalize(transformed+vec3(.000001))*length(position);'}`:''}
      ${sourceOffset?`
      mat4 sourceWorld=modelMatrix;
      float shelter=0.;
      #ifdef USE_INSTANCING
       sourceWorld=modelMatrix*instanceMatrix;
      #endif
      #ifdef USE_INSTANCING_COLOR
       shelter=instanceColor.r;
      #endif
      vec3 sourcePosition=(sourceWorld*vec4(transformed,1.)).xyz;
      vec3 sourceBent=sourceTreeSway(sourcePosition,sourceWorld[3].xyz,position.y,uFoliageWind.z,length(sourceWorld[1].xyz),shelter,uFoliageClock,uSourceWindOffset);
      transformed+=inverse(mat3(sourceWorld))*(sourceBent-sourcePosition);
      `:''}`);
   };
   material.customProgramCacheKey=()=>cache()+'/foliage-wind-v3-'+Boolean(material.userData.foliage)+'-'+!!sourceOffset;material.needsUpdate=true;
  };
  root.traverse(node=>{
   if(!(node instanceof Mesh))return;
   if(node.userData.underlay)return;
   if(sourceOffset)node.userData.sourceTreeWind=true;
   for(const m of Array.isArray(node.material)?node.material:[node.material])hook(m);
   const source=(Array.isArray(node.material)?node.material[0]:node.material) as import('three').MeshStandardMaterial;
   const depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking,map:source.map,alphaTest:source.alphaTest,side:source.side});depth.userData.foliage=source.userData.foliage;hook(depth);node.customDepthMaterial=depth;this.depths.add(depth);depths.push(depth);
  });
  return ()=>{for(const depth of depths){if(this.depths.delete(depth))depth.dispose();}};
 }
 dispose(){for(const d of this.depths)d.dispose();this.depths.clear();}
}
