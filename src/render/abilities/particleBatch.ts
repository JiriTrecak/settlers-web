import {AdditiveBlending,BufferGeometry,Camera,Color,DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Scene,Sprite,Vector3} from 'three';
type FrameBatches={owners:Map<object,readonly ParticleBatch[]>;previous:Scene['onBeforeRender'];hook:Scene['onBeforeRender']};
const frameBatches=new WeakMap<Scene,FrameBatches>();
/** Mesh.onBeforeRender runs AFTER Three uploads instance buffers. Prepare at the
 * scene boundary instead, with the actual pass camera, before render-list upload. */
export function bindParticleBatches(scene:Scene,owner:object,batches:readonly ParticleBatch[]){
 let frame=frameBatches.get(scene);
 if(!frame&&batches.length){
  const owners=new Map<object,readonly ParticleBatch[]>(),previous=scene.onBeforeRender;
  const hook:Scene['onBeforeRender']=function(this:Scene,...args){previous.apply(this,args);for(const batches of owners.values())for(const batch of batches)batch.sync(args[2]);};
  frame={owners,previous,hook};frameBatches.set(scene,frame);scene.onBeforeRender=hook;
 }
 if(!frame)return;
 if(batches.length)frame.owners.set(owner,batches);else frame.owners.delete(owner);
 if(!frame.owners.size){if(scene.onBeforeRender===frame.hook)scene.onBeforeRender=frame.previous;frameBatches.delete(scene);}
}
export type EffectParticle=Mesh<BufferGeometry,MeshBasicMaterial>|Sprite;
/** Logical particles keep their independent clocks/transforms; the GPU gets one
 * instanced draw per geometry/material family. No simulation or emission changes. */
export class ParticleBatch {
 readonly mesh:InstancedMesh<BufferGeometry,MeshBasicMaterial>;
 private opacity:InstancedBufferAttribute;
 private inverse=new Matrix4();private matrix=new Matrix4();private rotation=new Quaternion();private cameraRotation=new Quaternion();
 private worldScale=new Vector3();private position=new Vector3();private scale=new Vector3();private axis=new Vector3(0,0,1);private tint=new Color();
 private ordered:EffectParticle[];
 constructor(readonly particles:EffectParticle[]){
  const first=particles[0],source=first.material;
  const geometry=first instanceof Sprite?new PlaneGeometry(1,1):first.geometry.clone();
  const material=first instanceof Sprite?new MeshBasicMaterial({map:source.map,color:0xffffff,transparent:true,blending:source.blending,depthWrite:source.depthWrite,depthTest:source.depthTest,toneMapped:source.toneMapped}):(source as MeshBasicMaterial).clone();
  material.color.set(0xffffff);material.opacity=1;material.forceSinglePass=true;
  const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(source,shader,renderer);
   shader.vertexShader='attribute float effectOpacity; varying float vEffectOpacity;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEffectOpacity=effectOpacity;');
   shader.fragmentShader='varying float vEffectOpacity;\n'+shader.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.a *= vEffectOpacity;\n#include <dithering_fragment>');
  };
  material.customProgramCacheKey=()=>key+'|effect-batch-opacity-v1';
  this.opacity=new InstancedBufferAttribute(new Float32Array(particles.length),1).setUsage(DynamicDrawUsage);geometry.setAttribute('effectOpacity',this.opacity);
  this.mesh=new InstancedMesh(geometry,material,particles.length);this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  this.mesh.instanceColor=new InstancedBufferAttribute(new Float32Array(particles.length*3),3).setUsage(DynamicDrawUsage);
  this.mesh.frustumCulled=false;this.mesh.name='effects.particles';this.ordered=[...particles];
 }
 sync(camera:Camera){
  const root=this.mesh.parent;if(!root)return;for(let p:Object3D|null=root;p;p=p.parent)if(!p.visible)return;
  root.updateWorldMatrix(true,false);this.inverse.copy(root.matrixWorld).invert();camera.getWorldQuaternion(this.cameraRotation);root.getWorldScale(this.worldScale);
  // Alpha particles need back-to-front ordering inside a draw. Additive ones commute.
  if(this.mesh.material.blending!==AdditiveBlending){
   this.matrix.multiplyMatrices(camera.matrixWorldInverse,root.matrixWorld);
   this.ordered.sort((a,b)=>this.depth(a,this.matrix)-this.depth(b,this.matrix));
  }
  let count=0;
  for(const p of this.ordered){
   if(!p.visible||p.material.opacity<=0)continue;
   if(p instanceof Sprite){
    // Rain's authored sprite rotation is camera-relative.
    p.onBeforeRender(null as never,null as never,camera,p.geometry,p.material,null as never);
    this.position.copy(p.position).applyMatrix4(root.matrixWorld);
    this.scale.copy(this.worldScale).multiply(p.scale);
    this.rotation.setFromAxisAngle(this.axis,p.material.rotation).premultiply(this.cameraRotation);
    this.matrix.compose(this.position,this.rotation,this.scale).premultiply(this.inverse);
   }else{p.updateMatrix();this.matrix.copy(p.matrix);}
   this.mesh.setMatrixAt(count,this.matrix);this.mesh.setColorAt(count,this.tint.copy(p.material.color));this.opacity.setX(count,p.material.opacity);count++;
  }
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor!.needsUpdate=true;this.opacity.needsUpdate=true;
 }
 private depth(p:Object3D,m:Matrix4){const e=m.elements;return e[2]*p.position.x+e[6]*p.position.y+e[10]*p.position.z+e[14];}
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
export function particleBatches(particles:EffectParticle[]):ParticleBatch[]{
 const groups=new Map<string,EffectParticle[]>();
 for(const p of particles){const m=p.material;const key=[p instanceof Sprite?'sprite':p.geometry.uuid,m.customProgramCacheKey(),m.map?.uuid,m.blending,m.side,m.depthTest,m.depthWrite,m.toneMapped].join('|');const group=groups.get(key)??[];group.push(p);groups.set(key,group);}
 return [...groups.values()].map(p=>new ParticleBatch(p));
}
