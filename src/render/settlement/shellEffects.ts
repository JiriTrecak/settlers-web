import {AdditiveBlending,Color,DoubleSide,DynamicDrawUsage,Group,InstancedMesh,Matrix4,MeshBasicMaterial,MeshStandardMaterial,Quaternion,RingGeometry,SphereGeometry,Vector3} from 'three';
import type {Shell} from '../../sim/game/shellState';
import type {HeightField} from '../../shared/map/height';

/** Observed simulation flights, including impacts after the firing entity disappears. */
export class ShellEffects {
 private readonly root=new Group();
 private readonly ballGeometry=new SphereGeometry(.2,8,6);
 private readonly ringGeometry=new RingGeometry(.72,1,24);
 private readonly ballMaterial=new MeshStandardMaterial({color:0x655c4e,metalness:.65,roughness:.55});
 private readonly ringMaterial=new MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending});
 private capacity=0;
 private balls:InstancedMesh|null=null;
 private rings:InstancedMesh|null=null;
 private readonly matrix=new Matrix4();private readonly position=new Vector3();private readonly scale=new Vector3();
 private readonly rotation=new Quaternion();private readonly flat=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
 private readonly color=new Color();
 private readonly origins=new Map<number,{launched:number;position:Vector3}>();
 constructor(parent:Group){parent.add(this.root);}
 private reserve(count:number){
  if(this.capacity>=count)return;
  let capacity=Math.max(16,this.capacity);while(capacity<count)capacity*=2;
  this.balls?.dispose();this.rings?.dispose();this.root.clear();this.capacity=capacity;
  this.balls=new InstancedMesh(this.ballGeometry,this.ballMaterial,capacity);this.rings=new InstancedMesh(this.ringGeometry,this.ringMaterial,capacity);
  for(const mesh of [this.balls,this.rings]){mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;this.root.add(mesh);}
 }
 update(shells:readonly Shell[],field:HeightField,tick:number,launchPosition?:(shell:Shell)=>Vector3|undefined){
  const live=new Set(shells.map(s=>s.id));
  for(const id of this.origins.keys())if(!live.has(id))this.origins.delete(id);
  this.reserve(shells.length);if(!this.balls||!this.rings)return;this.balls.count=0;this.rings.count=0;
  for(const shell of shells){
   if(tick<shell.impact){
    let cached=this.origins.get(shell.id);
    if(!cached||cached.launched!==shell.launched){
     // Sample once: a flying shell must not follow its moving or dying shooter.
     const position=(tick<=shell.launched+1?launchPosition?.(shell):undefined)?.clone()
      ?? new Vector3(shell.origin.x,field.sample(shell.origin.x,shell.origin.y)+2.1,shell.origin.y);
     cached={launched:shell.launched,position};this.origins.set(shell.id,cached);
    }
    const origin=cached.position;
    const t=Math.max(0,(tick-shell.launched)/(shell.impact-shell.launched)),dx=shell.target.x-origin.x,dy=shell.target.y-origin.z;
    const start=origin.y,end=field.sample(shell.target.x,shell.target.y)+.1;
    const arc=Math.max(2,Math.hypot(dx,dy)*.3);
    this.position.set(origin.x+dx*t,start+(end-start)*t+4*arc*t*(1-t),origin.z+dy*t);this.scale.setScalar(1);
    this.balls.setMatrixAt(this.balls.count++,this.matrix.compose(this.position,this.rotation,this.scale));
   }else{
    const t=(tick-shell.impact)/20;if(t>=1)continue;
    this.position.set(shell.target.x,field.sample(shell.target.x,shell.target.y)+.12,shell.target.y);this.scale.setScalar(shell.radius*(.25+.9*t));
    this.rings.setMatrixAt(this.rings.count,this.matrix.compose(this.position,this.flat,this.scale));
    this.rings.setColorAt(this.rings.count++,this.color.setRGB(.6*(1-t),.32*(1-t),.1*(1-t)));
   }
  }
  this.balls.instanceMatrix.needsUpdate=true;this.rings.instanceMatrix.needsUpdate=true;if(this.rings.instanceColor)this.rings.instanceColor.needsUpdate=true;
 }
 dispose(){this.origins.clear();this.balls?.dispose();this.rings?.dispose();this.root.removeFromParent();this.root.clear();this.ballGeometry.dispose();this.ringGeometry.dispose();this.ballMaterial.dispose();this.ringMaterial.dispose();}
}
