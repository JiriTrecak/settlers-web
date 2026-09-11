import type { GameState } from "../../sim/game/state";
import type { HeightField } from "../../shared";
import { content } from "../../content/builtin";
import {BoxGeometry,BufferAttribute,BufferGeometry,Color,CylinderGeometry,DynamicDrawUsage,Group,InstancedMesh,Matrix4,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type ProjectileKind='arrow'|'thorn';
type Flight={kind:ProjectileKind;start:Vector3;end:Vector3;tick:number;duration:number};
type Batch={mesh:InstancedMesh;capacity:number};
const UP=new Vector3(0,1,0),SCALE=new Vector3(1,1,1);
function colored(geometry:BufferGeometry,tint:number){
 const color=new Color(tint),values=new Float32Array(geometry.getAttribute('position').count*3);
 for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
 geometry.setAttribute('color',new BufferAttribute(values,3));return geometry;
}
function arrowGeometry(){
 // Close to the authored nocked arrow, with slightly thicker detail for RTS zoom.
 const parts=[colored(new CylinderGeometry(.012,.012,.62,5),0xc3a779),colored(new CylinderGeometry(0,.04,.12,4).translate(0,.37,0),0xa5afb4),colored(new BoxGeometry(.10,.13,.01).translate(0,-.23,0),0xc3a779),colored(new BoxGeometry(.01,.13,.10).translate(0,-.23,0),0xc3a779)];
 const merged=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return merged;
}
/** Observer-filtered authoritative flights. One draw per projectile kind, never one per shot. */
export class ProjectileEffects {
 readonly root=new Group();
 private readonly material=new MeshStandardMaterial({vertexColors:true,roughness:.75});
 private readonly geometry={arrow:arrowGeometry(),thorn:colored(new CylinderGeometry(0,.195,.84,4),0xc3a779)};
 private readonly batches=new Map<ProjectileKind,Batch>();
 private flights:Flight[]=[];
 private readonly origins=new Map<number,{launched:number;position:Vector3}>();
 private readonly position=new Vector3();
 private readonly tangent=new Vector3();
 private readonly rotation=new Quaternion();
 private readonly matrix=new Matrix4();
 constructor(parent:Group){parent.add(this.root);}
 private batch(kind:ProjectileKind,count:number){
  let batch=this.batches.get(kind);if(batch&&batch.capacity>=count)return batch;
  let capacity=batch?.capacity??16;while(capacity<count)capacity*=2;
  if(batch){batch.mesh.removeFromParent();batch.mesh.dispose();}
  const mesh=new InstancedMesh(this.geometry[kind],this.material,capacity);mesh.name=`projectiles.${kind}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;
  this.root.add(mesh);batch={mesh,capacity};this.batches.set(kind,batch);return batch;
 }
 update(tick:number, missiles:GameState["missiles"], field:HeightField, launchPosition?:(missile:GameState["missiles"][number])=>Vector3|undefined){
  const active=missiles.filter(m=>tick>=m.launched&&tick<m.impact);
  const liveIds=new Set(active.map(m=>m.id));
  for(const id of this.origins.keys())if(!liveIds.has(id))this.origins.delete(id);
  this.flights=active.map(m=>{
   let cached=this.origins.get(m.id);
   if(!cached||cached.launched!==m.launched){
    // Only a fresh launch can sample the animated bow. Late observations use
    // the recorded origin, never a shooter who has since moved elsewhere.
    const position=(tick<=m.launched+1?launchPosition?.(m):undefined)?.clone()
     ?? new Vector3(m.origin.x,field.walkSample(m.origin.x,m.origin.y)+1.5,m.origin.y);
    cached={launched:m.launched,position};this.origins.set(m.id,cached);
   }
   return {
    kind:content.asset(content.get(m.definition).asset).projectile??'arrow',
    start:cached.position,
    end:new Vector3(m.destination.x,field.walkSample(m.destination.x,m.destination.y)+1,m.destination.y),
    tick:m.launched,duration:m.impact-m.launched,
   };
  });
  let live=0;const counts:Record<ProjectileKind,number>={arrow:0,thorn:0};
  for(const flight of this.flights)if(tick-flight.tick<flight.duration){this.flights[live++]=flight;counts[flight.kind]++;}
  this.flights.length=live;
  for(const kind of ['arrow','thorn'] as const){
   const batch=counts[kind]?this.batch(kind,counts[kind]):this.batches.get(kind);
   if(batch){batch.mesh.count=0;batch.mesh.visible=counts[kind]>0;}
  }
  for(const flight of this.flights){
   const t=Math.max(0,(tick-flight.tick)/flight.duration),arc=.65;
   this.position.lerpVectors(flight.start,flight.end,t);this.position.y+=4*arc*t*(1-t);
   this.tangent.subVectors(flight.end,flight.start);this.tangent.y+=4*arc*(1-2*t);
   if(this.tangent.lengthSq()<1e-10)this.tangent.copy(UP);else this.tangent.normalize();
   this.rotation.setFromUnitVectors(UP,this.tangent);this.matrix.compose(this.position,this.rotation,SCALE);
   const mesh=this.batches.get(flight.kind)!.mesh;mesh.setMatrixAt(mesh.count++,this.matrix);
  }
  for(const batch of this.batches.values())if(batch.mesh.count)batch.mesh.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const b of this.batches.values())b.mesh.dispose();this.batches.clear();this.flights=[];this.origins.clear();this.root.clear();this.root.removeFromParent();this.material.dispose();Object.values(this.geometry).forEach(g=>g.dispose());}
}
