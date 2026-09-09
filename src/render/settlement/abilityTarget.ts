import {BufferGeometry,Float32BufferAttribute,Group,LineBasicMaterial,LineSegments,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import type {Spell} from '../../content/spells';
import type {HeightField} from '../../shared/map/height';
type Point={x:number;y:number};
export type AbilityAim={spell:Spell;rank:number;origin:Point;point:Point;valid:boolean};
/** Geometry reflects the simulation's flat-ended line or radial impact footprint. */
export function abilityOutline(aim:AbilityAim):Point[]{
 const rank=aim.spell.ranks[aim.rank-1],a=aim.origin,b=aim.point;
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 if(aim.spell.effect==='line'&&length){
  const nx=-dy/length*rank.radius,ny=dx/length*rank.radius;
  return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
 }
 const center=aim.spell.effect==='blast'?b:a;
 return Array.from({length:64},(_,i)=>({x:center.x+Math.cos(i*Math.PI/32)*rank.radius,y:center.y+Math.sin(i*Math.PI/32)*rank.radius}));
}
export class AbilityTarget {
 private readonly root=new Group();
 private readonly fill=new Mesh(new BufferGeometry(),new MeshBasicMaterial({color:0x80e6db,transparent:true,opacity:.16,side:DoubleSide,depthWrite:false,depthTest:false}));
 private readonly edge=new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:0xb9fff1,transparent:true,opacity:.9,depthTest:false,depthWrite:false}));
 private readonly range=new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:0xe8dfb0,transparent:true,opacity:.35,depthTest:false,depthWrite:false}));
 private key='';
 constructor(parent:Group){this.root.name='ability-target';this.root.add(this.fill,this.edge,this.range);this.root.visible=false;this.fill.renderOrder=20;this.edge.renderOrder=this.range.renderOrder=21;parent.add(this.root);}
 update(aim:AbilityAim|null,height:HeightField){
  this.root.visible=!!aim;if(!aim){this.key='';return;}
  const key=JSON.stringify(aim);if(key===this.key)return;this.key=key;
  this.fill.material.color.set(aim.valid?0x68dac9:0xef514b);this.edge.material.color.set(aim.valid?0xbefff0:0xff7770);
  const outline=abilityOutline(aim),positions:number[]=[],edges:number[]=[],range:number[]=[];
  const xyz=(p:Point)=>[p.x,height.sample(p.x,p.y)+.12,p.y];
  const center=outline.reduce((p,q)=>({x:p.x+q.x/outline.length,y:p.y+q.y/outline.length}),{x:0,y:0});
  for(let i=0;i<outline.length;i++){
   const a=outline[i],b=outline[(i+1)%outline.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
   for(let j=0;j<steps;j++){
    const p={x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps},q={x:a.x+(b.x-a.x)*(j+1)/steps,y:a.y+(b.y-a.y)*(j+1)/steps};
    positions.push(...xyz(center),...xyz(p),...xyz(q));edges.push(...xyz(p),...xyz(q));
   }
  }
  const radius=aim.spell.ranks[aim.rank-1].range;
  for(let i=0;i<96;i++){if(i%2)continue;for(const angle of [i*Math.PI/48,(i+1)*Math.PI/48])range.push(...xyz({x:aim.origin.x+Math.cos(angle)*radius,y:aim.origin.y+Math.sin(angle)*radius}));}
  for(const [object,data] of [[this.fill,positions],[this.edge,edges],[this.range,range]] as const){object.geometry.dispose();object.geometry=new BufferGeometry();object.geometry.setAttribute('position',new Float32BufferAttribute(data,3));object.geometry.computeBoundingSphere();}
 }
 dispose(){this.root.removeFromParent();for(const mesh of [this.fill,this.edge,this.range]){mesh.geometry.dispose();mesh.material.dispose();}}
}
