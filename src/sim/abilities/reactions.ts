import {locomotion} from '../game/locomotion';
import {spellControl} from './statuses';
import {spellSource,sourceActor} from './source';
import type {SpellSource} from './state';
import {value,type AbilityDefinition} from '../../content/abilities/schema';
import {unitNature,matchesSpellFilter} from './eligibility';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import {precise} from '../game/motion';
import {randomBelow} from '../game/loot';

export type SpellCombatEvent={source:number;target:number;damage:number;weapon:boolean;melee:boolean};
type Entry={ability:AbilityDefinition;rank:number;status?:string;started?:number;grant?:number;sourceContext?:SpellSource};
type Trigger=NonNullable<AbilityDefinition['triggers']>[number];
/** Ordinary hit procs cannot recursively proc; lifecycle reactions use a durable bounded FIFO. */
export class SpellReactions {
 constructor(private readonly game:Game){}
 resolve(){
  const events=this.game.combat.spellEvents.splice(0);
  for(const event of events){
   if(event.damage<=0)continue;
   const c=this.game.context,source=c.get(event.source),target=c.get(event.target);
   if(source&&alive(source)&&event.weapon)this.run(source,event.target,'weaponHit');
   if(target&&alive(target)){
    this.run(target,event.source,'damaged');
    if(event.weapon&&event.melee)this.run(target,event.source,'meleeDamaged');
   }
  }
  this.game.context.profile.measure('Interval triggers',()=>this.intervals());
  // New deaths may append here. Carry the remainder to the next tick rather than recurse.
  const c=this.game.context,queue=c.state.spellLifecycleReactions;
  for(let i=0;i<128&&queue.length;i++){
   const record=queue.shift()!,a=c.registry.abilityLibrary.abilities.find(a=>a.id===record.ability),trigger=a?.triggers?.find(t=>t.id===record.trigger&&t.event===record.event);
   if(!a||!trigger)continue;
   if(record.event==='interval'){
    const holder=c.get(record.source);
    if(!holder||!alive(holder)||holder.owner!==record.owner||holder.spellTriggerTimers?.[a.id+':'+trigger.id]?.started!==record.timerStarted||holder.unit?.contained||holder.unit?.garrison||holder.unit?.release||!this.entries(holder).some(e=>e.ability.id===a.id&&e.rank===record.rank&&e.status===trigger.whileStatus&&e.grant===record.timerGrant))continue;
   }
   const caster=sourceActor(record,c.registry);
   this.game.combat.suppressSpellReactions++;
   try{this.game.abilities.invokeLifecycle(caster,record.subject,record.event,record.cast,a,record.rank,trigger.operations,record.viewers);}
   finally{this.game.combat.suppressSpellReactions--;}
  }
 }
 /** Fixed cadence, no catch-up bursts. Unavailable actors skip pulses without pausing the clock. */
 private intervals(){
  const c=this.game.context;
  // Resources without ability/status state cannot own interval triggers. Filter
  // before sorting and allocating timer sets; retained timers still get cleanup.
  for(const holder of c.state.entities.filter(e=>e.abilities||e.spellStatuses||e.spellTriggerTimers).sort((a,b)=>a.id-b.id)){
   const wanted=new Set<string>();
   for(const entry of alive(holder)?this.entries(holder):[])for(const trigger of entry.ability.triggers??[]){
    if(trigger.event!=='interval'||trigger.whileStatus!==entry.status)continue;
    const key=entry.ability.id+':'+trigger.id,period=value(trigger.intervalTicks!,entry.ability.ranks[entry.rank-1]);wanted.add(key);
    const timers=holder.spellTriggerTimers??={};let timer=timers[key];
    if(!timer||timer.rank!==entry.rank||timer.grant!==entry.grant||timer.owner!==holder.owner||entry.started!==undefined&&timer.started!==entry.started){
     if(!timer&&Object.keys(timers).length>=128)continue;
     const started=entry.started??c.state.tick;
     timer=timers[key]={rank:entry.rank,owner:holder.owner,started,nextTick:started+period,...(entry.grant?{grant:entry.grant}:{})};
    }
    if(timer.nextTick>c.state.tick)continue;
    timer.nextTick+= (Math.floor((c.state.tick-timer.nextTick)/period)+1)*period;
    if(holder.unit?.contained||holder.unit?.garrison||holder.unit?.release||trigger.blockedBySilence&&spellControl(holder,c.registry,'silence')||c.state.spellLifecycleReactions.length>=512||!this.qualifies(holder,entry,trigger))continue;
    this.enqueue(holder,holder,entry,trigger,'interval',undefined,undefined,timer.started);
   }
   for(const key of Object.keys(holder.spellTriggerTimers??{}))if(!wanted.has(key))delete holder.spellTriggerTimers![key];
   if(!Object.keys(holder.spellTriggerTimers??{}).length)delete holder.spellTriggerTimers;
  }
 }
 /** Queue before status cleanup and entity removal. No model or live entity reference is retained. */
 death(holder:Entity){
  const c=this.game.context,queue=c.state.spellLifecycleReactions;
  for(const entry of this.entries(holder))for(const trigger of entry.ability.triggers??[]){
   if(trigger.event!=='death'||trigger.whileStatus!==entry.status||queue.length>=512||!this.qualifies(holder,entry,trigger))continue;
   const source=trigger.executor==='statusSource'?entry.sourceContext:undefined;
   if(trigger.executor==='statusSource'&&!source)continue;
   const live=source&&c.get(source.source),origin=source?(live&&live.owner===source.owner?spellSource(c,live):source):undefined;
   this.enqueue(holder,holder,entry,trigger,'death',origin);
  }
 }
 /** Credit the hit that exhausted remaining HP, never later overkill or forced cleanup. */
 kill(source:number,subject:Entity,owner?:Entity['owner']){
  const c=this.game.context,holder=c.get(source);
  if(!holder||!alive(holder)||owner!==undefined&&holder.owner!==owner||!this.game.combat.hostile(holder,{...subject,hp:1}))return;
  const traits={locomotion:locomotion(c.def(subject)),nature:unitNature(c.def(subject)),hero:!!c.def(subject).hero,summoned:!!subject.summoned,level:c.stats(subject).level};
  for(const entry of this.entries(holder))for(const trigger of entry.ability.triggers??[]){
   if(trigger.event!=='kill'||!subject.unit&&!trigger.includeBuildings||trigger.whileStatus!==entry.status||!matchesSpellFilter(traits,trigger.filter)||c.state.spellLifecycleReactions.length>=512||!this.qualifies(holder,entry,trigger))continue;
   this.enqueue(holder,subject,entry,trigger,'kill');
  }
 }
 /** Capture policy before attack-triggered statuses are removed. Never mutate HP in the weapon batch. */
 weaponRelease(holder:Entity,subject:Entity,weapon:'melee'|'projectile'|'siege'){
  const c=this.game.context;
  if(this.game.combat.suppressSpellReactions||!alive(holder)||!this.game.combat.hostile(holder,subject))return;
  const traits={locomotion:locomotion(c.def(subject)),nature:unitNature(c.def(subject)),hero:!!c.def(subject).hero,summoned:!!subject.summoned,level:c.stats(subject).level};
  for(const entry of this.entries(holder))for(const trigger of entry.ability.triggers??[]){
   if(trigger.event!=='weaponRelease'||trigger.whileStatus!==entry.status||trigger.weapon&&trigger.weapon!==weapon||!subject.unit&&!trigger.includeBuildings||!matchesSpellFilter(traits,trigger.filter)||trigger.blockedBySilence&&spellControl(holder,c.registry,'silence')||c.state.spellLifecycleReactions.length>=512||!this.qualifies(holder,entry,trigger))continue;
   this.enqueue(holder,subject,entry,trigger,'weaponRelease',undefined,weapon);
  }
 }
 private enqueue(holder:Entity,subject:Entity,entry:Entry,trigger:Trigger,event:'interval'|'death'|'kill'|'weaponRelease',sourceContext?:SpellSource,weapon?:'melee'|'projectile'|'siege',timerStarted?:number){
  const c=this.game.context;
  const p=precise(subject);
  c.state.spellLifecycleReactions.push({event,...(event==='interval'?{timerStarted,...(entry.grant?{timerGrant:entry.grant}:{})}:{}),...(weapon?{weapon}:{}),subject:{id:subject.id,x:p.x,y:p.y},cast:c.state.nextCast++,...(sourceContext??spellSource(c,holder)),ability:entry.ability.id,rank:entry.rank,trigger:trigger.id,tick:c.state.tick,viewers:this.game.slots.map(s=>`player.${s.player+1}`).filter(owner=>this.game.observation.visible(owner as Entity['owner'],subject)&&(sourceContext||this.game.observation.visible(owner as Entity['owner'],holder)))});
 }
 private entries(holder:Entity):Entry[]{
  const c=this.game.context,entries:Entry[]=[];
  for(const b of c.def(holder).behaviors.abilities?.bindings??[]){
   const a=c.registry.abilityLibrary.abilities.find(a=>a.id===b.ability),rank=holder.abilities?.ranks[b.id]??0;
   if(a?.activation==='passive'&&rank){const existing=entries.find(e=>e.ability.id===a.id&&!e.status);if(existing)existing.rank=Math.max(existing.rank,rank);else entries.push({ability:a,rank});}
  }
  for(const s of holder.spellStatuses??[]){
   if(s.expires<=c.state.tick)continue;
   const a=c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability);
   if(a)entries.push({ability:a,rank:s.rank,status:s.status,started:s.started,grant:s.cast,sourceContext:s.sourceContext});
  }
  return entries.sort((a,b)=>(a.ability.id<b.ability.id?-1:a.ability.id>b.ability.id?1:0)||((a.status??'')<(b.status??'')?-1:(a.status??'')>(b.status??'')?1:0));
 }
 private qualifies(holder:Entity,entry:Entry,trigger:Trigger){
  const c=this.game.context,key=entry.ability.id+':'+trigger.id,counters=holder.spellCounters??={};
  if((holder.spellTriggerCooldowns?.[key]?.expires??0)>c.state.tick)return false;
  if(trigger.cooldownTicks!==undefined&&!(key in (holder.spellTriggerCooldowns??{}))&&Object.keys(holder.spellTriggerCooldowns??{}).length>=128)return false;
  if(!(key in counters)&&Object.keys(counters).length>=128)return false;
  counters[key]=((counters[key]??0)+1)%trigger.every;
  if(counters[key]||trigger.chancePermille<1000&&randomBelow(c.state,1000)>=trigger.chancePermille)return false;
  const cost=value(trigger.manaCost,entry.ability.ranks[entry.rank-1]);
  if((holder.abilities?.mana??0)<cost)return false;
  if(cost)holder.abilities!.mana-=cost;
  if(trigger.cooldownTicks!==undefined){const duration=value(trigger.cooldownTicks,entry.ability.ranks[entry.rank-1]);if(duration)(holder.spellTriggerCooldowns??={})[key]={rank:entry.rank,started:c.state.tick,expires:c.state.tick+duration};}
  return true;
 }
 private run(holder:Entity,other:number,event:'weaponHit'|'damaged'|'meleeDamaged'){
  for(const entry of this.entries(holder))for(const trigger of entry.ability.triggers??[]){
   if(trigger.event!==event||trigger.whileStatus!==entry.status||!this.qualifies(holder,entry,trigger))continue;
   this.game.combat.suppressSpellReactions++;
   try{this.game.abilities.invoke(holder.id,other,entry.ability,entry.rank,trigger.operations);}
   finally{this.game.combat.suppressSpellReactions--;}
  }
 }
}
