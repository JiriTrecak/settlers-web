import {FrontSide,NormalBlending,AdditiveBlending,DoubleSide,Group,InstancedMesh,Matrix4,Quaternion,Vector3,Euler,Mesh,MeshBasicMaterial,OctahedronGeometry,RingGeometry,SphereGeometry} from 'three';
import {content} from '../../content/builtin';
import type {VisualCue} from '../../sim/game/visualCues';
import type {HeightField} from '../../shared/map/height';
import type {Spell,SpellVisual} from '../../content/spells';

/** Visual-only spell cues. No damage, collision, targeting or random simulation state. */
export class SpellEffects {
 private readonly root=new Group();
 private readonly ring=new RingGeometry(.88,1,48);
 private readonly spark=new OctahedronGeometry(1,0);
 private readonly shell=new SphereGeometry(1,20,12);
 private lastTick=-1;
 private readonly matrix=new Matrix4();
 private readonly position=new Vector3();
 private readonly scale=new Vector3();
 private readonly rotation=new Euler();
 private readonly quaternion=new Quaternion();
 private readonly active=new Map<number,{root:Group;ring:Mesh;particles:InstancedMesh|null;materials:MeshBasicMaterial[];cue:VisualCue}>();
 constructor(parent:Group,private readonly declarations:()=>{spells:Record<string,Spell>;spellVisuals:Record<string,SpellVisual>}=()=>content.rules){parent.add(this.root);}
 reset(){for(const entry of this.active.values()){entry.root.removeFromParent();entry.particles?.dispose();entry.materials.forEach(m=>m.dispose());}this.active.clear();this.lastTick=-1;}
 update(cues:readonly VisualCue[],field:HeightField,tick:number){
  if(tick<this.lastTick)this.reset();
  this.lastTick=tick;
  const seen=new Set<number>();
  for(const cue of cues){
   const rules=this.declarations(),spell=rules.spells[cue.ability],visual=spell&&rules.spellVisuals[spell.visual];
   if(!spell||!visual)continue;
   const t=Math.max(0,Math.min(1,(tick-cue.tick)/cue.durationTicks));
   if(t>=1)continue;seen.add(cue.id);
   let entry=this.active.get(cue.id);
   if(!entry){
    const root=new Group();this.root.add(root);
    const guardShell=cue.phase==='impact'&&spell.effect==='guard';
    const material=new MeshBasicMaterial({color:visual.color,transparent:true,depthWrite:false,side:guardShell?FrontSide:DoubleSide,blending:guardShell?NormalBlending:AdditiveBlending});
    const accent=new MeshBasicMaterial({color:visual.accent,transparent:true,depthWrite:false,blending:AdditiveBlending});
    const ring=new Mesh(cue.phase==='impact'&&spell.effect==='guard'?this.shell:this.ring,material);
    ring.rotation.x=-Math.PI/2;ring.renderOrder=3;root.add(ring);
    const particles=cue.phase==='impact'&&visual.particles?new InstancedMesh(this.spark,accent,visual.particles):null;
    if(particles){particles.frustumCulled=false;root.add(particles);}
    entry={root,ring,particles,materials:[material,accent],cue};this.active.set(cue.id,entry);
   }
   const rank=spell.ranks[cue.rank-1],line=spell.effect==='line';
   const center=cue.phase==='cast'||!line?cue.target:{x:cue.origin.x+(cue.target.x-cue.origin.x)*t,y:cue.origin.y+(cue.target.y-cue.origin.y)*t};
   const base=field.sample(center.x,center.y)+.12;
   entry.root.position.set(center.x,base,center.y);
   const radius=spell.effect==='guard'?1.5:Math.max(1,rank.radius);
   entry.ring.scale.setScalar(cue.phase==='cast'?radius:radius*(.2+t*1.4));
   if(spell.effect==='guard'&&cue.phase==='impact'){entry.ring.scale.set(1.5,1.5,2);entry.ring.position.y=1.2;}
   entry.materials[0].opacity=cue.phase==='cast'?.18+t*.4:(1-t)*(spell.effect==='guard'?.24:.8);
   entry.materials[1].opacity=(1-t)*.95;
   if(entry.particles){
    for(let i=0;i<entry.particles.count;i++){
     const a=i*2.3999632297+cue.id*.41,spread=radius*(.15+t)*(0.4+(i%5)/8);
     const x=Math.cos(a)*spread,z=Math.sin(a)*spread;
     this.position.set(x,field.sample(center.x+x,center.y+z)-base+.16+Math.sin(Math.PI*t)*visual.rise*(.5+(i%7)/12),z);
     this.quaternion.setFromEuler(this.rotation.set(t*7+i,t*5+i*.5,t*3));
     this.scale.setScalar(visual.particleSize*(1-t*.6));
     entry.particles.setMatrixAt(i,this.matrix.compose(this.position,this.quaternion,this.scale));
    }
    entry.particles.instanceMatrix.needsUpdate=true;
   }
  }
  for(const [id,entry] of this.active)if(!seen.has(id)){entry.root.removeFromParent();entry.particles?.dispose();entry.materials.forEach(m=>m.dispose());this.active.delete(id);}
 }
 dispose(){this.reset();this.root.removeFromParent();this.ring.dispose();this.spark.dispose();this.shell.dispose();}
}
