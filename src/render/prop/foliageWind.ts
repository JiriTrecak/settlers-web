import {Mesh,MeshDepthMaterial,RGBADepthPacking,type Material,type Object3D} from 'three';
/** Authored GLB extras: metres of tip travel and cycles/second. Roots remain pinned. */
export type FoliageWind={amplitude:number;speed:number};
export function foliageWind(value:unknown):FoliageWind|null{
 if(!value||typeof value!=='object')return null;
 const o=value as Record<string,unknown>;
 return typeof o.amplitude==='number'&&Number.isFinite(o.amplitude)&&o.amplitude>0&&o.amplitude<=.5&&typeof o.speed==='number'&&Number.isFinite(o.speed)&&o.speed>=0&&o.speed<=3?{amplitude:o.amplitude,speed:o.speed}:null;
}
export class FoliageWindLayer {
 private readonly time={value:0};
 private depths:MeshDepthMaterial[]=[];
 tick(milliseconds:number){this.time.value=milliseconds*.001;}
 attach(root:Object3D,settings:FoliageWind,height:number){
  const attached=new Set<Material>();
  const hook=(material:Material)=>{
   if(attached.has(material))return;attached.add(material);
   const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
   material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.uFoliageClock=this.time;
    shader.uniforms.uFoliageWind={value:[settings.amplitude,settings.speed,Math.max(.1,height)]};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uFoliageClock; uniform vec3 uFoliageWind;')
     .replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 foliageAnchor=modelMatrix[3].xyz;
      #ifdef USE_INSTANCING
       foliageAnchor=(modelMatrix*instanceMatrix[3]).xyz;
      #endif
      float foliageBend=pow(clamp(position.y/uFoliageWind.z,0.,1.),2.);
      float foliagePhase=uFoliageClock*uFoliageWind.y*6.283185+foliageAnchor.x*.37+foliageAnchor.z*.29;
      transformed.x+=sin(foliagePhase)*foliageBend*uFoliageWind.x;
      transformed.z+=cos(foliagePhase*.73)*foliageBend*uFoliageWind.x*.55;`);
   };
   material.customProgramCacheKey=()=>cache()+'/foliage-wind-v1';material.needsUpdate=true;
  };
  root.traverse(node=>{
   if(!(node instanceof Mesh))return;
   for(const m of Array.isArray(node.material)?node.material:[node.material])hook(m);
   const depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking});hook(depth);node.customDepthMaterial=depth;this.depths.push(depth);
  });
 }
 dispose(){for(const d of this.depths)d.dispose();this.depths=[];}
}
