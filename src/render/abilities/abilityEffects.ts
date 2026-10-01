import {sampleCueMotion} from './cueMotion';
import {effectImage} from '../../content/abilities/resources';
import {assetUrls} from '../../shared/assets/urls.generated';
import {AdditiveBlending,NormalBlending,Color,PlaneGeometry,CylinderGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial,PointLight,RingGeometry,SphereGeometry,Sprite,SpriteMaterial,TextureLoader,SRGBColorSpace,Vector3,type Texture,type BufferGeometry} from 'three';
import {TICK_MS} from '../../shared/match/match';
import type {AbilityPresentation} from '../../content/abilities/schema';
import type {AbilityEvent} from '../../sim/abilities/runtime';
type Recipe=AbilityPresentation['cues'][number];
type Particle=Mesh<BufferGeometry,MeshBasicMaterial>|Sprite;
type RainDrop={shard:Particle;landing:Vector3;delay:number;scale:number;fragments:Particle[];flash?:Particle};
type Cue={ability:string;flight?:{position:Vector3;previous:Vector3;direction:Vector3;tick:number};origin?:Vector3;destination?:Vector3;status?:boolean;root:Group;meshes:Particle[];light?:PointLight;rain?:RainDrop[];recipe:Recipe;start:number;cast:number;entity:number};
// Visual-only stable randomness: seeking the timeline reconstructs identical drops without RNG state.
function noise(seed:number){let n=seed|0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
export type EffectAnchor=(id:number)=>{x:number;y:number;height:number}|undefined;
/** Finite, bounded presentation recipes. Tick-addressable playback has no gameplay callbacks. */
export class AbilityEffects {
 readonly root=new Group();
 private cues:Cue[]=[];
 private textures=new Map<string,Texture>();
 private ring=new RingGeometry(.83,1,48);private disc=new RingGeometry(0,1,48);
 private quad=new PlaneGeometry(1,1);
 private beam=new CylinderGeometry(1,1,1,5);
 private sphere=new SphereGeometry(1,8,6);private pillar=new CylinderGeometry(.3,1,1,24,1,true);
 private texture(recipe:Recipe){
  if(!recipe.texture)return;
  const resource=effectImage(recipe.texture);let map=this.textures.get(resource.path);
  if(!map){map=new TextureLoader().load(assetUrls[resource.path]??'/'+resource.path);map.colorSpace=SRGBColorSpace;this.textures.set(resource.path,map);}
  return map;
 }
 private particle(recipe:Recipe,index:number,count:number):Particle{
  const colour=new Color(recipe.colour).lerp(new Color(recipe.accent),index/Math.max(1,count-1));
  const map=this.texture(recipe);
  if(map&&recipe.orientation==='ground'){const mesh=new Mesh(this.quad,new MeshBasicMaterial({map,color:colour,transparent:true,opacity:0,blending:recipe.blend==='normal'?NormalBlending:AdditiveBlending,depthWrite:false,side:DoubleSide,toneMapped:false}));mesh.rotation.x=-Math.PI/2;return mesh;}
  if(map)return new Sprite(new SpriteMaterial({map,color:colour,transparent:true,opacity:0,blending:recipe.shape==='rain'||recipe.blend==='normal'?NormalBlending:AdditiveBlending,depthWrite:false,toneMapped:false}));
  const material=new MeshBasicMaterial({color:colour,transparent:true,opacity:0,blending:recipe.blend==='normal'?NormalBlending:AdditiveBlending,depthWrite:false,side:DoubleSide,toneMapped:false});
  if(['pillar','ring','glow'].includes(recipe.shape)){
   const shape=recipe.shape;
   material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vCueLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCueLocal=position;');
    const fade=shape==='pillar'?'smoothstep(0.0,0.18,vCueLocal.y+0.5)*(1.0-smoothstep(0.55,1.0,vCueLocal.y+0.5))':shape==='glow'?'pow(1.0-smoothstep(0.0,1.0,length(vCueLocal.xy)),2.0)':'smoothstep(0.83,0.89,length(vCueLocal.xy))*(1.0-smoothstep(0.93,1.0,length(vCueLocal.xy)))';
    shader.fragmentShader='varying vec3 vCueLocal;\n'+shader.fragmentShader.replace('#include <dithering_fragment>',`gl_FragColor.a *= ${fade};\n#include <dithering_fragment>`);
   };
   material.customProgramCacheKey=()=>`ability-${shape}-soft-1`;
  }
  const mesh=new Mesh(recipe.shape==='ring'?this.ring:recipe.shape==='glow'?this.disc:recipe.shape==='pillar'?this.pillar:recipe.shape==='beam'?this.beam:this.sphere,material);
  if(recipe.shape==='ring'||recipe.shape==='glow')mesh.rotation.x=-Math.PI/2;
  return mesh;
 }
 consume(event:AbilityEvent,presentation:AbilityPresentation,height:(x:number,y:number)=>number=()=>0){
  if(event.event==='cancelled'){for(const cue of this.cues.filter(c=>c.cast===event.cast))this.remove(cue);this.cues=this.cues.filter(c=>c.root.parent);}
  for(const raw of presentation.cues.filter(c=>c.event===event.event)){
   const entity=raw.anchor==='caster'?event.caster:event.target;
   if(raw.lifetime==='status'&&this.cues.some(c=>c.status&&c.entity===entity&&c.ability===event.ability&&c.cast===event.cast&&c.recipe.id===raw.id))continue;
   const recipe={...raw,...(raw.durationFrom&&event.durationTicks?{durationTicks:event.durationTicks}:{}),...(raw.sizeFrom&&event.radius?{size:event.radius}:{}),...(raw.spreadFrom&&event.radius?{spread:event.radius}:{})};
   const deliveryTicks=recipe.durationTicks;
   if(recipe.shape==='rain')recipe.durationTicks/=recipe.fallSpeed??1;
   // Faster rain starts later so ground impacts still coincide with the damage wave.
   const start=event.tick+(recipe.shape==='rain'&&recipe.durationFrom?deliveryTicks-recipe.durationTicks:0);
   if(this.cues.length>=64)break;
   if(recipe.shape==='light'&&this.cues.filter(c=>c.light).length>=4)continue;
   const perDrop=recipe.shape==='rain'&&recipe.impact?recipe.impact.count+2:1;
   const count=recipe.shape==='light'?0:Math.min(['burst','streaks','rain','beam'].includes(recipe.shape)?recipe.count:1,Math.floor((512-this.cues.reduce((sum,c)=>sum+c.meshes.length,0))/perDrop));
   if(!count&&recipe.shape!=='light')continue;
   const root=new Group(),point=recipe.anchor==='caster'?event.origin:event.point;
   root.position.set(point.x,height(point.x,point.y)+.035,point.y);this.root.add(root);
   const meshes=Array.from({length:count},(_,i)=>this.particle(recipe,i,count));
   const rain=recipe.shape==='rain'?meshes.map((shard,i):RainDrop=>{
    const seed=event.cast*73856093+event.tick*19349663+i*83492791;
    const angle=(i+noise(seed+1)*.6)*2.399963+noise(event.tick+event.cast)*Math.PI*2;
    const radius=Math.sqrt((i+noise(seed+2))/count)*(recipe.spread??1);
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    const landing=new Vector3(x,height(point.x+x,point.y+z)-root.position.y+.055,z);
    const fragments=recipe.impact?Array.from({length:recipe.impact.count},(_,j)=>this.particle({...recipe,...recipe.impact,shape:'burst'},j,recipe.impact!.count)):[];
    const flash=recipe.impact?this.particle({...recipe,...recipe.impact,shape:'glow',texture:undefined},0,1):undefined;
    const back=this.fallDirection(recipe).normalize();
    if(shard instanceof Sprite){const right=new Vector3(),up=new Vector3();shard.onBeforeRender=(_renderer,_scene,camera)=>{
     right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
     shard.material.rotation=Math.atan2(-back.dot(right),back.dot(up));
    };}
    return {shard,landing,delay:noise(seed+3)*(recipe.launchDelayMs??0)/TICK_MS,scale:.8+noise(seed+4)*.35,fragments,flash};
   }):undefined;
   for(const drop of rain??[]){meshes.push(...drop.fragments);if(drop.flash)meshes.push(drop.flash);}
   if(meshes.length)root.add(...meshes);
   const light=recipe.shape==='light'?new PointLight(recipe.colour,0,recipe.size,2):undefined;
   if(light){light.castShadow=false;light.position.y=recipe.height;root.add(light);}
   this.cues.push({ability:event.ability,origin:new Vector3(event.origin.x,height(event.origin.x,event.origin.y)+recipe.height,event.origin.y),destination:new Vector3(event.point.x,height(event.point.x,event.point.y)+recipe.height,event.point.y),status:event.event==='statusApplied',root,meshes,light,rain,recipe,start,cast:event.cast,entity:recipe.anchor==='caster'?event.caster:event.target});
  }
 }
 private remove(cue:Cue){cue.root.removeFromParent();for(const m of cue.meshes)m.material.dispose();cue.light?.dispose();}
 private fallDirection(r:Recipe){const angle=(r.fallAngleDegrees??0)*Math.PI/180,azimuth=(r.fallAzimuthDegrees??0)*Math.PI/180;return new Vector3(Math.cos(azimuth)*Math.tan(angle),1,Math.sin(azimuth)*Math.tan(angle));}
 private updateRain(cue:Cue,tick:number){
  const r=cue.recipe,back=this.fallDirection(r),unit=back.clone().normalize();
  for(const [i,drop]of cue.rain!.entries()){
   const age=tick-cue.start-drop.delay,flight=age/r.durationTicks,impactAge=age-r.durationTicks;
   drop.shard.visible=age>=0&&flight<1;
   if(drop.shard.visible){
    // The tip, rather than the sprite centre, meets the sampled ground at the chosen landing point.
    const length=r.size*(r.length??1.8)*drop.scale;
    drop.shard.position.copy(drop.landing).addScaledVector(back,r.height*(1-flight)).addScaledVector(unit,length*.5);
    drop.shard.scale.set(r.size*drop.scale,length,1);drop.shard.material.opacity=Math.min(1,age*2)*(r.intensity??1);
   }
   const impact=r.impact,p=impact?impactAge/impact.durationTicks:1,visible=impactAge>=0&&p<1;
   if(drop.flash){drop.flash.visible=visible;if(visible){drop.flash.position.copy(drop.landing);drop.flash.scale.setScalar(impact!.spread*(.35+p));drop.flash.material.opacity=(1-p)**3*.9;}}
   for(const [j,fragment]of drop.fragments.entries()){
    fragment.visible=visible;if(!visible)continue;
    const angle=j*2.399963+i*1.7,speed=.55+noise(i*37+j*97)*.45;
    fragment.position.copy(drop.landing).add(new Vector3(Math.cos(angle)*impact!.spread*p*speed,.08+impact!.height*4*p*(1-p)*speed,Math.sin(angle)*impact!.spread*p*speed));
    fragment.scale.set(impact!.size*(1-p*.6),impact!.size*(1.4-p*.6),1);
    fragment.material.opacity=(1-p)**1.5;if(fragment instanceof Sprite)fragment.material.rotation=angle+p*3;
   }
  }
 }
 update(tick:number,anchor?:EffectAnchor){
  for(const cue of this.cues){
   const r=cue.recipe,persistent=r.lifetime==='status',t=persistent?0:Math.max(0,(tick-cue.start)/r.durationTicks);
   const motion=sampleCueMotion(r.motion,tick-cue.start);
   const lifetime=r.durationTicks+(cue.rain?(r.launchDelayMs??0)/TICK_MS+(r.impact?.durationTicks??0):0);
   if(!persistent&&!cue.flight&&tick-cue.start>=lifetime){this.remove(cue);continue;}
   if(r.follow&&anchor){const point=anchor(cue.entity);if(point)cue.root.position.set(point.x,point.height+.035,point.y);}
   if(['missile','beam','wavefront'].includes(r.shape)&&cue.origin&&cue.destination){
    const end=cue.destination.clone();if(r.shape==='missile'&&anchor){const target=anchor(cue.entity);if(target)end.set(target.x,target.height+r.height,target.y);}
    const position=cue.flight?cue.flight.previous.clone().lerp(cue.flight.position,Math.max(0,Math.min(1,tick-cue.flight.tick))):cue.origin.clone().lerp(end,Math.min(1,t));cue.root.position.set(0,0,0);
    for(const [segment,mesh] of cue.meshes.entries()){mesh.material.opacity=(r.intensity??1)*(r.shape==='beam'?1-t:1);
     if(r.shape==='beam'){
      const direction=end.clone().sub(cue.origin),side=new Vector3(-direction.z,0,direction.x).normalize();
      const vertex=(i:number)=>cue.origin!.clone().addScaledVector(direction,i/cue.meshes.length).addScaledVector(side,i===0||i===cue.meshes.length?0:(noise(cue.cast*43+i*11+Math.floor(t*5))-.5)*.8);
      const a=vertex(segment),b=vertex(segment+1),delta=b.clone().sub(a);
      mesh.position.copy(a).addScaledVector(delta,.5);mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize());mesh.scale.set(r.size,delta.length(),r.size);
     }else{mesh.position.copy(position);mesh.scale.set(r.size,r.size*(r.length??1),r.size);if(mesh instanceof Sprite&&r.shape==='missile')mesh.material.rotation=t*8;
      if(r.orientation==='ground'){const delta=cue.flight?.direction??end.clone().sub(cue.origin);mesh.rotation.set(-Math.PI/2,0,-Math.atan2(delta.z,delta.x));}}
    }
    continue;
   }
   if(cue.rain){this.updateRain(cue,tick);continue;}
   const envelope=(persistent?1:Math.min(1,t*12+.2)*(1-t)**1.2)*motion.opacity;
   if(cue.light){cue.light.intensity=envelope*(r.intensity??35);cue.light.distance=r.size*motion.scale;}
   for(const [i,mesh]of cue.meshes.entries()){
    mesh.material.opacity=envelope*(r.intensity??(r.shape==='pillar'?.18:1));
    if(r.shape==='ring'){mesh.scale.setScalar(r.size*(persistent||r.durationFrom?1:.55+t*.6));mesh.position.y=r.height;}
    if(r.shape==='glow'){mesh.scale.setScalar(r.size*(persistent?1:.85+t*.2));mesh.position.y=r.height;}
    if(r.shape==='pillar'){mesh.scale.set(r.size*(1-t*.5),r.height,r.size*(1-t*.5));mesh.position.y=r.height*.5;}
    if(r.shape==='billboard'){mesh.scale.set(r.size,r.size*(r.length??1),1);mesh.position.y=r.height+t*.15;}
    if(r.shape==='burst'){
     const angle=i*2.399963+cue.cast*.7,spread=(r.spread??1)*(.45+(i%7)/9)*(t+.12);
     const base=r.distribution==='disc'?Math.sqrt((i+.5)/cue.meshes.length)*(r.spread??1):0;
     mesh.position.set(Math.cos(angle)*(spread+base),r.height*t*(.5+(i%5)/8)+(r.distribution==='disc'?.15:1.2),Math.sin(angle)*(spread+base));
     mesh.scale.setScalar(r.size*(1-t*.65));
    }
    if(r.shape==='streaks'){
     const age=(t*1.4+i/cue.meshes.length)%1,angle=i*2.399963+cue.cast*.7,radius=(r.spread??1)*(.5+(i%5)/10);
     mesh.position.set(Math.cos(angle)*radius,.25+age*r.height,Math.sin(angle)*radius);
     mesh.scale.set(r.size,(r.length??1)*(.7+(i%3)*.15),1);
     mesh.material.opacity*=Math.sin(age*Math.PI);
    }
    mesh.scale.multiplyScalar(motion.scale);
    if(r.motion?.rotation){if(mesh instanceof Sprite)mesh.material.rotation=motion.rotation;else mesh.rotation.z=motion.rotation;}
   }
  }
  this.cues=this.cues.filter(c=>c.root.parent);
 }
 clear(){for(const cue of this.cues)this.remove(cue);this.cues=[];}
 dispose(){this.clear();this.root.removeFromParent();this.ring.dispose();this.disc.dispose();this.sphere.dispose();this.beam.dispose();this.quad.dispose();this.pillar.dispose();for(const t of this.textures.values())t.dispose();this.textures.clear();}
 syncDeliveries(deliveries:readonly import('../../sim/abilities/runtime').AbilityDeliveryView[],lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(deliveries.map(d=>d.cast));
  for(const cue of this.cues)if(['missile','wavefront'].includes(cue.recipe.shape)&&!live.has(cue.cast))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const d of deliveries){
   if(!this.cues.some(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    const p=lookup(d.ability);if(p)this.consume({id:0,event:'projectile',cast:d.cast,ability:d.ability,tick:d.tick,caster:0,target:0,origin:d.position,point:d.position,viewers:[]},p,height);
   }
   for(const cue of this.cues.filter(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    if(cue.flight?.tick===d.tick)continue;
    const position=new Vector3(d.position.x,height(d.position.x,d.position.y)+cue.recipe.height,d.position.y);
    cue.flight={previous:cue.flight?.position.clone()??position.clone(),position,direction:new Vector3(d.direction.x,0,d.direction.y),tick:d.tick};
   }
  }
 }
 syncStatuses(entities:readonly {id:number;x:number;y:number;hp?:number|null;spellStatuses?:readonly {ability:string;cast:number;source:number;started:number;expires:number;aura:boolean}[]}[],tick:number,lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(entities.flatMap(e=>(e.hp??1)>0?(e.spellStatuses??[]).filter(s=>s.expires>Math.floor(tick)).map(s=>`${e.id}:${s.ability}:${s.cast}`):[]));
  for(const cue of this.cues)if(cue.status&&!live.has(`${cue.entity}:${cue.ability}:${cue.cast}`))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const e of entities)for(const s of (e.hp??1)>0?e.spellStatuses??[]:[]){
   if(s.expires<=Math.floor(tick))continue;
   const presentation=lookup(s.ability);
   const p=presentation&&{...presentation,cues:presentation.cues.filter(r=>!this.cues.some(c=>c.status&&c.entity===e.id&&c.ability===s.ability&&c.cast===s.cast&&c.recipe.id===r.id))};
   if(p)for(const recipe of p.cues.filter(r=>r.event==='statusApplied'))this.consume({id:0,event:'statusApplied',cast:s.cast,tick:s.aura?(recipe.lifetime==='status'?0:Math.floor(tick/200)*200):s.started,ability:s.ability,caster:s.source,target:e.id,origin:e,point:e,durationTicks:s.aura?200:s.expires-s.started,viewers:[]},{...p,cues:[recipe]},height);
  }
 }
 get liveCues(){return this.cues.length;}
}
