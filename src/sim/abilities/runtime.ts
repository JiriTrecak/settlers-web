import {abilityTargetScore} from './ai';
import {validateAbilityState} from './validation';
import {releaseEffects,value,type AbilityBinding,type AbilityDefinition,type Control,type Relation} from '../../content/abilities/schema';
import type {AbilityState,PendingAbility,SpellDelivery} from './state';

export type AbilityPoint={x:number;y:number};
export type AbilityAim=number|AbilityPoint;
type EventTarget=AbilityPoint&{id:number};
export type AbilityActor={id:number;owner:string;x:number;y:number;hp:number;maxHp:number;alive:boolean;unit:boolean;hero?:boolean;melee?:boolean;blocked:boolean;targetable:boolean};
export type CasterAccess={actor:AbilityActor;state:AbilityState;bindings:readonly AbilityBinding[];maxMana:number;regenPerSecond:number;cooldownReductionPermille?:number};
export type AbilityDeliveryView={cast:number;ability:string;position:AbilityPoint;direction:AbilityPoint;tick:number};
export type AbilityEvent={id:number;cast:number;tick:number;ability:string;caster:number;target:number;event:'accepted'|'released'|'healed'|'damaged'|'cancelled'|'finished'|'waveStarted'|'wave'|'projectile'|'impact'|'statusApplied'|'dispelled'|'summoned';amount?:number;reason?:string;durationTicks?:number;radius?:number;origin:{x:number;y:number};point:{x:number;y:number};viewers:string[]};
/** Adapter into the existing game. The interpreter owns no parallel combat, RNG or world. */
export interface AbilityHost {
 deliveries?():SpellDelivery[];
 lifecycle?():void;
 effect?(caster:number,target:number,spell:AbilityDefinition,rank:number,cast:number,effect:ReturnType<typeof releaseEffects>[number],aura?:boolean,owner?:string):number;
 hasStatus?(target:number,ability:string):boolean;
 ambientCasters?():number[]; targets?():number[];
 tick():number; nextCast():number; casters():number[];
 get(id:number):AbilityActor|undefined; caster(id:number):CasterAccess|undefined;
 definition(id:string):AbilityDefinition|undefined;
 relation(a:AbilityActor,b:AbilityActor):Relation;
 visible(owner:string,target:AbilityActor,caster?:AbilityActor):boolean; viewers():string[];
 visiblePoint(owner:string,point:AbilityPoint,caster?:AbilityActor):boolean; validPoint(point:AbilityPoint):boolean;
 turnTicks(caster:number,target:AbilityAim):number; begin(caster:number):void;
 heal(caster:number,target:number,amount:number):number;
 damage(caster:number,target:number,amount:number,type:string,owner?:string):number;
}
/** Finite direct and channeled area delivery. Events are cosmetic and deliberately outside saved/checksummed state. */
export class AbilityRuntime {
 private sequence=0;
 private events:AbilityEvent[]=[];
 constructor(private readonly host:AbilityHost){}
 observedEvents(owner?:string){return this.events.filter(e=>(!owner||e.viewers.includes(owner))&&this.host.tick()-e.tick<=400).map(e=>structuredClone(e));}
 observedDeliveries(owner?:string):AbilityDeliveryView[]{
  return (this.host.deliveries?.()??[]).filter(s=>this.host.definition(s.ability)?.delivery?.kind!=='chain'&&(!owner||this.host.visiblePoint(owner,{x:Math.round(s.position.x),y:Math.round(s.position.y)}))).map(s=>{const dx=s.point.x-s.position.x,dy=s.point.y-s.position.y,n=Math.hypot(dx,dy)||1;return {cast:s.cast,ability:s.ability,position:{...s.position},direction:{x:dx/n,y:dy/n},tick:this.host.tick()};});
 }
 drainEvents(){const events=this.events;this.events=[];return events;}
 clearEvents(){this.events=[];this.sequence=0;}
 private emit(caster:AbilityActor,target:EventTarget,cast:number,ability:string,event:AbilityEvent['event'],extra:Partial<Pick<AbilityEvent,'amount'|'reason'|'durationTicks'|'origin'|'radius'>>={},audience?:string[]){
  const viewers=audience??this.host.viewers().filter(owner=>this.host.visible(owner,caster)&&(target.id?!!this.host.get(target.id)&&this.host.visible(owner,this.host.get(target.id)!):this.host.visiblePoint(owner,target,caster)));
  const spell=this.host.definition(ability),p=this.host.caster(caster.id)?.state.pending;
  const radius=spell?.targeting.radius!==undefined&&p?value(spell.targeting.radius,spell.ranks[p.rank-1]):undefined;
  const durationTicks=p?.channel?(event==='waveStarted'?p.channel.nextWaveTick-this.host.tick():event==='released'?p.channel.endTick-this.host.tick():undefined):undefined;
  this.events.push({...(radius!==undefined?{radius}:{}),...(durationTicks!==undefined?{durationTicks}:{}),id:++this.sequence,cast,tick:this.host.tick(),ability,caster:caster.id,target:target.id,event,origin:{x:caster.x,y:caster.y},point:{x:target.x,y:target.y},viewers,...extra});
  if(this.events.length>1024)this.events.splice(0,this.events.length-1024);
 }
 private target(p:PendingAbility,fallback:AbilityActor):EventTarget{return p.point?{...p.point,id:0}:this.host.get(p.target)??fallback;}
 private eligibility(caster:AbilityActor,aim:AbilityAim,spell:AbilityDefinition,rank:number,accepting:boolean):string|null{
  if(!caster.alive||caster.blocked)return 'Caster is unable to cast';
  if(spell.targeting.kind==='self')return aim===caster.id?null:'This ability targets its caster';
  if(typeof aim!=='number'){
   if(spell.targeting.kind!=='point'||!this.host.validPoint(aim))return 'Choose a valid ground position';
   if(!this.host.visiblePoint(caster.owner,aim,caster))return 'Target is not visible';
   const range=value(spell.targeting.range,spell.ranks[rank-1]);
   return (aim.x-caster.x)**2+(aim.y-caster.y)**2>range**2?'Target is out of range':null;
  }
  if(spell.targeting.kind!=='unit')return 'Choose a ground position';
  const target=this.host.get(aim);
  if(!target?.alive||!target.unit&&!spell.targeting.includeBuildings)return 'Choose a living unit';
  if(!target.targetable)return 'Target cannot be targeted';
  if(target.id===caster.id&&!spell.targeting.allowSelf)return 'Cannot target self';
  const relation=this.host.relation(caster,target);
  if(relation==='neutral'||!spell.targeting.relations.includes(relation))return 'Invalid target relationship';
  if(!this.host.visible(caster.owner,target,caster))return 'Target is not visible';
  const range=value(spell.targeting.range,spell.ranks[rank-1]);
  if((target.x-caster.x)**2+(target.y-caster.y)**2>range**2)return 'Target is out of range';
  const effects=releaseEffects(spell,rank,relation);
  if(accepting&&effects.every(e=>e.op==='heal')&&target.hp>=target.maxHp)return 'Target is already at full health';
  return null;
 }
 reason(casterId:number,bindingId:string,targetId:AbilityAim,control:Control='player'):string|null{
  const access=this.host.caster(casterId),binding=access?.bindings.find(b=>b.id===bindingId);
  const spell=binding&&this.host.definition(binding.ability);
  if(!access||!binding||!spell||spell.activation==='passive'||!binding.controls.includes(control))return 'Cannot cast this ability';
  const rank=access.state.ranks[binding.id]??0;
  if(!spell.ranks[rank-1])return 'Learn this ability first';
  if(access.state.pending)return 'Caster is busy';
  if((access.state.cooldowns[spell.id]??0)>this.host.tick())return 'Ability is cooling down';
  if(access.state.mana<value(spell.cast.cost.amount,spell.ranks[rank-1]))return 'Not enough mana';
  return this.eligibility(access.actor,targetId,spell,rank,true);
 }
 cast(casterId:number,bindingId:string,targetId:AbilityAim,control:Control='player'):string|null{
  const reason=this.reason(casterId,bindingId,targetId,control);if(reason)return reason;
  const access=this.host.caster(casterId)!,binding=access.bindings.find(b=>b.id===bindingId)!;
  const spell=this.host.definition(binding.ability)!,rank=access.state.ranks[binding.id],parameters=spell.ranks[rank-1];
  const escrow=value(spell.cast.cost.amount,parameters),startTick=this.host.tick()+this.host.turnTicks(casterId,targetId);
  const releaseTick=startTick+spell.cast.prepareTicks;
  access.state.mana-=escrow;
  const pending=access.state.pending={id:this.host.nextCast(),ability:spell.id,binding:bindingId,rank,target:typeof targetId==='number'?targetId:0,...(typeof targetId==='number'?{}:{point:{...targetId}}),owner:access.actor.owner,startTick,releaseTick,finishTick:releaseTick+spell.cast.recoverTicks+(spell.cast.channel?value(spell.cast.channel.waves,parameters)*value(spell.cast.channel.intervalTicks,parameters):0),...(spell.cast.channel?{channel:{wave:0,nextWaveTick:releaseTick+value(spell.cast.channel.intervalTicks,parameters),endTick:releaseTick+value(spell.cast.channel.waves,parameters)*value(spell.cast.channel.intervalTicks,parameters),origin:{x:access.actor.x,y:access.actor.y}}}:{}),phase:'preparing' as const,escrow,cooldownTicks:Math.round(value(spell.cast.cooldown.ticks,parameters)*(1000-(access.cooldownReductionPermille??0))/1000)};
  this.host.begin(casterId);
  this.emit(access.actor,this.target(pending,access.actor),pending.id,spell.id,'accepted');return null;
 }
 cancel(casterId:number,reason='Interrupted'){
  const access=this.host.caster(casterId),pending=access?.state.pending;if(!access||!pending)return;
  if(pending.phase==='preparing')access.state.mana=Math.min(access.maxMana,access.state.mana+pending.escrow);
  access.state.pending=null;
  this.emit(access.actor,this.target(pending,access.actor),pending.id,pending.ability,pending.phase==='recovering'?'finished':'cancelled',{reason});
 }
 tick(){
  this.host.lifecycle?.();
  this.auras();
  for(const id of this.host.casters().sort((a,b)=>a-b)){
   const access=this.host.caster(id)!;const pending=access.state.pending;
   if(pending&&(!access.actor.alive||access.actor.blocked||pending.owner!==access.actor.owner||(pending.channel&&((access.actor.x-pending.channel.origin.x)**2+(access.actor.y-pending.channel.origin.y)**2)>.01)))this.cancel(id,'Caster interrupted');
   else if(pending?.phase==='recovering'&&pending.finishTick<=this.host.tick()){
    access.state.pending=null;this.emit(access.actor,this.target(pending,access.actor),pending.id,pending.ability,'finished');
   }
   // Escrow still occupies pool capacity: regeneration cannot manufacture a refund bonus.
   if(access.actor.alive){
    const limit=Math.max(0,access.maxMana-(access.state.pending?.escrow??0));
    access.state.regeneration+=Math.round(access.regenPerSecond*1000);
    const amount=Math.floor(access.state.regeneration/40000);access.state.regeneration%=40000;
    access.state.mana=Math.min(limit,access.state.mana+amount);
    if(access.state.mana===limit)access.state.regeneration=0;
   }
  }
 }
 ambient(){
  const ambient=new Set(this.host.ambientCasters?.()??[]);
  for(const id of this.host.casters().sort((a,b)=>a-b)){
   const caster=this.host.caster(id);if(!caster||caster.state.pending)continue;
   for(const binding of caster.bindings){
    const spell=this.host.definition(binding.ability)!,rank=caster.state.ranks[binding.id];if(!rank||spell.activation==='passive')continue;
    const auto=spell.autocast && (caster.state.autocast?.[binding.id]??spell.autocast.enabledByDefault);
    const interval=auto?spell.autocast!.intervalTicks:binding.ai?.intervalTicks;
    if((!auto&&(!ambient.has(id)||!binding.ai))||!interval||this.host.tick()%interval!==id%interval)continue;
    if(!binding.controls.includes('ai'))continue;
    const aim=(target:number):AbilityAim=>spell.targeting.kind==='point'?{x:Math.round(this.host.get(target)!.x),y:Math.round(this.host.get(target)!.y)}:target;
    const candidates=(this.host.targets?.()??[]).filter(target=>!this.reason(id,binding.id,aim(target),'ai')&&(!auto||!this.host.hasStatus?.(target,spell.id))).map(target=>{const actor=this.host.get(target)!;return {target,score:abilityTargetScore(spell,rank,this.host.relation(caster.actor,actor),actor.hp,actor.maxHp,binding.ai?.preference??'wounded-ally')};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.target-b.target);
    if(candidates[0]){this.cast(id,binding.id,aim(candidates[0].target),'ai');break;}
   }
  }
 }
 private apply(access:CasterAccess,p:PendingAbility,spell:AbilityDefinition){
  const point=this.target(p,access.actor),radius=spell.targeting.radius===undefined?0:value(spell.targeting.radius,spell.ranks[p.rank-1]);
  const targets=p.point?(this.host.targets?.()??[]).filter(id=>{
   const t=this.host.get(id);if(!t?.alive||!t.unit&&!spell.targeting.includeBuildings||!t.targetable||(id===access.actor.id&&!spell.targeting.allowSelf))return false;
   const relation=this.host.relation(access.actor,t);
   return relation!=='neutral'&&spell.targeting.relations.includes(relation)&&(t.x-point.x)**2+(t.y-point.y)**2<=radius**2;
  }).sort((a,b)=>a-b).slice(0,spell.targeting.maxTargets??128):[p.target];
  for(const id of targets){
   const target=this.host.get(id);if(!target?.alive)continue;
   this.hit(access.actor,target,p.id,spell,p.rank);
  }
 }
 resolve(){
  this.deliver();
  for(const id of this.host.casters().sort((a,b)=>a-b)){
   const access=this.host.caster(id),p=access?.state.pending;
   if(!access||!p)continue;
   const spell=this.host.definition(p.ability)!,target=this.target(p,access.actor);
   if(p.phase==='preparing'&&p.releaseTick<=this.host.tick()){
    const reason=this.eligibility(access.actor,p.point??p.target,spell,p.rank,false);
    if(reason){this.cancel(id,reason);continue;}
    p.phase=p.channel?'channeling':'recovering';p.escrow=0;access.state.cooldowns[p.ability]=this.host.tick()+p.cooldownTicks;
    this.emit(access.actor,target,p.id,p.ability,'released');
    if(p.channel)this.emit(access.actor,target,p.id,p.ability,'waveStarted');else if(spell.delivery)this.launch(access,p,spell);else this.apply(access,p,spell);
   }
   if(p.phase==='channeling'&&p.channel&&p.channel.nextWaveTick<=this.host.tick()){
    this.emit(access.actor,target,p.id,p.ability,'wave');this.apply(access,p,spell);
    p.channel.wave++;
    if(p.channel.nextWaveTick>=p.channel.endTick)p.phase='recovering';
    else{
     p.channel.nextWaveTick+=value(spell.cast.channel!.intervalTicks,spell.ranks[p.rank-1]);
     if(access.state.pending===p)this.emit(access.actor,target,p.id,p.ability,'waveStarted');
    }
   }
   if(access.state.pending===p&&p.phase==='recovering'&&p.finishTick<=this.host.tick()){
    access.state.pending=null;this.emit(access.actor,target,p.id,p.ability,'finished');
   }
  }
 }
 private hit(caster:AbilityActor,target:AbilityActor,cast:number,spell:AbilityDefinition,rank:number,power=1000,aura=false){
  const audience=this.host.viewers().filter(owner=>this.host.visible(owner,caster)&&this.host.visible(owner,target));
  for(const effect of releaseEffects(spell,rank,this.host.relation(caster,target))){
   if(!this.host.get(target.id)?.alive)break;
   const n=Math.floor(effect.amount*power/1000);
   const amount=effect.op==='heal'?this.host.heal(caster.id,target.id,n):effect.op==='damage'?this.host.damage(caster.id,target.id,n,effect.damageType,caster.owner):this.host.effect?.(caster.id,target.id,spell,rank,cast,effect,aura,caster.owner)??0;
   if(aura)continue;
   const event=effect.op==='heal'?'healed':effect.op==='damage'?'damaged':effect.op==='status'?'statusApplied':effect.op==='dispel'?'dispelled':'summoned';
   this.emit(caster,target,cast,spell.id,event,{amount,...(effect.op==='status'?{durationTicks:amount}: {})},audience);
  }
 }
 private auras(){
  for(const id of this.host.casters().sort((a,b)=>a-b)){
   const access=this.host.caster(id)!;if(!access.actor.alive||!access.actor.targetable)continue;
   for(const binding of access.bindings){
    const spell=this.host.definition(binding.ability),rank=access.state.ranks[binding.id];
    if(!rank||!spell?.aura||spell.activation!=='passive')continue;
    for(const target of this.candidates(access.actor,spell,access.actor,spell.aura.radius)){
     if(spell.aura.meleeOnly&&!target.melee)continue;
     this.hit(access.actor,target,1,spell,rank,1000,true);
    }
   }
  }
 }
 private candidates(caster:AbilityActor,spell:AbilityDefinition,point:AbilityPoint,radius:number){
  return (this.host.targets?.()??[]).map(id=>this.host.get(id)!).filter(t=>t?.alive&&(t.unit||spell.targeting.includeBuildings)&&t.targetable&&(spell.targeting.allowSelf||t.id!==caster.id)&&spell.targeting.relations.includes(this.host.relation(caster,t) as 'ally'|'enemy')&&(t.x-point.x)**2+(t.y-point.y)**2<=radius**2).sort((a,b)=>a.id-b.id);
 }
 private launch(access:CasterAccess,p:PendingAbility,spell:AbilityDefinition){
  const queue=this.host.deliveries?.();if(!queue)throw Error('Ability host does not support delivery');
  if(queue.length>=512)return;
  const target=this.target(p,access.actor),origin={x:access.actor.x,y:access.actor.y},point={x:target.x,y:target.y};
  if(spell.delivery!.kind==='line'){
   const dx=point.x-origin.x,dy=point.y-origin.y,len=Math.hypot(dx,dy)||1;
   point.x=origin.x+dx/len*spell.delivery!.length;point.y=origin.y+dy/len*spell.delivery!.length;
  }
  const shot:SpellDelivery={cast:p.id,ability:spell.id,rank:p.rank,source:access.actor.id,owner:access.actor.owner,target:target.id,origin,position:{...origin},point,started:this.host.tick(),nextTick:this.host.tick()+1,hit:[],power:1000};
  queue.push(shot);
  const delivery=spell.delivery!;
  const durationTicks=delivery.kind==='chain'?1:Math.max(1,Math.ceil(Math.hypot(point.x-origin.x,point.y-origin.y)*40/delivery.speed));
  this.emit(access.actor,{id:target.id,...point},p.id,p.ability,'projectile',{durationTicks,radius:delivery.kind==='line'?delivery.width:0});
 }
 private deliver(){
  const queue=this.host.deliveries?.();if(!queue)return;
  for(let i=0;i<queue.length;){
   const shot=queue[i],caster=this.host.get(shot.source)??{id:shot.source,owner:shot.owner,...shot.origin,hp:0,maxHp:0,alive:false,unit:true,blocked:true,targetable:false},spell=this.host.definition(shot.ability),d=spell?.delivery;
   let done=!caster||caster.owner!==shot.owner||!spell||!d||this.host.tick()-shot.started>4000;
   if(!done&&caster&&spell&&d&&this.host.tick()>=shot.nextTick){
    if(d.kind==='chain'){
     const target=this.host.get(shot.target);
     if(target?.alive&&target.targetable&&this.host.relation(caster,target)==='enemy'){
      this.emit(caster,target,shot.cast,spell.id,'impact',{origin:{...shot.position}});
      this.hit(caster,target,shot.cast,spell,shot.rank,shot.power);
      shot.hit.push(target.id);shot.position={x:target.x,y:target.y};
     }
     const next=this.candidates(caster,spell,shot.position,d.radius).filter(t=>!shot.hit.includes(t.id)&&this.host.visible(caster.owner,t,caster)).sort((a,b)=>(a.x-shot.position.x)**2+(a.y-shot.position.y)**2-((b.x-shot.position.x)**2+(b.y-shot.position.y)**2)||a.id-b.id)[0];
     done=!next||shot.hit.length>=value(d.bounces,spell.ranks[shot.rank-1]);
     if(!done){shot.target=next.id;shot.power=Math.floor(shot.power*d.retentionPermille/1000);shot.nextTick=this.host.tick()+d.intervalTicks;}
    }else{
     const target=d.kind==='projectile'?this.host.get(shot.target):undefined;
     if(d.kind==='projectile'&&(!target?.alive||!target.targetable||!spell.targeting.relations.includes(this.host.relation(caster,target) as 'ally'|'enemy')))done=true;
     else{
      if(target)shot.point={x:target.x,y:target.y};
      const before={...shot.position},dx=shot.point.x-before.x,dy=shot.point.y-before.y,distance=Math.hypot(dx,dy),step=d.speed/40;
      const t=Math.min(1,step/(distance||1));
      shot.position={x:Math.round((before.x+dx*t)*1024)/1024,y:Math.round((before.y+dy*t)*1024)/1024};
      if(d.kind==='projectile'&&distance<=step){this.emit(caster,target!,shot.cast,spell.id,'impact');this.hit(caster,target!,shot.cast,spell,shot.rank);done=true;}
      if(d.kind==='line'){
       const vx=shot.position.x-before.x,vy=shot.position.y-before.y,l2=vx*vx+vy*vy;
       for(const victim of this.candidates(caster,spell,before,step+d.width)){
        if(shot.hit.includes(victim.id))continue;
        const u=Math.max(0,Math.min(1,((victim.x-before.x)*vx+(victim.y-before.y)*vy)/(l2||1)));
        if((victim.x-before.x-vx*u)**2+(victim.y-before.y-vy*u)**2>d.width**2)continue;
        this.hit(caster,victim,shot.cast,spell,shot.rank);shot.hit.push(victim.id);
        if(shot.hit.length>=128)break;
       }
       done=distance<=step||shot.hit.length>=128;
      }
     }
    }
   }
   if(done)queue.splice(i,1);else i++;
  }
 }
 validate(casterId:number){
  const access=this.host.caster(casterId);if(access)validateAbilityState(access,this.host.definition.bind(this.host),this.host.tick());
 }
}
