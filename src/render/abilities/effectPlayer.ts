import {EffectTrail} from './effectTrail';
import {EffectImages,type EffectImage} from './effectImages';
import type {TrailPoint} from '../../shared/effects/trailHistory';
import {configureFlipbook,sampleFlipbook} from './flipbook';
import type {EffectSocket,EffectSocketPose} from './effectSocket';
import {EffectModels,type EffectModel} from './effectModel';
import {EffectSound,type AudioView} from '../audio/effectSound';
import {sampleCueMotion} from './cueMotion';
import {AdditiveBlending,NormalBlending,Color,PlaneGeometry,CylinderGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial,PointLight,RingGeometry,SphereGeometry,Sprite,SpriteMaterial,Vector3,type Texture,type BufferGeometry} from 'three';
import {TICK_MS} from '../../shared/match/match';
import type {EffectRecipe,VisualEffect} from '../../content/effects/schema';
import {resolveEffectBindings} from '../../content/effects/schema';
export type EffectContext={id?:number;event:string;ability:string;cast:number;tick:number;caster:number;target:number;origin:{x:number;y:number;height?:number};point:{x:number;y:number;height?:number};durationTicks?:number;statusId?:string;radius?:number;viewers?:string[]};
type Recipe=EffectRecipe;
type Particle=Mesh<BufferGeometry,MeshBasicMaterial>|Sprite;
type RainDrop={shard:Particle;landing:Vector3;delay:number;scale:number;fragments:Particle[];flash?:Particle};
type Cue={image?:EffectImage;trail?:EffectTrail;trailPoints?:TrailPoint[];model?:EffectModel;basePosition:Vector3;attachmentPose?:EffectSocketPose;sound?:EffectSound;handle?:number;finiteEnd?:number;ability:string;flight?:{position:Vector3;previous:Vector3;direction:Vector3;tick:number};origin?:Vector3;destination?:Vector3;status?:boolean;statusId?:string;root:Group;meshes:Particle[];light?:PointLight;rain?:RainDrop[];recipe:Recipe;start:number;cast:number;sourceEntity:number;targetEntity:number;entity:number};
// Visual-only stable randomness: seeking the timeline reconstructs identical drops without RNG state.
function noise(seed:number){let n=seed|0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
export type EffectDeliveryPose=(cast:number)=>{position:Vector3;direction:Vector3}|undefined;
export type EffectAnchor=(id:number)=>{x:number;y:number;height:number}|undefined;
/** Finite, bounded presentation recipes. Tick-addressable playback has no gameplay callbacks. */
export class EffectPlayer {
 readonly root=new Group();
 constructor(private models=new EffectModels(),private images=new EffectImages()){}
 async ready(){
  const active=()=>this.cues.flatMap(c=>c.image?[c.image]:[]);
  for(;;){const leases=active();await Promise.all([this.models.ready(),...leases.map(l=>l.ready)]);if(active().every(l=>leases.includes(l)))break;}
  for(const image of active())if(image.error)throw image.error;
 }
 protected cues:Cue[]=[];
 private audioFrame={view:{x:0,z:0,rightX:1,rightZ:0} as AudioView,playing:false,speed:1};
 setAudioFrame(view:AudioView,playing:boolean,speed=1){this.audioFrame={view,playing,speed};if(!playing||speed<=0)for(const cue of this.cues)cue.sound?.stop();}
 private nextHandle=1;
 private ring=new RingGeometry(.83,1,48);private disc=new RingGeometry(0,1,48);
 private quad=new PlaneGeometry(1,1);
 private beam=new CylinderGeometry(1,1,1,5);
 private sphere=new SphereGeometry(1,8,6);private pillar=new CylinderGeometry(.3,1,1,24,1,true);
 private particle(recipe:Recipe,index:number,count:number,map?:Texture):Particle{
  const particle=this.makeParticle(recipe,index,count,map);if(recipe.texture&&recipe.flipbook)configureFlipbook(particle.material,recipe.flipbook);return particle;
 }
 private makeParticle(recipe:Recipe,index:number,count:number,map?:Texture):Particle{
  const colour=new Color(recipe.colour).lerp(new Color(recipe.accent),index/Math.max(1,count-1));
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
  if(recipe.shape==='missile'){
   material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vOrbNormal; varying vec3 vOrbView;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvOrbNormal=normalize(normalMatrix*normal);vOrbView=-mvPosition.xyz;');
    shader.fragmentShader='varying vec3 vOrbNormal; varying vec3 vOrbView;\n'+shader.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.a *= pow(max(0.0,dot(normalize(vOrbNormal),normalize(vOrbView))),2.0);\n#include <dithering_fragment>');
   };
   material.customProgramCacheKey=()=>'effect-missile-soft-1';
  }
  const mesh=new Mesh(recipe.shape==='ring'?this.ring:recipe.shape==='glow'?this.disc:recipe.shape==='pillar'?this.pillar:recipe.shape==='beam'?this.beam:this.sphere,material);
  if(recipe.shape==='ring'||recipe.shape==='glow')mesh.rotation.x=-Math.PI/2;
  return mesh;
 }
 protected emit(event:EffectContext,recipes:Recipe[],height:(x:number,y:number)=>number=()=>0,externallyOwned=false){
  if(event.event==='cancelled'){for(const cue of this.cues.filter(c=>c.cast===event.cast))this.remove(cue);this.cues=this.cues.filter(c=>c.root.parent);}
  for(const raw of recipes.filter(c=>c.event===event.event&&(!c.statusId||c.statusId===event.statusId))){
   const entity=raw.anchor==='caster'?event.caster:event.target;
   if(raw.lifetime==='status'&&this.cues.some(c=>c.status&&c.entity===entity&&c.ability===event.ability&&c.cast===event.cast&&c.statusId===event.statusId&&c.recipe.id===raw.id))continue;
   const recipe={...raw,...(raw.durationFrom&&event.durationTicks?{durationTicks:event.durationTicks}:{}),...(raw.sizeFrom&&event.radius?{size:event.radius}:{}),...(raw.spreadFrom&&event.radius?{spread:event.radius}:{})};
   const deliveryTicks=recipe.durationTicks;
   if(recipe.shape==='rain')recipe.durationTicks/=recipe.fallSpeed??1;
   // Faster rain starts later so ground impacts still coincide with the damage wave.
   const start=event.tick+recipe.startTick+(recipe.shape==='rain'&&recipe.durationFrom?deliveryTicks-recipe.durationTicks:0);
   // Sustain/loop control appearance, not ownership. Finite spell bindings always
   // end; standalone handles and statuses have an explicit external cleanup owner.
   const finiteEnd=!externallyOwned&&recipe.lifetime==='finite'&&(recipe.sustain||recipe.loop)?start+(recipe.durationFrom?deliveryTicks:recipe.periodTicks??deliveryTicks):undefined;
   if(this.cues.length>=64)break;
   if(recipe.shape==='light'&&this.cues.filter(c=>c.light).length>=4)continue;
   const perDrop=recipe.shape==='rain'&&recipe.impact?recipe.impact.count+2:1;
   const count=['light','sound','mesh'].includes(recipe.shape)?0:Math.min(['burst','streaks','rain','beam','particles'].includes(recipe.shape)?recipe.count:1,Math.floor((512-this.cues.reduce((sum,c)=>sum+c.meshes.length,0))/perDrop));
   if(!count&&!['light','sound','mesh'].includes(recipe.shape))continue;
   const model=recipe.model?this.models.create(recipe.model):undefined;if(recipe.model&&!model)continue;
   const image=recipe.texture&&count?this.images.acquire(recipe.texture):undefined;
   const trail=recipe.trail?new EffectTrail(recipe.trail):undefined;
   const root=new Group(),point=recipe.anchor==='caster'?event.origin:event.point;
   root.position.set(point.x+(recipe.offset?.x??0),(point.height??height(point.x,point.y))+.035+(recipe.offset?.y??0),point.y+(recipe.offset?.z??0));this.root.add(root);
   if(model)root.add(model.root);
   const meshes=Array.from({length:count},(_,i)=>this.particle(recipe,i,count,image?.map));
   const rain=recipe.shape==='rain'?meshes.map((shard,i):RainDrop=>{
    const seed=event.cast*73856093+event.tick*19349663+i*83492791;
    const angle=(i+noise(seed+1)*.6)*2.399963+noise(event.tick+event.cast)*Math.PI*2;
    const radius=Math.sqrt((i+noise(seed+2))/count)*(recipe.spread??1);
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    const landing=new Vector3(x,height(point.x+x,point.y+z)-root.position.y+.055,z);
    const fragments=recipe.impact?Array.from({length:recipe.impact.count},(_,j)=>this.particle({...recipe,...recipe.impact,shape:'burst'},j,recipe.impact!.count,image?.map)):[];
    const flash=recipe.impact?this.particle({...recipe,...recipe.impact,shape:'glow',texture:undefined},0,1):undefined;
    const back=this.fallDirection(recipe).normalize();
    if(shard instanceof Sprite){const right=new Vector3(),up=new Vector3();shard.onBeforeRender=(_renderer,_scene,camera)=>{
     right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
     shard.material.rotation=Math.atan2(-back.dot(right),back.dot(up));
    };}
    return {shard,landing,delay:noise(seed+3)*(recipe.launchDelayMs??0)/TICK_MS,scale:.8+noise(seed+4)*.35,fragments,flash};
   }):undefined;
   for(const drop of rain??[]){meshes.push(...drop.fragments);if(drop.flash)meshes.push(drop.flash);}
   if(meshes.length)root.add(...meshes);if(trail)root.add(trail.mesh);
   const light=recipe.shape==='light'?new PointLight(recipe.colour,0,recipe.size,2):undefined;
   if(light){light.castShadow=false;light.position.y=recipe.height;root.add(light);}
   this.cues.push({image,trail,model,finiteEnd,basePosition:root.position.clone(),sound:recipe.sound?new EffectSound(recipe.sound):undefined,ability:event.ability,origin:new Vector3(event.origin.x,(event.origin.height??height(event.origin.x,event.origin.y))+recipe.height,event.origin.y),destination:new Vector3(event.point.x,(event.point.height??height(event.point.x,event.point.y))+recipe.height,event.point.y),status:event.event==='statusApplied',statusId:event.statusId,root,meshes,light,rain,recipe,start,cast:event.cast,sourceEntity:event.caster,targetEntity:event.target,entity:recipe.anchor==='caster'?event.caster:event.target});
  }
 }
 protected remove(cue:Cue){cue.image?.release();cue.trail?.dispose();cue.model?.dispose();cue.sound?.stop();cue.root.removeFromParent();for(const m of cue.meshes)m.material.dispose();cue.light?.dispose();}
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
    sampleFlipbook(drop.shard.material,tick-cue.start-drop.delay,noise(cue.cast*7919+i*97));
    drop.shard.scale.set(r.size*drop.scale,length,1);drop.shard.material.opacity=Math.min(1,age*2)*(r.intensity??1);
   }
   const impact=r.impact,p=impact?impactAge/impact.durationTicks:1,visible=impactAge>=0&&p<1;
   if(drop.flash){drop.flash.visible=visible;if(visible){drop.flash.position.copy(drop.landing);drop.flash.scale.setScalar(impact!.spread*(.35+p));drop.flash.material.opacity=(1-p)**3*.9;}}
   for(const [j,fragment]of drop.fragments.entries()){
    fragment.visible=visible;if(!visible)continue;
    const angle=j*2.399963+i*1.7,speed=.55+noise(i*37+j*97)*.45;
    fragment.position.copy(drop.landing).add(new Vector3(Math.cos(angle)*impact!.spread*p*speed,.08+impact!.height*4*p*(1-p)*speed,Math.sin(angle)*impact!.spread*p*speed));
    fragment.scale.set(impact!.size*(1-p*.6),impact!.size*(1.4-p*.6),1);
    sampleFlipbook(fragment.material,tick-cue.start-drop.delay-r.durationTicks,noise(cue.cast*7919+i*97+j));
    fragment.material.opacity=(1-p)**1.5;if(fragment instanceof Sprite)fragment.material.rotation=angle+p*3;
   }
  }
 }
 private updateParticles(cue:Cue,tick:number){
  const r=cue.recipe,e=r.emitter!,elapsed=tick-cue.start;
  const direction=new Vector3(e.direction.x,e.direction.y,e.direction.z).normalize();if(direction.lengthSq()===0)direction.set(0,1,0);
  const side=new Vector3().crossVectors(direction,Math.abs(direction.y)<.99?new Vector3(0,1,0):new Vector3(1,0,0)).normalize(),up=new Vector3().crossVectors(side,direction).normalize();
  const sustained=r.sustain||r.lifetime==='status';
  const total=Math.floor((sustained?elapsed:Math.min(elapsed,r.durationTicks))*e.rate/40);
  for(const [i,mesh]of cue.meshes.entries()){
   const ordinal=e.mode==='burst'?i:i+Math.max(0,Math.floor((total-i)/cue.meshes.length))*cue.meshes.length;
   const born=e.mode==='burst'?0:ordinal/e.rate*40,age=elapsed-born,t=age/e.lifetimeTicks;
   mesh.visible=age>=0&&t<1&&(sustained||born<=r.durationTicks);if(!mesh.visible){mesh.position.set(0,0,0);mesh.scale.setScalar(0);mesh.material.opacity=0;continue;}
   const seed=cue.cast*7919+ordinal*97;sampleFlipbook(mesh.material,age,noise(seed));
   const azimuth=noise(seed+1)*Math.PI*2,cosTheta=1-noise(seed+2)*(1-Math.cos(e.coneDegrees*Math.PI/180)),sinTheta=Math.sqrt(1-cosTheta*cosTheta);
   const velocity=direction.clone().multiplyScalar(cosTheta).addScaledVector(side,Math.cos(azimuth)*sinTheta).addScaledVector(up,Math.sin(azimuth)*sinTheta).multiplyScalar(e.speed*(1-e.speedVariation+2*e.speedVariation*noise(seed+3)));
   const seconds=age/40,travel=e.drag>0?(1-Math.exp(-e.drag*seconds))/e.drag:seconds,angle=noise(seed+4)*Math.PI*2,radius=Math.sqrt(noise(seed+5))*e.spawnRadius;
   mesh.position.set(Math.cos(angle)*radius,r.height,Math.sin(angle)*radius).addScaledVector(velocity,travel);mesh.position.y+=.5*e.gravity*seconds*seconds;
   mesh.scale.setScalar(e.startSize+(e.endSize-e.startSize)*t);mesh.material.opacity=Math.min(1,e.fadeIn? t/e.fadeIn:1)*Math.min(1,e.fadeOut?(1-t)/e.fadeOut:1)*(r.intensity??1);mesh.material.color.set(r.colour).lerp(new Color(r.accent),t);
   if(mesh instanceof Sprite)mesh.material.rotation=noise(seed+6)*Math.PI*2+e.spin*seconds;else mesh.rotation.z=e.spin*seconds;
  }
 }
 update(tick:number,anchor?:EffectAnchor,deliveryPose?:EffectDeliveryPose,socket?:EffectSocket){
  for(const cue of this.cues){
   const r=cue.recipe;
   if(cue.finiteEnd!==undefined&&tick>=cue.finiteEnd){this.remove(cue);continue;}
   cue.root.visible=tick>=cue.start;if(!cue.root.visible){cue.sound?.stop();for(const mesh of cue.meshes)mesh.visible=false;continue;}
   const localTick=r.loop?cue.start+(tick-cue.start)%(r.periodTicks??r.durationTicks):tick;
   for(const [index,mesh] of cue.meshes.entries()){mesh.visible=true;sampleFlipbook(mesh.material,localTick-cue.start,noise(cue.cast*7919+index*97));}
   const persistent=r.sustain||r.lifetime==='status',t=persistent?0:Math.min(1,Math.max(0,(localTick-cue.start)/r.durationTicks));
   const motion=sampleCueMotion(r.motion,tick-cue.start);
   const lifetime=r.durationTicks+(r.emitter?.lifetimeTicks??0)+(cue.rain?(r.launchDelayMs??0)/TICK_MS+(r.impact?.durationTicks??0):0);
   if(!persistent&&!r.loop&&!cue.flight&&tick-cue.start>=lifetime){this.remove(cue);continue;}
   if(r.follow&&anchor){const point=anchor(cue.entity);if(point)cue.root.position.set(point.x+(r.offset?.x??0),point.height+.035+(r.offset?.y??0),point.y+(r.offset?.z??0));}
   if(r.attachment){
    const pose=r.follow?socket?.(cue.entity,r.attachment.socket):cue.attachmentPose??socket?.(cue.entity,r.attachment.socket);
    if(pose){
     if(!r.follow)cue.attachmentPose={position:pose.position.clone(),rotation:pose.rotation.clone()};
     if(r.attachment.inheritRotation)cue.root.quaternion.copy(pose.rotation);else cue.root.quaternion.identity();
     const offset=new Vector3(r.offset?.x??0,r.offset?.y??0,r.offset?.z??0).applyQuaternion(cue.root.quaternion);
     cue.root.position.copy(pose.position).add(offset);
    }else{
     cue.root.quaternion.identity();
     const base=r.follow?anchor?.(cue.entity):undefined;
     if(base)cue.root.position.set(base.x+(r.offset?.x??0),base.height+.035+(r.offset?.y??0),base.y+(r.offset?.z??0));else cue.root.position.copy(cue.basePosition);
     if(r.attachment.fallback==='hide'){cue.root.visible=false;cue.sound?.stop();continue;}
    }
   }
   if(cue.sound){cue.sound.sample({...this.audioFrame,tick:(r.sound!.loop?tick:localTick)-cue.start,endTick:cue.finiteEnd!==undefined?cue.finiteEnd-cue.start:persistent||r.loop?undefined:r.durationTicks,x:cue.root.position.x,z:cue.root.position.z});continue;}
   if(['missile','beam','wavefront'].includes(r.shape)&&cue.origin&&cue.destination){
    const origin=cue.origin.clone(),end=cue.destination.clone();
    if(r.shape==='beam'&&r.follow&&anchor){
     const source=anchor(cue.sourceEntity),target=anchor(cue.targetEntity);
     if(source)origin.set(source.x,source.height+r.height,source.y);
     if(target)end.set(target.x,target.height+r.height,target.y);
    }
    if(r.shape==='missile'&&anchor){const target=anchor(cue.entity);if(target)end.set(target.x,target.height+r.height,target.y);}
    const pose=deliveryPose?.(cue.cast);
    const position=pose?.position??(cue.flight?cue.flight.previous.clone().lerp(cue.flight.position,Math.max(0,Math.min(1,tick-cue.flight.tick))):cue.origin.clone().lerp(end,Math.min(1,t)));cue.root.position.set(r.offset?.x??0,r.offset?.y??0,r.offset?.z??0);
    for(const [segment,mesh] of cue.meshes.entries()){mesh.material.opacity=(r.intensity??1)*(r.shape==='beam'?1-t:1);
     if(r.shape==='beam'){
      const direction=end.clone().sub(origin),side=new Vector3(-direction.z,0,direction.x).normalize();
      const vertex=(i:number)=>origin.clone().addScaledVector(direction,i/cue.meshes.length).addScaledVector(side,i===0||i===cue.meshes.length?0:(noise(cue.cast*43+i*11+Math.floor(t*5))-.5)*.8);
      const a=vertex(segment),b=vertex(segment+1),delta=b.clone().sub(a);
      mesh.position.copy(a).addScaledVector(delta,.5);mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize());mesh.scale.set(r.size,delta.length(),r.size);
     }else{mesh.position.copy(position);mesh.scale.set(r.size,r.size*(r.length??1),r.size);if(mesh instanceof Sprite&&r.shape==='missile')mesh.material.rotation=t*8;
      else if(r.shape==='missile'){const direction=pose?.direction??cue.flight?.direction??end.clone().sub(cue.origin).normalize();mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction);}
      if(r.orientation==='ground'){const delta=cue.flight?.direction??end.clone().sub(cue.origin);mesh.rotation.set(-Math.PI/2,0,-Math.atan2(delta.z,delta.x));}}
    }
    if(cue.trail&&r.trail){
     // Real deliveries provide observed history; standalone playback reconstructs
     // its declared straight path analytically so a direct seek matches playback.
     const cycleStart=r.loop?tick-(tick-cue.start)%(r.periodTicks??r.durationTicks):cue.start;
     const begin=Math.max(cycleStart,tick-r.trail.durationTicks);
     const points=cue.trailPoints?.filter(p=>p.tick<=tick)??Array.from({length:r.trail.maxPoints},(_,i)=>{
      const time=begin+(tick-begin)*i/(r.trail!.maxPoints-1),p=cue.origin!.clone().lerp(end,Math.min(1,Math.max(0,(time-cycleStart)/r.durationTicks)));
      return {tick:time,x:p.x,y:p.y,z:p.z};
     });
     const last={tick,x:position.x,y:position.y,z:position.z};
     if(points.at(-1)?.tick===tick)points[points.length-1]=last;else points.push(last);
     cue.trail.sample(tick,points);
    }
    continue;
   }
   if(r.shape==='particles'){this.updateParticles(cue,localTick);continue;}
   if(cue.rain){this.updateRain(cue,localTick);continue;}
   const envelope=(persistent?1:Math.min(1,t*12+.2)*(1-t)**1.2)*motion.opacity;
   if(cue.model){
    const rotation=r.model!.rotation;cue.model.root.position.y=r.height;cue.model.root.scale.setScalar(r.size*motion.scale);
    cue.model.root.rotation.set(rotation.x*Math.PI/180,rotation.y*Math.PI/180+motion.rotation,rotation.z*Math.PI/180);
    cue.model.sample(localTick-cue.start,envelope*(r.intensity??1),r.colour);continue;
   }
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
 /** Standalone visual playback: positions, clock and seed; no game or spell required. */
 play(effect:VisualEffect,options:{tick?:number;seed?:number;source?:{x:number;y:number;height?:number};target?:{x:number;y:number;height?:number};sustain?:boolean;radius?:number;durationTicks?:number}={},height:(x:number,y:number)=>number=()=>0){
  const handle=this.nextHandle++,first=this.cues.length;
  const recipes=resolveEffectBindings([{id:'preview',effect:effect.id,event:'released',anchor:'target',lifetime:options.sustain?'status':'finite'}],[effect]);
  this.emit({event:'released',ability:effect.id,cast:options.seed??handle,tick:options.tick??0,caster:0,target:1,origin:options.source??{x:0,y:0},point:options.target??{x:0,y:0},radius:options.radius,durationTicks:options.durationTicks},recipes,height,true);for(const cue of this.cues.slice(first))cue.handle=handle;return handle;
 }
 stop(handle:number){for(const cue of this.cues.filter(c=>c.handle===handle))this.remove(cue);this.cues=this.cues.filter(c=>c.root.parent);}
 clear(){for(const cue of this.cues)this.remove(cue);this.cues=[];}
 dispose(){this.clear();this.models.dispose();this.root.removeFromParent();this.ring.dispose();this.disc.dispose();this.sphere.dispose();this.beam.dispose();this.quad.dispose();this.pillar.dispose();this.images.dispose();}
 get liveCues(){return this.cues.length;}
 /** Focused inspection includes the selected actor's visible attached effects. */
 rootsForEntity(entity:number){return this.cues.filter(c=>c.entity===entity&&c.root.parent).map(c=>c.root);}
}
