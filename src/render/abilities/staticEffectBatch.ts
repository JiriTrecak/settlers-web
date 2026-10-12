import {Color,DynamicDrawUsage,Euler,Group,InstancedMesh,Material,Matrix4,Mesh,SkinnedMesh,Vector3} from 'three';
import {validateWeaponEffectGeometry,WEAPON_EFFECT_LIMITS} from '../../content/effects/limits';
import type {VisualLayer} from '../../content/effects/schema';
import {disposeEffectModelSource,loadEffectModel,type EffectModelSource} from './effectModel';
import {transformedModel} from '../prop/modelTransform';
/** Static model effects share geometry/materials across a volley, not one draw per missile. */
export class StaticEffectBatch {
 readonly root=new Group();readonly ready:Promise<void>;
 private meshes:InstancedMesh[]=[];private capacity=16;private closed=false;private loaded=false;
 private source?:EffectModelSource;private matrix=new Matrix4();private local=new Matrix4();
 private readonly tint:Color;
 constructor(readonly layer:VisualLayer,loader=loadEffectModel){
  if(!layer.model||layer.model.animation)throw Error('Batched flight requires a static model');
  this.tint=new Color(layer.colour);this.root.visible=false;
  const r=layer.model.rotation;
  this.local.makeRotationFromEuler(new Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180)).scale(new Vector3(layer.size,layer.size,layer.size));

  this.ready=loader(layer.model).then(source=>{
   if(this.closed){disposeEffectModelSource(source);return;}
   this.source=source;
   const reports:{triangles:number;primitives:number;bones:number}[]=[];
   source.scene.traverse(o=>{if(!(o instanceof Mesh))return;if(o instanceof InstancedMesh||Object.keys(o.geometry.morphAttributes).length)throw Error('Weapon projectile models require baked static geometry');reports.push({triangles:(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3,primitives:Array.isArray(o.material)?o.geometry.groups.length:1,bones:o instanceof SkinnedMesh?1:0});});
   if(!reports.length)throw Error('Weapon projectile model has no meshes');
   validateWeaponEffectGeometry(reports);
   const root=transformedModel(source.scene,source.transform);root.updateMatrixWorld(true);
   root.traverse(o=>{if(o instanceof SkinnedMesh)throw Error('Batched projectiles cannot contain skins');if(!(o instanceof Mesh))return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
    const clone=(material:Material)=>{const own=material.clone();if('color' in own&&own.color instanceof Color)own.color.multiply(this.tint);return own;};
    const materials=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
    const mesh=new InstancedMesh(geometry,materials,this.capacity);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;this.root.add(mesh);this.meshes.push(mesh);
   });
   this.loaded=true;
  }).catch(error=>{this.dispose();throw error;});
 }
 begin(count:number){
  if(this.closed)return;
  count=Math.max(0,Math.min(WEAPON_EFFECT_LIMITS.flights,Math.floor(count)));
  this.root.visible=this.loaded&&count>0;
  if(!this.loaded)return;
  if(count>this.capacity){
   while(this.capacity<count)this.capacity*=2;
   this.meshes=this.meshes.map(previous=>{
    const mesh=new InstancedMesh(previous.geometry,previous.material,this.capacity);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;this.root.add(mesh);previous.removeFromParent();previous.dispose();return mesh;
   });
  }
  for(const mesh of this.meshes){mesh.count=0;mesh.visible=count>0;}
 }
 append(transform:Matrix4){
  if(this.closed||!this.loaded||this.meshes[0]?.count>=this.capacity)return;this.matrix.multiplyMatrices(transform,this.local);
  this.matrix.elements[12]+=this.layer.offset?.x??0;this.matrix.elements[13]+=(this.layer.offset?.y??0)+this.layer.height;this.matrix.elements[14]+=this.layer.offset?.z??0;
  for(const mesh of this.meshes)mesh.setMatrixAt(mesh.count++,this.matrix);
 }
 flush(){for(const mesh of this.meshes)if(mesh.count)mesh.instanceMatrix.needsUpdate=true;}
 dispose(){
  if(this.closed)return;this.closed=true;this.loaded=false;this.root.visible=false;
  for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}
  this.meshes=[];if(this.source)disposeEffectModelSource(this.source);this.source=undefined;this.root.clear();this.root.removeFromParent();
 }
}
