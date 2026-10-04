import {Mesh,MeshDepthMaterial,RGBADepthPacking,type Material,type Object3D} from 'three';
/** Screen-door transparency keeps depth sorting and instanced rendering stable. */
export const CONCEALMENT_DISCARD='if(fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)>utcConcealment)discard;';
export class ConcealmentVisuals {
 private roots=new Map<Object3D,{uniform:{value:number};restore:()=>void}>();
 set(root:Object3D,opacity:number){
  root.userData.concealmentOpacity=opacity;
  const existing=this.roots.get(root);if(existing){existing.uniform.value=opacity;return;}
  if(opacity>=1)return;
  const uniform={value:opacity},restore:(()=>void)[]=[],clones=new Map<Material,Material>();
  const clone=(original:Material)=>{
   let material=clones.get(original);if(material)return material;
   material=original.clone();const before=original.onBeforeCompile,key=original.customProgramCacheKey();
   material.onBeforeCompile=(shader,renderer)=>{before.call(material,shader,renderer);shader.uniforms.utcConcealment=uniform;shader.fragmentShader='uniform float utcConcealment;\n'+shader.fragmentShader.replace('void main() {','void main() {\n'+CONCEALMENT_DISCARD);};
   material.customProgramCacheKey=()=>key+'|concealment-v1';clones.set(original,material);return material;
  };
  root.traverse(object=>{if(!(object instanceof Mesh))return;
   const original=object.material,depth=object.customDepthMaterial;
   object.material=Array.isArray(original)?original.map(clone):clone(original);
   const fallback=depth?undefined:new MeshDepthMaterial({depthPacking:RGBADepthPacking});
   object.customDepthMaterial=clone(depth??fallback!);
   restore.push(()=>{object.material=original;object.customDepthMaterial=depth;fallback?.dispose();});
  });
  this.roots.set(root,{uniform,restore:()=>{restore.forEach(f=>f());clones.forEach(m=>m.dispose());}});
 }
 remove(root:Object3D){this.roots.get(root)?.restore();this.roots.delete(root);delete root.userData.concealmentOpacity;}
 dispose(){for(const root of this.roots.keys())this.remove(root);}
}
