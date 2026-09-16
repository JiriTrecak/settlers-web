import {Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three';

/** Optional glTF material extras. Visual-only; no texture, light or simulation cost. */
export function resinShimmer(value:unknown):{strength:number;speed:number}|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 return typeof v.strength==='number'&&Number.isFinite(v.strength)&&v.strength>0&&v.strength<=1&&typeof v.speed==='number'&&Number.isFinite(v.speed)&&v.speed>=0&&v.speed<=2?{strength:v.strength,speed:v.speed}:null;
}
export class ResinShimmerLayer {
 private readonly clock={value:0};
 private readonly attached=new WeakSet<Material>();
 tick(milliseconds:number){this.clock.value=milliseconds*.001;}
 attach(root:Object3D){
  root.traverse(node=>{
   if(!(node instanceof Mesh))return;
   for(const material of Array.isArray(node.material)?node.material:[node.material]){
    const settings=resinShimmer(material.userData.resinShimmer);
    if(!(material instanceof MeshStandardMaterial)||!settings||this.attached.has(material))continue;
    this.attached.add(material);
    const before=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
     before.call(material,shader,renderer);
     shader.uniforms.uResinClock=this.clock;shader.uniforms.uResinLook={value:[settings.strength,settings.speed]};
     shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vResinPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvResinPosition=position.xz;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uResinClock; uniform vec2 uResinLook; varying vec2 vResinPosition;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
       float resinTime=uResinClock*uResinLook.y;
       vec2 resinFlow=vResinPosition*5.0;
       float resinWave=sin(resinFlow.x+sin(resinFlow.y*.73+resinTime))*cos(resinFlow.y-resinTime*.8);
       float resinRidge=pow(1.0-abs(resinWave),9.0);
       totalEmissiveRadiance*=1.0+uResinLook.x*(resinRidge-.35);
       diffuseColor.rgb*=1.0+uResinLook.x*.35*(resinRidge-.35);`);
    };
    material.customProgramCacheKey=()=>key+'/resin-shimmer-v1';material.needsUpdate=true;
   }
  });
 }
}
