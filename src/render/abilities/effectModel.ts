import {AnimationMixer,Color,Group,InstancedMesh,LoopOnce,LoopRepeat,Material,Mesh,Object3D,Texture,type AnimationClip,type AnimationAction,type BufferGeometry} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {effectResource} from '../../content/abilities/resources';
import type {VisualLayer} from '../../content/effects/schema';
import {assetUrls} from '../../shared/assets/urls.generated';
import {geometryModel} from '../../shared/assets/models';
import {transformedModel} from '../prop/modelTransform';
import type {ModelTransform} from '../../shared/authoring/modelCatalogue';
import {TICK_MS} from '../../shared/match/match';
import {EFFECT_MODEL_LIMITS} from '../../content/effects/limits';

export type EffectModelSource={scene:Object3D;animations:AnimationClip[];transform:ModelTransform};
type ModelRef=NonNullable<VisualLayer['model']>;
type Entry={refs:number;ready:Promise<EffectModelSource>;source?:EffectModelSource;triangles:number;settled:boolean;failed?:boolean};
const identity:ModelTransform={scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'};
async function loadModel(ref:ModelRef):Promise<EffectModelSource>{
 const resource=effectResource(ref);if(resource.bytes>EFFECT_MODEL_LIMITS.maxBytes)throw Error('Effect model exceeds 16 MB');
 const gltf=await new GLTFLoader().loadAsync(assetUrls[resource.path]??'/'+resource.path);
 return {scene:gltf.scene,animations:gltf.animations,transform:geometryModel(resource.path)?.transform??identity};
}
function triangles(root:Object3D){let count=0;root.traverse(o=>{if(o instanceof Mesh)count+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3*(o instanceof InstancedMesh?o.count:1);});return count;}
function disposeSource(source:EffectModelSource){
 const geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>();
 source.scene.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof Texture)textures.add(value);}}});
 for(const item of [...geometries,...materials,...textures])item.dispose();
}

/** Shared geometry/textures, independently owned materials, skeletons and clocks. Cosmetic only. */
export class EffectModels {
 private entries=new Map<string,Entry>();private handles=new Set<EffectModel>();private triangleCount=0;private closed=false;
 constructor(private loader:(ref:ModelRef)=>Promise<EffectModelSource>=loadModel){}
 create(ref:ModelRef):EffectModel|undefined{
  if(this.closed||this.handles.size>=EFFECT_MODEL_LIMITS.instances)return;
  const key=`${ref.asset}/${ref.index}`;let entry=this.entries.get(key);
  if(!entry){
   this.trim();if(this.entries.size>=EFFECT_MODEL_LIMITS.instances+EFFECT_MODEL_LIMITS.cachedModels)return;
   entry={refs:0,triangles:0,settled:false,ready:Promise.resolve(undefined as never)};const owned=entry;
   entry.ready=this.loader(ref).then(source=>{
    owned.triangles=triangles(source.scene);
    if(owned.triangles>EFFECT_MODEL_LIMITS.perModelTriangles){disposeSource(source);throw Error('Effect model exceeds 10,000 triangles');}
    if(this.closed){disposeSource(source);throw Error('Effect model player closed');}
    owned.source=source;this.trim();return source;
   }).catch(error=>{owned.failed=true;throw error;}).finally(()=>{owned.settled=true;this.trim();});this.entries.set(key,entry);
  }
  entry.refs++;const owned=entry;
  let charged=0;
  const handle=new EffectModel(ref,owned.ready,()=>{
   if(this.triangleCount+owned.triangles>EFFECT_MODEL_LIMITS.triangles)return false;
   this.triangleCount+=owned.triangles;charged=owned.triangles;return true;
  },()=>{this.triangleCount-=charged;owned.refs--;this.handles.delete(handle);this.trim();});
  this.handles.add(handle);this.trim();return handle;
 }
 private trim(){for(const [key,entry]of this.entries){if(entry.refs||!entry.settled||!entry.failed&&this.entries.size<=EFFECT_MODEL_LIMITS.cachedModels)continue;this.entries.delete(key);if(entry.source)disposeSource(entry.source);}}
 async ready(){for(;;){const handles=[...this.handles];await Promise.all(handles.map(h=>h.ready));if([...this.handles].every(h=>handles.includes(h)))break;}for(const h of this.handles)if(h.error)throw h.error;}
 dispose(){if(this.closed)return;this.closed=true;for(const h of [...this.handles])h.dispose();for(const entry of this.entries.values())if(entry.source)disposeSource(entry.source);this.entries.clear();}
}
export class EffectModel {
 readonly root=new Group();readonly ready:Promise<void>;error?:Error;
 private stopped=false;private mixer?:AnimationMixer;private action?:AnimationAction;private clone?:Object3D;private cancelReady!:()=>void;
 private materials=new Map<Material,{own:Material;opacity:number;color?:Color}>();
 private sampleState={tick:0,opacity:1,color:'#ffffff'};
 constructor(private ref:ModelRef,source:Promise<EffectModelSource>,admit:()=>boolean,private release:()=>void){
  const loading=source.then(source=>{
   if(this.stopped)return;if(!admit())throw Error('Effect model triangle budget reached');
   const object=clone(source.scene);this.clone=object;
   const excluded:Object3D[]=[];
   object.traverse(o=>{if(('isLight' in o&&o.isLight)||('isPoints' in o&&o.isPoints)||('isLine' in o&&o.isLine))excluded.push(o);if(o instanceof Mesh){o.castShadow=false;o.receiveShadow=true;
    const own=(material:Material)=>{let record=this.materials.get(material);if(!record){const copy=material.clone();copy.transparent=true;copy.depthWrite=false;const color='color' in material&&material.color instanceof Color?material.color.clone():undefined;record={own:copy,opacity:material.opacity,color};this.materials.set(material,record);}return record.own;};
    o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);
   }});
   for(const object of excluded)object.removeFromParent();
   this.root.add(transformedModel(object,source.transform));
   if(this.ref.animation){const clip=source.animations.find(c=>c.name===this.ref.animation!.clip);if(!clip)throw Error('Effect model animation clip is missing: '+this.ref.animation.clip);
    this.mixer=new AnimationMixer(object);this.action=this.mixer.clipAction(clip);this.action.setLoop(this.ref.animation.loop?LoopRepeat:LoopOnce,Infinity);this.action.clampWhenFinished=true;this.action.play();
   }
   this.sample(this.sampleState.tick,this.sampleState.opacity,this.sampleState.color);
  }).catch(error=>{if(!this.stopped){this.error=error instanceof Error?error:Error(String(error));this.root.visible=false;}});
  this.ready=Promise.race([loading,new Promise<void>(resolve=>this.cancelReady=resolve)]);
 }
 sample(tick:number,opacity:number,color:string){
  this.sampleState={tick,opacity,color};
  if(this.mixer&&this.action&&this.ref.animation){const duration=this.action.getClip().duration,seconds=Math.max(0,tick*TICK_MS/1000*this.ref.animation.speed);this.action.paused=false;this.action.enabled=true;this.action.time=this.ref.animation.loop&&duration>0?seconds%duration:Math.min(seconds,duration);this.mixer.update(0);}
  const tint=new Color(color);for(const {own,opacity:base,color:original}of this.materials.values()){own.opacity=base*Math.max(0,Math.min(1,opacity));if(original&&'color' in own&&own.color instanceof Color)own.color.copy(original).multiply(tint);}
  this.root.updateMatrixWorld(true);
 }
 dispose(){if(this.stopped)return;this.stopped=true;this.cancelReady();this.root.removeFromParent();this.mixer?.stopAllAction();if(this.clone)this.mixer?.uncacheRoot(this.clone);for(const {own}of this.materials.values())own.dispose();this.clone?.traverse(o=>{if('isSkinnedMesh' in o&&o.isSkinnedMesh)(o as import('three').SkinnedMesh).skeleton.dispose();});this.materials.clear();this.release();}
}
