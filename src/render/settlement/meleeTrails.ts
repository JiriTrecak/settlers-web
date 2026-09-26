import {AdditiveBlending,BufferAttribute,BufferGeometry,DoubleSide,DynamicDrawUsage,Group,Mesh,MeshBasicMaterial,Object3D,Vector3} from 'three';
import {perf} from '../../debug/performance';
type Sample={tick:number;base:Vector3;tip:Vector3};
type Trail={strike:number;points:Sample[]};
const MAX_TRAILS=64,POINTS=8,LIFETIME=3;
/** Short socket-following ribbons. Visual motion only; never produces gameplay hits. */
export class MeleeTrails {
 private trails=new Map<number,Trail>();
 private sockets=new WeakMap<Object3D,{base:Object3D;tip:Object3D}|null>();
 private geometry=new BufferGeometry();
 private positions=new BufferAttribute(new Float32Array(MAX_TRAILS*(POINTS-1)*6*3),3).setUsage(DynamicDrawUsage);
 private colors=new BufferAttribute(new Float32Array(MAX_TRAILS*(POINTS-1)*6*4),4).setUsage(DynamicDrawUsage);
 private material=new MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,toneMapped:false});
 private mesh=new Mesh(this.geometry,this.material);
 constructor(parent:Group){
  this.geometry.setAttribute('position',this.positions);this.geometry.setAttribute('color',this.colors);this.geometry.setDrawRange(0,0);
  this.mesh.name='Melee blade ribbons';this.mesh.frustumCulled=false;this.mesh.raycast=()=>{};parent.add(this.mesh);
 }
 sample(entity:number,root:Object3D,tick:number,strike:number,phase:number){
  if(phase<.43||phase>.69)return;
  let pair=this.sockets.get(root);
  if(pair===undefined){const base=root.getObjectByName('socket_blade_base'),tip=root.getObjectByName('socket_blade_tip');pair=base&&tip?{base,tip}:null;this.sockets.set(root,pair);}
  if(!pair)return;
  let trail=this.trails.get(entity);
  if(!trail||trail.strike!==strike){
   if(!trail&&this.trails.size>=MAX_TRAILS)return;
   trail={strike,points:[]};this.trails.set(entity,trail);
  }
  const previous=trail.points.at(-1);if(previous&&tick<=previous.tick)return;
  root.updateMatrixWorld(true);
  const base=pair.base.getWorldPosition(new Vector3()),tip=pair.tip.getWorldPosition(new Vector3());
  // Keep the wrist clear: only the outer two-thirds of the blade leaves a ribbon.
  base.lerp(tip,.35);trail.points.push({tick,base,tip});if(trail.points.length>POINTS)trail.points.shift();
 }
 update(tick:number,visible:ReadonlySet<number>){
  let count=0;
  const vertex=(point:Vector3,age:number,edge:boolean)=>{this.positions.setXYZ(count,point.x,point.y,point.z);this.colors.setXYZW(count,.95,.80,.54,(edge?.24:.035)*Math.max(0,1-age/LIFETIME));count++};
  for(const [id,trail]of this.trails){
   trail.points=trail.points.filter(p=>tick>=p.tick&&tick-p.tick<LIFETIME);
   if(!visible.has(id)||!trail.points.length){this.trails.delete(id);continue;}
   for(let i=1;i<trail.points.length;i++){
    const a=trail.points[i-1],b=trail.points[i];
    vertex(a.base,tick-a.tick,false);vertex(a.tip,tick-a.tick,true);vertex(b.tip,tick-b.tick,true);
    vertex(a.base,tick-a.tick,false);vertex(b.tip,tick-b.tick,true);vertex(b.base,tick-b.tick,false);
   }
  }
  this.geometry.setDrawRange(0,count);if(count){this.positions.needsUpdate=true;this.colors.needsUpdate=true;}perf.value('Melee trail triangles',count/3);
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();this.trails.clear();}
}
