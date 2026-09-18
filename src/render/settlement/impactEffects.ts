import {AdditiveBlending,DynamicDrawUsage,Group,InstancedMesh,Matrix4,MeshBasicMaterial,OctahedronGeometry,Quaternion,Vector3,Color} from 'three';
import {perf} from '../../debug/performance';
type Impact={entity:number;x:number;y:number;z:number;tick:number;angle:number;power:number};
/** Only confirmed observed HP loss produces a contact burst; never attack windup. */
export class ImpactEffects {
 private readonly geometry=new OctahedronGeometry(1,0);
 private readonly material=new MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,blending:AdditiveBlending});
 private readonly mesh=new InstancedMesh(this.geometry,this.material,512);
 private impacts:Impact[]=[];
 private readonly matrix=new Matrix4();private readonly position=new Vector3();private readonly scale=new Vector3();private readonly rotation=new Quaternion();private readonly color=new Color();
 constructor(parent:Group){this.mesh.name='Confirmed hit sparks';this.mesh.count=0;this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);this.mesh.frustumCulled=false;parent.add(this.mesh);}
 hit(entity:number,x:number,y:number,z:number,tick:number,angle:number,power=1){if(this.impacts.length===64)this.impacts.shift();this.impacts.push({entity,x,y,z,tick,angle,power:Math.min(2,Math.max(.5,power))});}
 update(tick:number,visible:ReadonlySet<number>){
  this.impacts=this.impacts.filter(h=>tick>=h.tick&&tick-h.tick<12&&visible.has(h.entity));this.mesh.count=0;
  for(const h of this.impacts){const t=(tick-h.tick)/12;
   for(let i=0;i<8;i++){
    const a=h.angle+(i-3.5)*.34,r=t*(.4+i*.08)*h.power;
    this.position.set(h.x+Math.sin(a)*r,h.y+Math.sin(Math.PI*t)*(.3+i%3*.1),h.z+Math.cos(a)*r);
    this.scale.setScalar((.04+i%3*.012)*h.power*(1-t));this.mesh.setMatrixAt(this.mesh.count,this.matrix.compose(this.position,this.rotation,this.scale));
    this.color.setRGB((1-t)*1.0,(1-t)*(.58+i%2*.2),(1-t)*.20);this.mesh.setColorAt(this.mesh.count++,this.color);
   }
  }
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;}
  perf.value('Hit particles',this.mesh.count);
 }
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.impacts=[];}
}
