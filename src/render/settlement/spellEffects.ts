import {AdditiveBlending,NormalBlending,DoubleSide,FrontSide,Group,InstancedMesh,Matrix4,Quaternion,Vector3,Euler,Mesh,MeshBasicMaterial,OctahedronGeometry,RingGeometry,SphereGeometry,PlaneGeometry,Color,DynamicDrawUsage,type DataTexture} from 'three';
import {content} from '../../content/builtin';
import {EFFECT_BUDGET,layerLife,type EffectLayer} from '../../content/effectLayers';
import type {VisualCue} from '../../sim/game/visualCues';
import type {HeightField} from '../../shared/map/height';
import type {Spell,SpellVisual} from '../../content/spells';
import {SimpleSpellEffects} from './simpleSpellEffects';
import {effectTexture} from './effectTextures';
import {perf} from '../../debug/performance';
type Rules={spells:Record<string,Spell>;spellVisuals:Record<string,SpellVisual>};
type Part={layer:EffectLayer;mesh:Mesh;material:MeshBasicMaterial;start:Color;end:Color;offsets:Float32Array};
type Entry={root:Group;parts:Part[];signature:SpellVisual};
/** Timed visual layers. Shared geometry/masks, instanced particles, bounded live budgets. */
export class SpellEffects {
 private readonly simple:SimpleSpellEffects;
 private readonly root=new Group();
 private readonly ring=new RingGeometry(.91,1,48);
 private readonly spark=new OctahedronGeometry(1,0);
 private readonly shell=new SphereGeometry(1,16,10);
 private readonly plane=new PlaneGeometry(2,2);
 private readonly textures=new Map<string,DataTexture>();
 private readonly active=new Map<number,Entry>();
 private readonly matrix=new Matrix4();private readonly position=new Vector3();private readonly scale=new Vector3();
 private readonly rotation=new Euler();private readonly quaternion=new Quaternion();
 private lastTick=-1;
 stats={cues:0,layers:0,particles:0,dropped:0};
 constructor(parent:Group,private readonly declarations:()=>Rules=()=>content.rules){this.simple=new SimpleSpellEffects(parent,declarations);parent.add(this.root);}
 private remove(id:number,entry:Entry){entry.root.removeFromParent();for(const part of entry.parts){if(part.mesh instanceof InstancedMesh)part.mesh.dispose();part.material.dispose();}this.active.delete(id);}
 reset(){this.simple.reset();for(const [id,e] of this.active)this.remove(id,e);this.lastTick=-1;}
 private texture(kind:EffectLayer['texture']){if(kind==='none')return null;let t=this.textures.get(kind);if(!t){t=effectTexture(kind);this.textures.set(kind,t);}return t;}
 update(cues:readonly VisualCue[],field:HeightField,tick:number){
  const clock=perf.start();if(tick<this.lastTick)this.reset();this.lastTick=tick;
  this.stats={cues:0,layers:0,particles:0,dropped:0};
  const rules=this.declarations(),seen=new Set<number>(),simple:VisualCue[]=[];
  for(const cue of cues){
   const spell=rules.spells[cue.ability],visual=spell&&rules.spellVisuals[spell.visual];
   if(!spell||!visual||tick<cue.tick||tick>=cue.tick+cue.durationTicks)continue;
   if(this.stats.cues>=EFFECT_BUDGET.cues){this.stats.dropped++;continue;}
   this.stats.cues++;
   if(!visual.layers||(cue.phase==='cast'&&!visual.layers.some(l=>l.enabled&&l.phase==='cast'))){
    const particles=cue.phase==='impact'?visual.particles:0,layers=particles?2:1;
    if(this.stats.layers+layers>EFFECT_BUDGET.layers||this.stats.particles+particles>EFFECT_BUDGET.particles){this.stats.dropped++;continue;}
    this.stats.layers+=layers;this.stats.particles+=particles;simple.push(cue);continue;
   }
   seen.add(cue.id);let entry=this.active.get(cue.id);
   if(entry&&entry.signature!==visual){this.remove(cue.id,entry);entry=undefined;}
   const radius=spell.effect==='guard'?1.5:Math.max(1,spell.ranks[cue.rank-1]?.radius??1);
   if(!entry){
    entry={root:new Group(),parts:[],signature:visual};this.root.add(entry.root);this.active.set(cue.id,entry);
    for(const layer of visual.layers){
     if(!layer.enabled||layer.phase!==cue.phase)continue;
     const material=new MeshBasicMaterial({color:layer.color,map:this.texture(layer.texture),transparent:true,depthWrite:false,side:layer.kind==='sphere'?FrontSide:DoubleSide,blending:layer.blending==='additive'?AdditiveBlending:NormalBlending});
     const geometry=layer.kind==='ring'?this.ring:layer.kind==='sphere'?this.shell:layer.kind==='particles'&&layer.texture==='none'?this.spark:this.plane;
     const mesh=layer.kind==='particles'?new InstancedMesh(geometry,material,layer.count):new Mesh(geometry,material);
     mesh.name=`effect.${layer.id}`;mesh.renderOrder=3+entry.parts.length*.001;mesh.frustumCulled=false;
     if(mesh instanceof InstancedMesh)mesh.instanceMatrix.setUsage(DynamicDrawUsage);
     const offsets=new Float32Array(layer.count*3);
     const center=layer.anchor==='origin'?cue.origin:cue.target;
     const base=field.walkSample(center.x,center.y,center.surface);
     for(let i=0;i<layer.count;i++){
      const a=i*2.3999632297+cue.id*.41,r=radius*layer.spread*Math.sqrt((i+.5)/layer.count);
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      offsets.set([x,field.walkSample(center.x+x,center.y+z,center.surface)-base,z],i*3);
     }
     entry.parts.push({layer,mesh,material,start:new Color(layer.color),end:new Color(layer.endColor),offsets});entry.root.add(mesh);
    }
   }
   for(const part of entry.parts){
    const {layer,mesh,material}=part,life=layerLife(layer,tick-cue.tick);
    mesh.visible=!!life&&this.stats.layers<EFFECT_BUDGET.layers;
    if(!life||!mesh.visible){if(life)this.stats.dropped++;continue;}
    this.stats.layers++;
    const {t,alpha}=life,origin=layer.anchor==='origin'?cue.origin:cue.target;
    const travel=spell.effect==='line'&&cue.phase==='impact'&&layer.anchor==='target';
    const age=(tick-cue.tick)/cue.durationTicks;
    const x=travel?cue.origin.x+(cue.target.x-cue.origin.x)*age:origin.x,z=travel?cue.origin.y+(cue.target.y-cue.origin.y)*age:origin.y;
    const base=field.walkSample(x,z,origin.surface)+.10;
    mesh.position.set(x,base,z);material.color.copy(part.start).lerp(part.end,t);material.opacity=alpha;
    if(mesh instanceof InstancedMesh){
     mesh.count=Math.min(layer.count,EFFECT_BUDGET.particles-this.stats.particles);this.stats.particles+=mesh.count;
     if(mesh.count<layer.count)this.stats.dropped++;
     for(let i=0;i<mesh.count;i++){
      const phase=layer.repeat>1?(t+i/layer.count)%1:t;
      let px=part.offsets[i*3]!,pz=part.offsets[i*3+2]!,py=part.offsets[i*3+1]!;
      if(layer.motion==='burst'){px*=.12+phase;pz*=.12+phase;py+=Math.sin(Math.PI*phase)*layer.height;}
      if(layer.motion==='rise')py+=phase*layer.height;
      if(layer.motion==='fall')py+=(1-phase)*layer.height;
      if(layer.motion==='orbit'){const a=phase*Math.PI*2;const ox=px;px=px*Math.cos(a)-pz*Math.sin(a);pz=ox*Math.sin(a)+pz*Math.cos(a);py+=layer.height*(.5+.25*Math.sin(a+i));}
      this.position.set(px,py+.08,pz);
      const size=layer.size+(layer.endSize-layer.size)*phase;this.scale.setScalar(size);
      // Textured motes are crossed by a stable oblique plane, not per-particle sprites.
      this.quaternion.setFromEuler(this.rotation.set(layer.texture==='none'?phase*5+i:-Math.PI/4,layer.texture==='none'?phase*3:0,(layer.rotation+phase*layer.spin)*Math.PI/180));
      if(layer.motion==='fall'&&layer.texture==='none')this.scale.y*=3;
      mesh.setMatrixAt(i,this.matrix.compose(this.position,this.quaternion,this.scale));
     }
     mesh.instanceMatrix.needsUpdate=true;
    }else{
     const size=radius*(layer.size+(layer.endSize-layer.size)*t);mesh.scale.setScalar(size);
     if(layer.kind==='sphere'){mesh.position.y+=layer.height;mesh.rotation.set(0,t*layer.spin*Math.PI/180,0);}
     else mesh.rotation.set(-Math.PI/2,0,(layer.rotation+t*layer.spin)*Math.PI/180);
    }
   }
  }
  this.simple.update(simple,field,tick);
  for(const [id,e] of this.active)if(!seen.has(id))this.remove(id,e);
  perf.value('FX cues',this.stats.cues);perf.value('FX layers',this.stats.layers);perf.value('FX particles',this.stats.particles);perf.value('FX budget drops',this.stats.dropped);perf.end('Spell effects',clock);
 }
 dispose(){this.reset();this.simple.dispose();this.root.removeFromParent();for(const g of [this.ring,this.spark,this.shell,this.plane])g.dispose();for(const t of this.textures.values())t.dispose();this.textures.clear();}
}
