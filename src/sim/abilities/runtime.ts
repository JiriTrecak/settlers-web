import {SimulationProfiler} from '../profiling';
import {stepSwarm,type SwarmCargo} from './swarm';
import {resolveEffect} from '../../content/abilities/schema';
import {effectMagnitude,recordEffect,type EffectResults} from './magnitudes';
import {matchesAbilityCondition} from '../../content/abilities/conditions';
import {acceptsSpell,matchesSpellTarget,matchesSpellFilter,operationFilter,type SpellEligibility} from './eligibility';
import {corpseAbilityAims,abilityAimScore,strategicAbilityAims} from './ai';
import {operationTargets} from './recipients';
import {validateAbilityState} from './validation';
import {releaseEffects,value,type AbilityBinding,type AbilityDefinition,type Control,type Relation,type Effect} from '../../content/abilities/schema';
import type {AbilityState,PendingAbility,SpellDelivery,SpellInstance,SpellSource} from './state';

export type AbilityPoint={x:number;y:number;surface?:string};
export type AbilityAim=number|AbilityPoint;
export type AbilityVisualPoint=AbilityPoint&{height?:number};
type EventTarget=AbilityVisualPoint&{id:number};
export type AbilityActor=AbilityVisualPoint&SpellEligibility&{sourceContext?:SpellSource;id:number;owner:string;camp?:string;hp:number;maxHp:number;maxMana?:number;mana?:number;alive:boolean;unit:boolean;hero?:boolean;melee?:boolean;blocked:boolean;targetable:boolean};
export type CasterAccess={actor:AbilityActor;state:AbilityState;bindings:readonly AbilityBinding[];maxMana:number;regenPerSecond:number;cooldownReductionPermille?:number};
export type HeroReturnView={id:number;owner:string;x:number;y:number;ability:string;cast:number;started:number;due:number};
export type AbilityDeliveryView={cast:number;ability:string;position:AbilityVisualPoint;direction:AbilityVisualPoint;tick:number};
export type AbilityEvent={id:number;cast:number;tick:number;ability:string;caster:number;target:number;event:'splitStarted'|'splitEnded'|'returned'|'interval'|'accepted'|'released'|'healed'|'damaged'|'cancelled'|'finished'|'waveStarted'|'wave'|'projectile'|'impact'|'statusApplied'|'dispelled'|'summoned'|'drained'|'manaRestored'|'teleported'|'visionCreated'|'criticalStrike'|'evaded'|'cleaved'|'weaponEnhanced'|'enhancedHit'|'death'|'kill'|'weaponRelease'|'weaponOrdered'|'weaponOrderCancelled'|'resurrected'|'revivalStarted'|'revived'|'revivalCancelled'|'converted'|'contained'|'releasedContained'|'digested'|'sacrificed';spawned?:number[];untilDeath?:boolean;amount?:number;statusId?:string;reason?:string;durationTicks?:number;radius?:number;origin:AbilityVisualPoint;point:AbilityVisualPoint;viewers:string[]};
/** Adapter into the existing game. The interpreter owns no parallel combat, RNG or world. */
export interface AbilityHost {
 /** Absolute terrain/deck height for point delivery endpoints. Actor height includes flight. */
 height?(point:AbilityPoint):number;
 weaponCastReason?(source:number,target:number,spell:AbilityDefinition,rank:number):string|null;
 orderWeaponCast?(source:number,target:number,spell:AbilityDefinition,binding:string,rank:number,cast:number):void;
 weaponOrders?():void;
 heroReturns?():HeroReturnView[];
 corpses?(caster:AbilityActor):import('./corpses').CorpseView[];
 summon?(caster:AbilityActor,spell:AbilityDefinition,rank:number,cast:number,effect:Extract<ReturnType<typeof resolveEffect>,{op:'summon'}>,point:AbilityPoint):{point:AbilityPoint;amount:number;units:EventTarget[]}[];
 revive?(caster:AbilityActor,spell:AbilityDefinition,rank:number,cast:number,effect:Extract<Effect,{op:'revive'}>):number;
 resurrect?(caster:AbilityActor,spell:AbilityDefinition,rank:number,cast:number,effect:Extract<Effect,{op:'resurrect'}>,point:AbilityPoint):EventTarget[];
 validateAim?(caster:number,aim:AbilityAim,spell:AbilityDefinition,rank:number):string|null;
 endInstance?(cast:number):void;
 instances?():SpellInstance[];
 deliveries?():SpellDelivery[];
 reactions?():void;
 death?(source:number):void;
 restoreSource?(context:SpellSource):AbilityActor;
 weaponDeliveries?(owner?:string):AbilityDeliveryView[];
 lifecycle?():void;
 effect?(caster:number,target:number,spell:AbilityDefinition,rank:number,cast:number,effect:ReturnType<typeof releaseEffects>[number],aura?:boolean,owner?:string,point?:AbilityPoint,context?:{aim:AbilityPoint;origin:AbilityPoint&{sourceContext?:SpellSource};creationGrant?:boolean}):number;
 hasStatus?(target:number,ability:string):boolean;
 ambientCasters?():number[]; targets?():number[];
 /** Alive targets visible to this caster, in the same order as targets().
  * Hosts can reject candidates before constructing full combat/source records. */
 visibleTargets?(caster:AbilityActor):number[];
 tick():number; nextCast():number; casters():number[];
 get(id:number):AbilityActor|undefined; caster(id:number):CasterAccess|undefined;
 definition(id:string):AbilityDefinition|undefined;
 relation(a:AbilityActor,b:AbilityActor):Relation;
 visible(owner:string,target:AbilityActor,caster?:AbilityActor):boolean; viewers():string[];
 exploredPoint?(owner:string,point:AbilityPoint):boolean;
 visiblePoint(owner:string,point:AbilityPoint,caster?:AbilityActor):boolean; validPoint(point:AbilityPoint):boolean;
 turnTicks(caster:number,target:AbilityAim):number; begin(caster:number):void;
 heal(caster:number,target:number,amount:number):number;
 damage(caster:number,target:number,amount:number,type:string,owner?:string):number;
}
/** Finite direct and channeled area delivery. Events are cosmetic and deliberately outside saved/checksummed state. */
export class AbilityRuntime {
 private sequence=0;
 private events:AbilityEvent[]=[];
 constructor(private readonly host:AbilityHost,private readonly profile=new SimulationProfiler()){
  if(profile){
   this.tick=profile.wrap('Caster lifecycle',this.tick.bind(this));
   this.ambient=profile.wrap('Autocast decisions',this.ambient.bind(this));
   this.auras=profile.wrap('Aura recipients',this.auras.bind(this));
   this.persistent=profile.wrap('Persistent instances',this.persistent.bind(this));
   this.deliver=profile.wrap('Projectiles and chains',this.deliver.bind(this));
  }
 }
 observedEvents(owner?:string){return this.events.filter(e=>(!owner||e.viewers.includes(owner))&&this.host.tick()-e.tick<=400).map(e=>structuredClone(e));}
 observedDeliveries(owner?:string):AbilityDeliveryView[]{
  return [...(this.host.weaponDeliveries?.(owner)??[]).filter(d=>!owner||this.host.visiblePoint(owner,{x:Math.round(d.position.x),y:Math.round(d.position.y)})),...(this.host.deliveries?.()??[]).filter(s=>s.swarm?.phase!=='waiting'&&this.host.definition(s.ability)?.delivery?.kind!=='chain'&&(!owner||this.host.visiblePoint(owner,{x:Math.round(s.position.x),y:Math.round(s.position.y)}))).map(s=>{const dx=s.point.x-s.position.x,dy=s.point.y-s.position.y,dh=s.point.height-s.position.height,n=Math.hypot(dx,dy,dh)||1;return {cast:s.cast,ability:s.ability,position:{...s.position},direction:{x:dx/n,y:dy/n,height:dh/n},tick:this.host.tick()};})];
 }
 drainEvents(){const events=this.events;this.events=[];return events;}
 clearEvents(){this.events=[];this.sequence=0;}
 private emit(caster:EventTarget&{owner:string},target:EventTarget,cast:number,ability:string,event:AbilityEvent['event'],extra:Partial<Pick<AbilityEvent,'amount'|'statusId'|'reason'|'durationTicks'|'origin'|'radius'|'untilDeath'|'spawned'>>={},audience?:string[]){
  const viewers=audience??this.host.viewers().filter(owner=>!target.id&&owner===caster.owner&&this.host.definition(ability)?.targeting.visible===false||!!this.host.get(caster.id)&&this.host.visible(owner,this.host.get(caster.id)!)&&(target.id?!!this.host.get(target.id)&&this.host.visible(owner,this.host.get(target.id)!):this.host.visiblePoint(owner,target,this.host.get(caster.id))));
  const spell=this.host.definition(ability),p=this.host.caster(caster.id)?.state.pending;
  const radius=spell?.targeting.radius!==undefined&&p?value(spell.targeting.radius,spell.ranks[p.rank-1]):undefined;
  const durationTicks=p?.channel?(event==='waveStarted'?p.channel.nextWaveTick-this.host.tick():event==='released'?p.channel.endTick-this.host.tick():undefined):undefined;
  this.events.push({...(radius!==undefined?{radius}:{}),...(durationTicks!==undefined?{durationTicks}:{}),id:++this.sequence,cast,tick:this.host.tick(),ability,caster:caster.id,target:target.id,event,origin:{x:caster.x,y:caster.y,height:caster.height??this.host.height?.(caster)},point:{x:target.x,y:target.y,height:target.height??this.host.get(target.id)?.height??this.host.height?.(target)},viewers,...extra});
  if(this.events.length>1024)this.events.splice(0,this.events.length-1024);
 }
 private target(p:PendingAbility,fallback:AbilityActor):EventTarget{return p.point?{...p.point,id:0}:this.host.get(p.target)??fallback;}
 private eligibility(caster:AbilityActor,aim:AbilityAim,spell:AbilityDefinition,rank:number,accepting:boolean):string|null{
  if(!caster.alive||caster.blocked)return 'Caster is unable to cast';
  if(spell.delivery&&(this.host.deliveries?.().length??0)+(spell.delivery.kind==='swarm'?value(spell.delivery.count,spell.ranks[rank-1]):1)>512)return 'Too many active spell deliveries';
  const validateWorld=()=>this.host.validateAim?.(caster.id,aim,spell,rank)??null;
  if(spell.targeting.kind==='self')return aim!==caster.id?'This ability targets its caster':!matchesSpellTarget(caster,spell,caster,'ally')?'Target does not match spell filters':!acceptsSpell(caster,spell,'ally')?'Target is immune to this spell':validateWorld();
  if(typeof aim!=='number'){
   if(spell.targeting.kind!=='point'||!this.host.validPoint(aim))return 'Choose a valid ground position';
   if(spell.targeting.visible&&!this.host.visiblePoint(caster.owner,aim,caster))return 'Target is not visible';
   const range=value(spell.targeting.range,spell.ranks[rank-1]);
   return (aim.x-caster.x)**2+(aim.y-caster.y)**2>range**2?'Target is out of range':validateWorld();
  }
  if(spell.targeting.kind!=='unit')return 'Choose a ground position';
  const target=this.host.get(aim);
  if(!target?.alive||!target.unit&&!spell.targeting.includeBuildings)return 'Choose a living unit';
  if(!target.targetable)return 'Target cannot be targeted';
  if(target.id===caster.id&&!spell.targeting.allowSelf)return 'Cannot target self';
  const relation=this.host.relation(caster,target);
  if(relation==='neutral'||!spell.targeting.relations.includes(relation))return 'Invalid target relationship';
  if(!this.host.visible(caster.owner,target,caster))return 'Target is not visible';
  if(!matchesSpellTarget(target,spell,caster,this.host.relation(caster,target)))return 'Target does not match spell filters';
  if(!acceptsSpell(target,spell,relation))return 'Target is immune to this spell';
  const range=value(spell.targeting.range,spell.ranks[rank-1]);
  if((target.x-caster.x)**2+(target.y-caster.y)**2>range**2)return 'Target is out of range';
  const effects=releaseEffects(spell,rank,relation,{caster,target});
  if(accepting&&effects.length&&effects.every(e=>e.op==='heal')&&target.hp>=target.maxHp)return 'Target is already at full health';
  return validateWorld();
 }
 reason(casterId:number,bindingId:string,targetId:AbilityAim,control:Control='player'):string|null{
  const access=this.host.caster(casterId),binding=access?.bindings.find(b=>b.id===bindingId);
  const spell=binding&&this.host.definition(binding.ability);
  if(!access||!binding||!spell||spell.activation==='passive'||!binding.controls.includes(control))return 'Cannot cast this ability';
  const rank=access.state.ranks[binding.id]??0;
  if(!spell.ranks[rank-1])return 'Learn this ability first';
  if(spell.persistent?.toggle&&this.host.instances?.().some(i=>i.source===casterId&&i.ability===spell.id))return !access.actor.alive?'Caster is unable to cast':null;
  if(access.state.pending)return 'Caster is busy';
  if(spell.weaponCast&&!this.host.orderWeaponCast)return 'Weapon casting is not available';
  if((access.state.cooldowns[spell.id]??0)>this.host.tick())return 'Ability is cooling down';
  if(access.state.mana<value(spell.cast.cost.amount,spell.ranks[rank-1]))return 'Not enough mana';
  return this.eligibility(access.actor,targetId,spell,rank,true)??(spell.weaponCast&&typeof targetId==='number'?(this.host.weaponCastReason?.(casterId,targetId,spell,rank)??null):null);
 }
 cast(casterId:number,bindingId:string,targetId:AbilityAim,control:Control='player'):string|null{
  const reason=this.reason(casterId,bindingId,targetId,control);if(reason)return reason;
  const access=this.host.caster(casterId)!,binding=access.bindings.find(b=>b.id===bindingId)!;
  const spell=this.host.definition(binding.ability)!,rank=access.state.ranks[binding.id],parameters=spell.ranks[rank-1];
  if(spell.persistent?.toggle){
   const instances=this.host.instances?.(),active=instances?.findIndex(i=>i.source===casterId&&i.ability===spell.id)??-1;
   if(instances&&active>=0){const old=instances.splice(active,1)[0];this.host.endInstance?.(old.cast);this.emit(access.actor,access.actor,old.cast,spell.id,'finished',{reason:'Toggled off'});return null;}
  }
  if(access.state.weaponOrder)this.cancel(casterId,'Replaced by a new ability');
  if(spell.weaponCast&&typeof targetId==='number'){
   const cast=this.host.nextCast();this.host.orderWeaponCast?.(casterId,targetId,spell,bindingId,rank,cast);
   this.emit(access.actor,this.host.get(targetId)!,cast,spell.id,'weaponOrdered');return null;
  }
  const escrow=value(spell.cast.cost.amount,parameters),startTick=this.host.tick()+this.host.turnTicks(casterId,targetId);
  const releaseTick=startTick+spell.cast.prepareTicks;
  access.state.mana-=escrow;
  const pending=access.state.pending={id:this.host.nextCast(),ability:spell.id,binding:bindingId,rank,target:typeof targetId==='number'?targetId:0,...(typeof targetId==='number'?{}:{point:{...targetId}}),owner:access.actor.owner,startTick,releaseTick,finishTick:releaseTick+spell.cast.recoverTicks+(spell.cast.channel?value(spell.cast.channel.waves,parameters)*value(spell.cast.channel.intervalTicks,parameters):0),...(spell.cast.channel?{channel:{wave:0,nextWaveTick:releaseTick+value(spell.cast.channel.intervalTicks,parameters),endTick:releaseTick+value(spell.cast.channel.waves,parameters)*value(spell.cast.channel.intervalTicks,parameters),origin:{x:access.actor.x,y:access.actor.y}}}:{}),phase:'preparing' as const,escrow,cooldownTicks:Math.round(value(spell.cast.cooldown.ticks,parameters)*(1000-(access.cooldownReductionPermille??0))/1000)};
  this.host.begin(casterId);
  this.emit(access.actor,this.target(pending,access.actor),pending.id,spell.id,'accepted');return null;
 }
 cancel(casterId:number,reason='Interrupted'){
  const access=this.host.caster(casterId),pending=access?.state.pending;if(!access)return;
  const order=access.state.weaponOrder;if(order){delete access.state.weaponOrder;this.emit(access.actor,this.host.get(order.target)??access.actor,order.id,order.ability,'weaponOrderCancelled',{reason});}
  if(!pending)return;
  if(pending.phase==='preparing')access.state.mana=Math.min(access.maxMana,access.state.mana+pending.escrow);
  access.state.pending=null;
  this.emit(access.actor,this.target(pending,access.actor),pending.id,pending.ability,pending.phase==='recovering'?'finished':'cancelled',{reason});
 }
 tick(){
  this.host.lifecycle?.();
  this.auras();
  this.host.weaponOrders?.();
  for(const id of this.host.casters().sort((a,b)=>a-b)){
   const access=this.host.caster(id)!;const pending=access.state.pending;
   if(pending&&(!access.actor.alive||access.actor.blocked||pending.owner!==access.actor.owner||(pending.channel&&((access.actor.x-pending.channel.origin.x)**2+(access.actor.y-pending.channel.origin.y)**2)>.01)))this.cancel(id,'Caster interrupted');
   else if(pending?.phase==='channeling'&&pending.target&&(()=>{const t=this.host.get(pending.target),spell=this.host.definition(pending.ability)!;const range=spell.cast.channel?.tetherRange??value(spell.targeting.range,spell.ranks[pending.rank-1]);return !t?.alive||!t.targetable||spell.targeting.kind==='unit'&&(!this.host.visible(access.actor.owner,t,access.actor)||!matchesSpellTarget(t,spell,access.actor,this.host.relation(access.actor,t))||!acceptsSpell(t,spell,this.host.relation(access.actor,t))||!spell.targeting.relations.includes(this.host.relation(access.actor,t) as 'ally'|'enemy')||(t.x-access.actor.x)**2+(t.y-access.actor.y)**2>range**2);})())this.cancel(id,'Channel target lost');
   else if(pending?.phase==='recovering'&&pending.finishTick<=this.host.tick()){
    access.state.pending=null;this.emit(access.actor,this.target(pending,access.actor),pending.id,pending.ability,'finished');
   }
   // Escrow still occupies pool capacity: regeneration cannot manufacture a refund bonus.
   if(access.actor.alive&&access.actor.targetable){
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
   const caster=this.host.caster(id);if(!caster||caster.state.pending||caster.state.weaponOrder)continue;
   for(const binding of caster.bindings){
    const spell=this.host.definition(binding.ability)!,rank=caster.state.ranks[binding.id];if(!rank||spell.activation==='passive'||spell.weaponCast)continue;
    const auto=spell.autocast && (caster.state.autocast?.[binding.id]??spell.autocast.enabledByDefault);
    const interval=auto?spell.autocast!.intervalTicks:binding.ai?.intervalTicks;
    if((!auto&&(!ambient.has(id)||!binding.ai))||!interval||this.host.tick()%interval!==id%interval)continue;
    if(!binding.controls.includes('ai'))continue;
    if(spell.persistent?.toggle&&this.host.instances?.().some(i=>i.source===id&&i.ability===spell.id))continue;
    const aim=(target:number):AbilityAim=>spell.targeting.kind==='self'?id:spell.targeting.kind==='point'?{x:Math.round(this.host.get(target)!.x),y:Math.round(this.host.get(target)!.y)}:target;
    const observed=this.profile.measure('Visible target enumeration',()=>{
     const selected=this.host.visibleTargets?this.profile.measure('Visibility candidate query',()=>this.host.visibleTargets!(caster.actor)):undefined;
     const actors=this.profile.measure('Actor materialization',()=>(selected??this.host.targets?.()??[]).map(target=>this.host.get(target)!));
     const visible=selected?actors:this.profile.measure('Visibility filtering',()=>actors.filter(t=>t?.alive&&this.host.visible(caster.actor.owner,t,caster.actor)));
     return this.profile.measure('Allied mana lookup',()=>visible.map(t=>({...t,...(t.owner===caster.actor.owner?{mana:this.host.caster(t.id)?.state.mana??0}:{})})));
    });
    const intent=binding.ai?.intent;
    if(intent&&intent!=='utility'){
     const destinations=strategicAbilityAims(intent,spell,rank,caster.actor,observed,t=>this.host.relation(caster.actor,t),{valid:p=>this.host.validPoint(p),visible:p=>this.host.visiblePoint(caster.actor.owner,p,caster.actor),explored:p=>this.host.exploredPoint?.(caster.actor.owner,p)??false});
     const chosen=destinations.find(aim=>!this.reason(id,binding.id,aim,'ai'));
     if(chosen!==undefined){this.cast(id,binding.id,chosen,'ai');break;}continue;
    }
    const candidates=this.profile.measure('Target scoring',()=>(spell.targeting.kind==='self'?[caster.actor]:observed).filter(t=>!this.reason(id,binding.id,aim(t.id),'ai')).map(actor=>{
     const target=spell.targeting.kind==='point'?{id:0,x:Math.round(actor.x),y:Math.round(actor.y)}:actor;
     return {key:actor.id,target:aim(actor.id),score:abilityAimScore(spell,rank,caster.actor,target,observed,t=>this.host.relation(caster.actor,t),binding.ai?.preference??'wounded-ally',(id)=>this.host.hasStatus?.(id,spell.id)??false,this.host.corpses?.(caster.actor)??[])};
    }));
    const corpses=this.host.corpses?.(caster.actor)??[];
    for(const point of corpseAbilityAims(spell,corpses))if(!this.reason(id,binding.id,point,'ai'))candidates.push({key:point.id,target:{x:point.x,y:point.y},score:abilityAimScore(spell,rank,caster.actor,{...point,id:0},observed,t=>this.host.relation(caster.actor,t),binding.ai?.preference??'wounded-ally',()=>false,corpses)});
    const chosen=candidates.filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.key-b.key)[0];
    if(chosen){this.cast(id,binding.id,chosen.target,'ai');break;}
   }
  }
 }
 private apply(access:CasterAccess,p:PendingAbility,spell:AbilityDefinition){
  this.hit(access.actor,this.target(p,access.actor),p.id,spell,p.rank,1000,false,true);
 }
 resolve(){
  this.host.reactions?.();
  this.persistent();
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
    if(p.channel)this.emit(access.actor,target,p.id,p.ability,'waveStarted');else if(spell.delivery)this.launch(access,p,spell);else {this.apply(access,p,spell);if(spell.persistent)this.startPersistent(access,p,spell);}
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
 /** A release/impact is one context. Queries expand only the operation that owns them. */
 private creationGrants(caster:AbilityActor,target:EventTarget,cast:number,spell:AbilityDefinition,rank:number,grants:readonly string[]|undefined,viewers:readonly string[],visualOrigin?:AbilityPoint){
  for(const id of grants??[]){const grant=spell.statuses?.find(s=>s.id===id);if(grant)this.hit(caster,target,cast,spell,rank,1000,false,false,[grant],viewers,visualOrigin,true);}
 }
 private hit(caster:AbilityActor,aim:EventTarget,cast:number,spell:AbilityDefinition,rank:number,power=1000,aura=false,areaDefaults=false,operations=spell.onRelease,originViewers?:readonly string[],visualOrigin?:AbilityPoint,creationGrant=false,carry?:SwarmCargo){
  const parameters=spell.ranks[rank-1];
  const results:EffectResults=new Map(),liveCaster=this.host.get(caster.id),resources={caster:liveCaster?.owner===caster.owner?liveCaster:caster,target:aim.id?this.host.get(aim.id):undefined};
  const defaultCandidates=areaDefaults&&spell.targeting.radius!==undefined?(this.host.targets?.()??[]).map(id=>this.host.get(id)!).filter(Boolean):[];
  const query=(effect:Effect,current:AbilityActor)=>operationTargets(effect,spell,rank,effect.query||effect.target==='caster'?current:caster,aim,effect.query?(this.host.targets?.()??[]).map(id=>this.host.get(id)!).filter(Boolean):defaultCandidates,t=>this.host.relation(caster,t),areaDefaults);
  for(const operation of operations){
   const decisions=new Map<number,boolean>(),currentCaster=this.host.get(caster.id),branchCaster={...(currentCaster?.owner===caster.owner?currentCaster:caster)};
   // A branch evaluates each recipient's traits and relationship, including mixed areas.
   const declarations=operation.op==='branch'?[...operation.then,...operation.else]:[operation];
   for(const effect of declarations){
    const live=this.host.get(caster.id),operationCaster=live?.owner===caster.owner?{...live}:caster;
    const operationAim=effect.op==='teleport'&&effect.destination==='target'&&aim.id?{...(this.host.get(aim.id)??aim)}:aim;
    const targets=query(effect,operationCaster);
    for(const target of targets){
     const actor=target.id?this.host.get(target.id):undefined;
     if(operation.op==='branch'){
      if(!decisions.has(target.id))decisions.set(target.id,matchesAbilityCondition(operation.condition,{relation:this.host.relation(caster,actor??caster),caster:branchCaster,target:actor??{}}));
      const chosen=decisions.get(target.id)?operation.then:operation.else;
      if(!chosen.includes(effect))continue;
     }
     if(effect.op==='revive'){
      const duration=this.host.revive?.(caster,spell,rank,cast,effect)??0;
      if(duration)this.emit(operationCaster,target,cast,spell.id,'revivalStarted',{durationTicks:duration},originViewers?[...originViewers]:undefined);
      continue;
     }
     if(target.id&&(!actor?.alive||actor.targetable===false||!matchesSpellFilter(actor,operationFilter(effect))||!creationGrant&&!acceptsSpell(actor,spell,this.host.relation(caster,actor))))continue;
     if(effect.target==='caster'&&!effect.query&&actor?.owner!==caster.owner)continue;
     const resolved={...resolveEffect(effect,rank,parameters),amount:effectMagnitude(effect,parameters,{...resources,recipient:actor,results})};
     const audience=this.host.viewers().filter(owner=>effect.op==='vision'&&owner===caster.owner||(originViewers?originViewers.includes(owner):this.host.visible(owner,caster))&&(actor?this.host.visible(owner,actor):this.host.visiblePoint(owner,target,this.host.get(caster.id))));
     if(resolved.op==='summon'&&this.host.summon){
      for(const group of this.host.summon(caster,spell,rank,cast,resolved,target)){
       this.emit(operationCaster,{id:resolved.corpses?0:target.id,x:group.point.x,y:group.point.y},cast,spell.id,'summoned',{amount:group.amount,spawned:group.units.map(u=>u.id),...(resolved.durationTicks===undefined?{untilDeath:true}:{durationTicks:resolved.durationTicks}),...(visualOrigin?{origin:visualOrigin}:{})},audience.filter(owner=>this.host.visiblePoint(owner,group.point,this.host.get(caster.id))));
       for(const unit of group.units)this.creationGrants(caster,unit,cast,spell,rank,resolved.grants,audience,visualOrigin);
      }
      continue;
     }
     if(effect.op==='resurrect'){
      for(const raised of this.host.resurrect?.(caster,spell,rank,cast,effect,target)??[]){
       this.emit(operationCaster,raised,cast,spell.id,'resurrected',{amount:1,...(effect.durationTicks!==undefined?{durationTicks:value(effect.durationTicks,parameters)}:{}),...(visualOrigin?{origin:visualOrigin}:{})},audience.filter(owner=>this.host.visiblePoint(owner,raised,this.host.get(caster.id))));
       this.creationGrants(caster,raised,cast,spell,rank,effect.grants,audience,visualOrigin);
      }
      continue;
     }
     const n=Math.floor(resolved.amount*power/1000);
     const amount=effect.op==='heal'?this.host.heal(caster.id,target.id,n):effect.op==='damage'?this.host.damage(caster.id,target.id,n,effect.damageType,caster.owner):this.host.effect?.(caster.id,target.id,spell,rank,cast,(effect.op==='drain'||effect.op==='mana'?{...resolved,amount:n,...(carry&&resolved.op==='drain'&&resolved.restoreCaster?{restoreCaster:false}:{})}:resolved),aura,caster.owner,target,{aim:operationAim,origin:operationCaster,...(creationGrant?{creationGrant:true}:{})})??0;
     if(carry&&effect.op==='drain'&&effect.restoreCaster)carry[effect.resource]+=amount;
     recordEffect(results,effect,actor,amount);
     if(effect.op==='releaseContained')continue; // Each released occupant emits its own event.
     if(effect.op==='split')continue; // The linked-form lifecycle emits its own group events.
     if(aura||(effect.op==='status'||effect.op==='convert'||effect.op==='contain'||effect.op==='sacrifice')&&amount===0)continue;
     const event=effect.op==='heal'?'healed':effect.op==='damage'?'damaged':effect.op==='status'?'statusApplied':effect.op==='dispel'?'dispelled':effect.op==='drain'?'drained':effect.op==='mana'?'manaRestored':effect.op==='contain'?'contained':effect.op==='sacrifice'?'sacrificed':effect.op==='convert'?'converted':effect.op==='teleport'?'teleported':effect.op==='vision'?'visionCreated':'summoned';
     const moved=effect.op==='teleport'&&amount?this.host.get(target.id):undefined;
     this.emit(operationCaster,moved??target,cast,spell.id,event,{amount:effect.op==='contain'?1:amount,...(visualOrigin?{origin:visualOrigin}:{}),...(moved?{origin:{x:target.x,y:target.y,height:actor?.height??this.host.height?.(target)}}:{}),...(effect.op==='status'?{durationTicks:amount,statusId:effect.id,...(effect.lifetime==='untilDeath'?{untilDeath:true}:{})}: {}),...(effect.op==='contain'?{durationTicks:amount,...(effect.lifetime==='untilDeath'?{untilDeath:true}:{})}:{}),...(effect.op==='vision'?{durationTicks:amount,radius:value(effect.radius,parameters)}:{}),...(resolved.op==='summon'?{durationTicks:resolved.durationTicks}:{})},audience);
    }
   }
  }
 }
 /** Apply a saved release policy before lethal HP resolution; marks cannot recursively deal damage. */
 weaponStatus(target:number,payload:import('../game/missileState').WeaponEnhancement){
  if(!payload.status||!payload.sourceContext)return;
  const spell=this.host.definition(payload.ability),mark=spell?.statuses?.find(s=>s.id===payload.status),victim=this.host.get(target),caster=this.host.restoreSource?.(payload.sourceContext);
  if(!spell?.ranks[payload.rank-1]||!mark||!victim?.alive||!caster||this.host.relation(caster,victim)!=='enemy')return;
  const audience=this.host.viewers().filter(owner=>this.host.visible(owner,victim));
  this.hit(caster,victim,payload.cast,spell,payload.rank,1000,false,false,[mark],audience,{x:victim.x,y:victim.y});
 }
 /** Presentation follows authoritative weapon outcomes and cannot roll or apply damage. */
 combatEvent(source:number,target:number,ability:string,event:'criticalStrike'|'evaded'|'cleaved',amount:number){
  const caster=this.host.get(source),victim=this.host.get(target);if(!caster||!victim)return;
  this.emit(caster,victim,this.host.nextCast(),ability,event,{amount});
 }
 weaponEvent(source:number,target:number,ability:string,cast:number,event:'weaponEnhanced'|'projectile'|'enhancedHit'|'released'|'finished',amount:number,durationTicks?:number,origin?:{owner:string;x:number;y:number}){
  const caster=this.host.get(source)??(origin?{id:source,...origin}:undefined),victim=this.host.get(target);
  if(caster&&victim)this.emit(caster,victim,cast,ability,event,{amount,...(durationTicks===undefined?{}:{durationTicks})},event==='enhancedHit'?this.host.viewers().filter(owner=>this.host.visible(owner,victim)):undefined);
 }
 /** Capture before removal; execution runs through the same bounded operation interpreter. */
 notifyDeath(source:number){this.host.death?.(source);}
 invokeLifecycle(caster:AbilityActor,subject:EventTarget,event:'returned'|'interval'|'death'|'kill'|'weaponRelease',cast:number,spell:AbilityDefinition,rank:number,operations:AbilityDefinition['onRelease'],viewers:string[]){
  // A queued reward cannot migrate to a different owner through conversion.
  const current=this.host.get(caster.id);if(event!=='death'&&current&&current.owner!==caster.owner)return;
  const point={id:0,x:subject.x,y:subject.y};
  // Detached status-source deaths expose the victim point, never an unseen applier's position.
  const visualOrigin=event==='death'&&subject.id!==caster.id?{x:subject.x,y:subject.y}:undefined;
  this.emit(caster,event==='weaponRelease'||event==='interval'?subject:point,cast,spell.id,event,visualOrigin?{origin:visualOrigin}:{},viewers);
  // A committed release keeps its captured point. Lost/converted victims cannot receive unit effects.
  const victim=event==='weaponRelease'?this.host.get(subject.id):undefined;
  const aim=event==='interval'?(current??point):victim?.alive&&victim.targetable&&this.host.relation(caster,victim)==='enemy'?subject:point;
  this.hit(caster,aim,cast,spell,rank,1000,false,false,operations,viewers,visualOrigin);
 }
 splitEvent(target:number,record:import('./state').SplitForm,event:'splitStarted'|'splitEnded',spawned:number[]=[],success=true){
  const actor=this.host.get(target);if(!actor)return;
  this.emit(actor,actor,record.cast,record.ability,event,{spawned,amount:success?1:0,durationTicks:event==='splitStarted'?record.expires-record.started:undefined},this.host.viewers().filter(o=>o===record.owner||this.host.visiblePoint(o,actor)));
 }
 containmentEvent(host:number,target:number,record:import('./state').Containment,event:'releasedContained'|'digested',amount=0){
  const victim=this.host.get(target),carrier=this.host.get(host);if(!victim)return;
  this.emit(carrier??{id:host,owner:record.owner,x:victim.x,y:victim.y},victim,record.cast,record.ability,event,{amount},this.host.viewers().filter(o=>o===victim.owner||o===record.owner||this.host.visiblePoint(o,victim)));
 }
 observedHeroReturns(owner?:string){return (this.host.heroReturns?.()??[]).filter(r=>!owner||r.owner===owner||this.host.visiblePoint(owner,r));}
 /** A retained hero has completed (or exhausted) the bounded return operation. */
 revivalOutcome(target:number,record:import('./state').HeroReturn,success:boolean){
  const actor=this.host.get(target);if(!actor)return;
  const viewers=this.host.viewers().filter(owner=>owner===actor.owner||this.host.visiblePoint(owner,actor,actor));
  this.emit(actor,actor,record.cast,record.ability,success?'revived':'revivalCancelled',{},viewers);
 }
 /** Engine event entry point; content supplies bounded operations, never callbacks. */
 invoke(source:number,target:number,spell:AbilityDefinition,rank:number,operations:AbilityDefinition['onRelease']){
  const caster=this.host.get(source),aim=this.host.get(target);if(!caster?.alive||!aim)return;
  this.hit(caster,aim,this.host.nextCast(),spell,rank,1000,false,false,operations);
 }
 private startPersistent(access:CasterAccess,p:PendingAbility,spell:AbilityDefinition){
  const instances=this.host.instances?.(),d=spell.persistent!,r=spell.ranks[p.rank-1];if(!instances||instances.length>=512)return;
  const aim=this.target(p,access.actor);
  instances.push({sourceContext:access.actor.sourceContext,cast:p.id,ability:spell.id,rank:p.rank,source:access.actor.id,owner:access.actor.owner,target:aim.id,point:{x:aim.x,y:aim.y},origin:{x:access.actor.x,y:access.actor.y},started:this.host.tick(),nextTick:this.host.tick()+value(d.intervalTicks,r),expires:this.host.tick()+value(d.durationTicks,r)});
 }
 private persistent(){
  const instances=this.host.instances?.();if(!instances)return;
  for(let i=0;i<instances.length;){
   const instance=instances[i],spell=this.host.definition(instance.ability),d=spell?.persistent;
   const source=this.host.get(instance.source),caster=source??(instance.sourceContext?this.host.restoreSource?.(instance.sourceContext):undefined)??{id:instance.source,owner:instance.owner,...instance.origin,hp:0,maxHp:0,alive:false,unit:true,blocked:true,targetable:false};
   const target=this.host.get(instance.target);
   const center=d?.anchor==='caster'?caster:d?.anchor==='target'?target:{id:0,...instance.point};
   let reason=!d||!spell?'Definition unavailable':this.host.tick()>=instance.expires?'Expired':source&&source.owner!==instance.owner?'Owner changed':d.endsWithCaster&&!source?.alive?'Caster died':d.endsWithCaster&&source?.targetable===false?'Caster unavailable':!center||d.anchor==='target'&&(!target?.alive||!target.targetable)?'Target lost':d.anchor==='target'&&target&&(!matchesSpellTarget(target,spell,caster,this.host.relation(caster,target))||!acceptsSpell(target,spell,this.host.relation(caster,target)))?'Target no longer eligible':d.tetherRange!==undefined&&center&&((center.x-caster.x)**2+(center.y-caster.y)**2>d.tetherRange**2)?'Tether broken':null;
   if(!reason&&d&&spell&&center&&this.host.tick()>=instance.nextTick){
    const upkeep=value(d.upkeepMana,spell.ranks[instance.rank-1]),access=this.host.caster(instance.source);
    if((access?.state.mana??0)<upkeep)reason='Mana exhausted';
    else{
     if(upkeep)access!.state.mana-=upkeep;
     instance.nextTick+=value(d.intervalTicks,spell.ranks[instance.rank-1]);
     this.emit(caster,center,instance.cast,spell.id,'wave',{radius:spell.targeting.radius===undefined?undefined:value(spell.targeting.radius,spell.ranks[instance.rank-1])});
     this.hit(caster,center,instance.cast,spell,instance.rank,1000,false,true);
    }
   }
   if(reason){instances.splice(i,1);this.host.endInstance?.(instance.cast);this.emit(caster,center??{id:0,...instance.point},instance.cast,instance.ability,'finished',{reason});}else i++;
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
  return (this.host.targets?.()??[]).map(id=>this.host.get(id)!).filter(t=>t?.alive&&matchesSpellTarget(t,spell,caster,this.host.relation(caster,t))&&acceptsSpell(t,spell,this.host.relation(caster,t))&&(t.unit||spell.targeting.includeBuildings)&&t.targetable&&(spell.targeting.allowSelf||t.id!==caster.id)&&spell.targeting.relations.includes(this.host.relation(caster,t) as 'ally'|'enemy')&&(t.x-point.x)**2+(t.y-point.y)**2<=radius**2).sort((a,b)=>a.id-b.id);
 }
 private launch(access:CasterAccess,p:PendingAbility,spell:AbilityDefinition){
  const queue=this.host.deliveries?.();if(!queue)throw Error('Ability host does not support delivery');
  if(queue.length>=512)return;
  const target=this.target(p,access.actor),origin={x:access.actor.x,y:access.actor.y,height:access.actor.height??this.host.height?.(access.actor)??0},point={x:target.x,y:target.y,height:target.height??this.host.height?.(target)??0};
  if(spell.delivery!.kind==='line'){
   const dx=point.x-origin.x,dy=point.y-origin.y,len=Math.hypot(dx,dy)||1;
   point.x=origin.x+dx/len*spell.delivery!.length;point.y=origin.y+dy/len*spell.delivery!.length;
   point.height=this.host.height?.(point)??0;
  }
  const shot:SpellDelivery={sourceContext:access.actor.sourceContext,cast:p.id,ability:spell.id,rank:p.rank,source:access.actor.id,owner:access.actor.owner,target:target.id,origin,position:{...origin},point,started:this.host.tick(),nextTick:this.host.tick()+1,hit:[],power:1000};
  const delivery=spell.delivery!;
  if(delivery.kind==='swarm'){
   const rank=spell.ranks[p.rank-1],count=value(delivery.count,rank);
   // A cast group is admitted atomically; partial swarms would change authored balance.
   if(queue.length+count>512)return;
   for(let index=0;index<count;index++)queue.push({...structuredClone(shot),cast:this.host.nextCast(),target:0,swarm:{group:p.id,index,launchTick:shot.started+index*delivery.launchIntervalTicks,expires:shot.started+value(delivery.durationTicks,rank),phase:'waiting',hits:0,health:0,mana:0}});
   return;
  }
  queue.push(shot);
  const durationTicks=delivery.kind==='chain'?1:Math.max(1,Math.ceil(Math.hypot(point.x-origin.x,point.y-origin.y)*40/delivery.speed));
  this.emit(access.actor,{id:target.id,...point},p.id,p.ability,'projectile',{durationTicks,radius:delivery.kind==='line'?delivery.width:0});
 }
 private deliver(){
  const queue=this.host.deliveries?.();if(!queue)return;
  for(let i=0;i<queue.length;){
   const shot=queue[i],caster=this.host.get(shot.source)??(shot.sourceContext?this.host.restoreSource?.(shot.sourceContext):undefined)??{id:shot.source,owner:shot.owner,...shot.origin,hp:0,maxHp:0,alive:false,unit:true,blocked:true,targetable:false},spell=this.host.definition(shot.ability),d=spell?.delivery;
   if(spell&&d?.kind==='swarm'){
    const done=stepSwarm(this.host,shot,queue,caster,spell,d,(target,cargo)=>{
     this.emit(caster,target,shot.cast,spell.id,'impact',{origin:{...shot.position}});
     this.hit(caster,target,shot.cast,spell,shot.rank,shot.power,false,false,spell.onRelease,undefined,shot.position,false,cargo);
    },cargo=>{
     for(const resource of ['health','mana'] as const){
      const n=cargo[resource];if(!n)continue;
      const amount=resource==='health'?this.host.heal(caster.id,caster.id,n):this.host.effect?.(caster.id,caster.id,spell,shot.rank,shot.cast,{op:'mana',target:'caster',amount:n},false,caster.owner,caster)??0;
      this.emit(caster,caster,shot.cast,spell.id,resource==='health'?'healed':'manaRestored',{amount});
     }
     this.emit(caster,caster,shot.cast,spell.id,'returned');
    },()=>this.emit(caster,caster,shot.cast,spell.id,'projectile',{durationTicks:shot.swarm!.expires+ d.returnTimeoutTicks-this.host.tick()}));
    if(done)queue.splice(i,1);else i++;continue;
   }
   let done=!caster||caster.owner!==shot.owner||!spell||!d||this.host.tick()-shot.started>4000;
   if(!done&&caster&&spell&&d&&this.host.tick()>=shot.nextTick){
    if(d.kind==='chain'){
     const target=this.host.get(shot.target);
     if(target?.alive&&target.targetable&&matchesSpellTarget(target,spell,caster,this.host.relation(caster,target))&&acceptsSpell(target,spell,this.host.relation(caster,target))&&spell.targeting.relations.includes(this.host.relation(caster,target) as 'ally'|'enemy')){
      this.emit(caster,target,shot.cast,spell.id,'impact',{origin:{...shot.position}});
      this.hit(caster,target,shot.cast,spell,shot.rank,shot.power);
      shot.hit.push(target.id);shot.position={x:target.x,y:target.y,height:target.height??this.host.height?.(target)??0};
     }
     if(!shot.hit.includes(shot.target))shot.hit.push(shot.target);
     const next=this.candidates(caster,spell,shot.position,d.radius).filter(t=>!shot.hit.includes(t.id)&&(!d.skipFullHealth||t.hp<t.maxHp)&&this.host.visible(caster.owner,t,caster)).sort((a,b)=>(a.x-shot.position.x)**2+(a.y-shot.position.y)**2-((b.x-shot.position.x)**2+(b.y-shot.position.y)**2)||a.id-b.id)[0];
     done=!next||shot.hit.length>=value(d.bounces,spell.ranks[shot.rank-1]);
     if(!done){shot.target=next.id;shot.power=Math.floor(shot.power*d.retentionPermille/1000);shot.nextTick=this.host.tick()+d.intervalTicks;}
    }else{
     const target=d.kind==='projectile'?this.host.get(shot.target):undefined;
     if(d.kind==='projectile'&&(!target?.alive||!target.targetable||!matchesSpellTarget(target,spell,caster,this.host.relation(caster,target))||!acceptsSpell(target,spell,this.host.relation(caster,target))||!spell.targeting.relations.includes(this.host.relation(caster,target) as 'ally'|'enemy')))done=true;
     else{
      if(target)shot.point={x:target.x,y:target.y,height:target.height??this.host.height?.(target)??0};
      const before={...shot.position},dx=shot.point.x-before.x,dy=shot.point.y-before.y,distance=Math.hypot(dx,dy),step=d.speed/40;
      const t=Math.min(1,step/(distance||1));
      shot.position={x:Math.round((before.x+dx*t)*1024)/1024,y:Math.round((before.y+dy*t)*1024)/1024,height:Math.round((before.height+(shot.point.height-before.height)*t)*1024)/1024};
      if(d.kind==='projectile'&&distance<=step){this.emit(caster,target!,shot.cast,spell.id,'impact',{origin:{...shot.origin}});this.hit(caster,target!,shot.cast,spell,shot.rank);done=true;}
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
