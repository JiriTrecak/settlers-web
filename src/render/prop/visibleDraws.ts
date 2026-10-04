import {Group,InstancedMesh,InstancedBufferAttribute,DynamicDrawUsage,type Frustum,type Scene} from 'three';
import {perf} from '../../debug/performance';

type Draw={mesh:InstancedMesh;sources:InstancedMesh[];active:InstancedMesh[];versions:number[];next:InstancedMesh[];nextVersions:number[]};
type Pair={main:Draw;shadow:Draw};
type View={planes:Float64Array;valid:boolean;draws:number;instances:number};
type BatchKey={geometry:string;materials:string[];cast:boolean;receive:boolean;order:number;layers:number;color:boolean;depth?:string;distance?:string;category:unknown;blend:string|null;key:string};
const view=():View=>({planes:new Float64Array(24),valid:false,draws:0,instances:0});
function snapshot(frustum:Frustum,out:Float64Array){
 for(let i=0;i<6;i++){const p=frustum.planes[i],j=i*4;out[j]=p.normal.x;out[j+1]=p.normal.y;out[j+2]=p.normal.z;out[j+3]=p.constant;}
}
function matches(frustum:Frustum,previous:Float64Array){
 for(let i=0;i<6;i++){const p=frustum.planes[i],j=i*4;if(p.normal.x!==previous[j]||p.normal.y!==previous[j+1]||p.normal.z!==previous[j+2]||p.constant!==previous[j+3])return false;}
 return true;
}

/** Spatial batches remain the source of truth for edits, picking and culling.
 * Rendering concatenates their visible instance ranges into one draw for each
 * exact geometry/material state. Separate main/shadow buffers avoid uploading
 * two different lists every frame while the camera and scenery are unchanged.
 * No shader/texture changes, matrix rebaking, detail loss or per-instance sort. */
export class VisibleSceneryDraws {
 private readonly main=new Group();
 private readonly shadow=new Group();
 private groups=new Map<string,Pair>();
 private keys=new WeakMap<InstancedMesh,BatchKey>();
 private readonly views={main:view(),shadow:view()};
 constructor(scene:Scene,private readonly sourceRoot:Group){
  this.main.name='Visible scenery';this.shadow.name='Scenery shadow draws';
  this.main.visible=this.shadow.visible=false;
  this.main.matrixAutoUpdate=this.shadow.matrixAutoUpdate=false;
  this.main.userData.materialRevision=this.shadow.userData.materialRevision=0;
  scene.add(this.main,this.shadow);
 }
 get count(){return this.groups.size;}
 private batchKey(batch:InstancedMesh):string {
  const cached=this.keys.get(batch),material=batch.material,array=Array.isArray(material);
  let sameMaterials=!!cached,transparent=false;
  if(array){
   sameMaterials=!!cached&&cached.materials.length===material.length;
   for(let i=0;i<material.length;i++){
    if(cached?.materials[i]!==material[i].uuid)sameMaterials=false;
    transparent ||= material[i].transparent;
   }
  }else{
   sameMaterials=!!cached&&cached.materials.length===1&&cached.materials[0]===material.uuid;
   transparent=material.transparent;
  }
  const geometry=batch.geometry.uuid,color=!!batch.instanceColor,depth=batch.customDepthMaterial?.uuid,distance=batch.customDistanceMaterial?.uuid,category=batch.userData.category,blend=transparent?batch.uuid:null;
  // Rebatching changes counts/matrices much more often than render state.
  // Check state values (including in-place material edits), but serialize/hash
  // the long signature only when it actually changes.
  if(cached&&sameMaterials&&cached.geometry===geometry&&cached.cast===batch.castShadow&&cached.receive===batch.receiveShadow&&cached.order===batch.renderOrder&&cached.layers===batch.layers.mask&&cached.color===color&&cached.depth===depth&&cached.distance===distance&&cached.category===category&&cached.blend===blend)return cached.key;
  const materials=array?material.map(m=>m.uuid):[material.uuid];
  const key=JSON.stringify([geometry,materials,batch.castShadow,batch.receiveShadow,batch.renderOrder,batch.layers.mask,color,depth,distance,category,blend]);
  this.keys.set(batch,{geometry,materials,cast:batch.castShadow,receive:batch.receiveShadow,order:batch.renderOrder,layers:batch.layers.mask,color,depth,distance,category,blend,key});
  return key;
 }
 sync(batches:readonly InstancedMesh[]){
  this.invalidate();this.restore();
  const grouped=new Map<string,InstancedMesh[]>();
  for(const batch of batches){
   // Blended surfaces retain their independent draw/sort identity. Opaque and
   // alpha-tested surfaces can share a draw without changing overlap behavior.
   const key=this.batchKey(batch);
   const sources=grouped.get(key)??[];sources.push(batch);grouped.set(key,sources);
  }
  const previous=this.groups,next=new Map<string,Pair>();
  for(const [key,sources] of grouped){
   let pair=previous.get(key);previous.delete(key);
   const needed=sources.reduce((n,b)=>n+b.count,0);
   if(pair&&pair.main.mesh.instanceMatrix.count<needed){this.release(pair);pair=undefined;}
   if(!pair)pair={main:this.create(sources,needed,'main'),shadow:this.create(sources,needed,'shadow')};
   else {pair.main.sources=sources;pair.shadow.sources=sources;}
   next.set(key,pair);
  }
  for(const pair of previous.values())this.release(pair);
  this.groups=next;
  this.main.userData.materialRevision++;this.shadow.userData.materialRevision++;
  perf.value('Scenery draw groups',this.count);
 }
 private create(sources:InstancedMesh[],capacity:number,pass:'main'|'shadow'):Draw {
  const first=sources[0],mesh=new InstancedMesh(first.geometry,first.material,capacity);
  mesh.name=`${pass}: ${first.name}`;
  mesh.matrixAutoUpdate=mesh.matrixWorldAutoUpdate=false;
  mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.layers.mask=first.layers.mask;
  mesh.customDepthMaterial=first.customDepthMaterial;mesh.customDistanceMaterial=first.customDistanceMaterial;
  mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.userData.category=first.userData.category;
  let trianglesBefore=0;
  mesh.onBeforeRender=renderer=>{if(perf.enabled)trianglesBefore=renderer.info.render.triangles;};
  mesh.onAfterRender=renderer=>perf.count(mesh.userData.category,renderer.info.render.triangles-trianglesBefore);
  if(first.instanceColor)mesh.instanceColor=new InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(DynamicDrawUsage);
  this[pass].add(mesh);
  return {mesh,sources,active:[],versions:[],next:[],nextVersions:[]};
 }
 /** Source edits must invalidate both cameras, even if only the other pass is
  * drawn next. Rebatch/LOD changes call sync; drag previews call invalidate. */
 invalidate(){this.views.main.valid=this.views.shadow.valid=false;}
 private activate(shadow:boolean){this.main.visible=!shadow;this.shadow.visible=shadow;this.sourceRoot.visible=false;}
 private record(shadow:boolean,draws:number,instances:number,uploaded:number){
  perf.value(shadow?'Scenery shadow draws':'Scenery visible draws',draws);
  perf.value(shadow?'Scenery shadow upload bytes':'Scenery visible upload bytes',uploaded);
  perf.value(shadow?'Scenery shadow mesh instances':'Scenery visible mesh instances',instances);
 }
 /** The packed lists are independent of source-group visibility. Restoring the
  * logical tree for captures/picking does not invalidate an unchanged camera. */
 reuse(frustum:Frustum,shadow=false):boolean {
  const started=perf.start(),saved=this.views[shadow?'shadow':'main'];
  if(!saved.valid||!matches(frustum,saved.planes))return false;
  this.activate(shadow);this.record(shadow,saved.draws,saved.instances,0);
  perf.end(shadow?'Scenery shadow compaction':'Scenery visible compaction',started);
  return true;
 }
 /** Called after spatial cell visibility is set for this pass. Instance transforms
  * and bounding spheres are already world-space; logical meshes never move. */
 cull(frustum:Frustum,shadow=false){
  const started=perf.start(),pass=shadow?'shadow':'main';
  this.activate(shadow);
  let uploaded=0,visible=0,instances=0;
  for(const pair of this.groups.values()){
   const draw=pair[pass],selected=draw.next,versions=draw.nextVersions;selected.length=versions.length=0;
   for(const b of draw.sources){
    if(!b.visible||!b.parent!.visible||!b.parent!.parent!.visible)continue;
    if(b.frustumCulled&&b.boundingSphere&&!frustum.intersectsSphere(b.boundingSphere))continue;
    instances+=b.count;
    selected.push(b);versions.push(b.count,b.instanceMatrix.version,b.instanceColor?.version??0);
   }
   draw.mesh.visible=selected.length>0;if(draw.mesh.visible)visible++;
   if(selected.length===draw.active.length&&selected.every((b,i)=>b===draw.active[i])&&versions.every((v,i)=>v===draw.versions[i]))continue;
   let count=0;
   for(const batch of selected){
    draw.mesh.instanceMatrix.array.set(batch.instanceMatrix.array.subarray(0,batch.count*16),count*16);
    if(batch.instanceColor)draw.mesh.instanceColor!.array.set(batch.instanceColor.array.subarray(0,batch.count*3),count*3);
    count+=batch.count;
   }
   draw.mesh.count=count;
   draw.mesh.instanceMatrix.clearUpdateRanges();
   if(count){draw.mesh.instanceMatrix.addUpdateRange(0,count*16);draw.mesh.instanceMatrix.needsUpdate=true;uploaded+=count*16*4;}
   if(draw.mesh.instanceColor){draw.mesh.instanceColor.clearUpdateRanges();if(count){draw.mesh.instanceColor.addUpdateRange(0,count*3);draw.mesh.instanceColor.needsUpdate=true;uploaded+=count*3*4;}}
   // Swap reusable scratch/snapshot arrays; unchanged frames allocate no lists.
   draw.next=draw.active;draw.active=selected;draw.nextVersions=draw.versions;draw.versions=versions;
   // Three uses this centre for draw sorting, even when frustumCulled is false.
   // Only the uncommon blended groups require the original sort centre.
   const materials=Array.isArray(draw.mesh.material)?draw.mesh.material:[draw.mesh.material];
   if(materials.some(m=>m.transparent)&&selected[0]?.boundingSphere)draw.mesh.boundingSphere=selected[0].boundingSphere!.clone();
  }
  const saved=this.views[pass];snapshot(frustum,saved.planes);saved.valid=true;saved.draws=visible;saved.instances=instances;
  this.record(shadow,visible,instances,uploaded);
  perf.end(shadow?'Scenery shadow compaction':'Scenery visible compaction',started);
 }
 /** Other scene users (captures and warm-up) can use the original logical meshes
  * without depending on the live camera's last culling state. */
 restore(){this.main.visible=this.shadow.visible=false;this.sourceRoot.visible=true;}
 private release(pair:Pair){for(const pass of ['main','shadow'] as const){pair[pass].mesh.removeFromParent();pair[pass].mesh.dispose();}}
 dispose(){this.restore();for(const pair of this.groups.values())this.release(pair);this.groups.clear();this.main.removeFromParent();this.shadow.removeFromParent();}
}
