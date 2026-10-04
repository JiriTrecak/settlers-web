import {locomotion} from '../game/locomotion';
import {CORPSE_TICKS} from './corpses';
import {unitNature,matchesSpellFilter} from './eligibility';
import {entityStats} from '../game/stats';
import {UNTIL_DEATH,type SpellSource} from './state';
import {statusControls} from './controlPolicy';
import {value,referenceAtRank,allEffects,type AbilityDefinition} from '../../content/abilities/schema';
import type {CasterAccess} from './runtime';
/** Validate before assigning any saved records, so rejected saves leave the live world intact. */
export function validateAbilityState(access:CasterAccess,definition:(id:string)=>AbilityDefinition|undefined,tick:number,mapSize=4096){
 const fail=()=>{throw Error(`Invalid ability state on ${access.actor.id}`);};
 const {state,bindings}=access;
 if(state.mana+(state.pending?.escrow??0)>access.maxMana)fail();
 if(Object.keys(state.ranks).length!==bindings.length)fail();
 for(const binding of bindings){const rank=state.ranks[binding.id];if(rank===undefined||rank<binding.initialRank||(!binding.learning&&rank!==binding.initialRank)||(!definition(binding.ability)?.ranks[rank-1]&&rank!==0))fail();}
 for(const key of Object.keys(state.cooldowns))if(!bindings.some(b=>b.ability===key))fail();
 for(const key of Object.keys(state.autocast??{}))if(!bindings.some(b=>b.id===key&&definition(b.ability)?.autocast))fail();
 const w=state.weaponOrder;
 if(w){const a=definition(w.ability),b=bindings.find(b=>b.id===w.binding);if(state.pending||!a?.weaponCast||!b||b.ability!==w.ability||state.ranks[w.binding]!==w.rank||!a.ranks[w.rank-1]||w.owner!==access.actor.owner||w.started>tick)fail();}
 const p=state.pending;if(!p)return;
 const spell=definition(p.ability),binding=bindings.find(b=>b.id===p.binding);
 if(!spell||spell.activation==='passive'||spell.weaponCast||!binding||binding.ability!==p.ability||!spell.ranks[p.rank-1]||p.rank!==state.ranks[p.binding]||p.owner!==access.actor.owner)return fail();
 const rank=spell.ranks[p.rank-1],channel=spell.cast.channel,duration=channel?value(channel.waves,rank)*value(channel.intervalTicks,rank):0;
 if(p.point&&(p.point.x>=mapSize||p.point.y>=mapSize))fail();
 if((spell.targeting.kind==='point')!==!!p.point||(p.point?p.target!==0:p.target<=0))fail();
 if(!!channel!==!!p.channel)fail();
 if(p.releaseTick!==p.startTick+spell.cast.prepareTicks||p.finishTick!==p.releaseTick+duration+spell.cast.recoverTicks||(p.cooldownTicks>value(spell.cast.cooldown.ticks,spell.ranks[p.rank-1])||p.cooldownTicks<Math.round(value(spell.cast.cooldown.ticks,spell.ranks[p.rank-1])*.6)))fail();
 if(p.phase==='preparing'&&(p.escrow!==value(spell.cast.cost.amount,spell.ranks[p.rank-1])||p.releaseTick<tick))fail();
 if(p.channel&&channel){
  const waves=value(channel.waves,rank),interval=value(channel.intervalTicks,rank),c=p.channel;
  if(c.endTick!==p.releaseTick+duration||c.wave>waves||c.nextWaveTick!==p.releaseTick+Math.min(c.wave+1,waves)*interval)fail();
  if(p.phase==='preparing'&&c.wave!==0)fail();
  if(p.phase==='channeling'&&(p.escrow!==0||p.releaseTick>tick||c.wave>=waves||c.wave!==Math.floor((tick-p.releaseTick)/interval)||c.nextWaveTick<=tick))fail();
  if(p.phase==='recovering'&&c.wave!==waves)fail();
 }else if(p.phase==='channeling')fail();
 if(p.phase==='recovering'&&(p.escrow!==0||p.releaseTick>tick||p.finishTick<=tick))fail();
}

/** Validate references and clocks for durable work, not just a caster's current animation. */
export function validateSpellWorld(state:import('../game/state').GameState,registry:import('../../content/registry').ContentRegistry,mapSize=4096,camps:readonly {id:string}[]=[]){
 const ability=(id:string)=>registry.abilityLibrary.abilities.find(a=>a.id===id);
 const fail=()=>{throw Error('Invalid saved spell lifecycle');};
 const validSource=(s:SpellSource,source=s.source,owner=s.owner)=>{if(!s.resources||s.source!==source||s.owner!==owner||s.source>=state.nextId||!registry.find(s.definition)?.body||s.position.x>=mapSize||s.position.y>=mapSize)fail();};
 const needsSource=(a:AbilityDefinition|undefined)=>!!a&&(a.triggers?.some(t=>t.executor==='statusSource')||allEffects(a).some(e=>'scale' in e&&e.scale?.source==='caster'));
 for(const missile of state.missiles){
  const p=missile.enhancement;if(!p)continue;
  const a=ability(p.ability),r=a?.ranks[p.rank-1];
  const policies=a?[...(a.weaponCast?[{attackBonus:{amount:a.weaponCast.bonus,status:a.weaponCast.status}}]:[]),a.combatModifiers,...allEffects(a).flatMap(e=>e.op==='status'?[e.combatModifiers]:[])]:[];
  if(!a||!r||p.cast>=state.nextCast||!policies.some(m=>m?.attackBonus&&value(m.attackBonus.amount,r)===p.bonus&&m.attackBonus.status===p.status))throw Error('Invalid saved weapon enhancement');
  if(!!p.status!==!!p.sourceContext)fail();if(p.sourceContext)validSource(p.sourceContext,missile.source,missile.owner);
 }
 const corpseIds=new Set<number>();
 for(const corpse of state.corpses){
  const d=registry.find(corpse.definition);
  if(corpse.camp&&!camps.some(c=>c.id===corpse.camp))fail();
  if(!d||d.kind!=='unit'||!d.body||d.hero||unitNature(d)==='mechanical'||corpseIds.has(corpse.id)||corpse.id>=state.nextId||state.entities.some(e=>e.id===corpse.id)||corpse.died>state.tick||corpse.expires!==corpse.died+CORPSE_TICKS||corpse.expires<=state.tick||corpse.position.x>=mapSize||corpse.position.y>=mapSize||!!corpse.progression!==!!d.behaviors.progression||!!corpse.abilities!==!!d.behaviors.abilities)fail();
  corpseIds.add(corpse.id);
  if(corpse.abilities&&d?.behaviors.abilities){
   if(corpse.abilities.weaponOrder||corpse.abilities.pending||corpse.abilities.mana||corpse.abilities.regeneration)fail();
   const bindings=d.behaviors.abilities.bindings,ranks=corpse.abilities.ranks;
   if(Object.keys(ranks).length!==bindings.length||bindings.some(b=>ranks[b.id]===undefined||ranks[b.id]!==0&&!ability(b.ability)?.ranks[ranks[b.id]-1])||Object.keys(corpse.abilities.cooldowns).some(id=>!bindings.some(b=>b.ability===id))||Object.keys(corpse.abilities.autocast??{}).some(id=>!bindings.some(b=>b.id===id&&ability(b.ability)?.autocast)))fail();
  }
 }
 const ids=new Set<number>(),swarmIndices=new Set<string>();
 const swarmGroups=new Map<number,{ability:string;rank:number;source:number;owner:string;started:number}>();
 for(const d of state.spellDeliveries){
  const a=ability(d.ability);
  if(!a?.delivery||!a.ranks[d.rank-1]||d.cast>=state.nextCast||ids.has(d.cast)||d.started>state.tick||d.nextTick<d.started||new Set(d.hit).size!==d.hit.length)fail();
  if(needsSource(a)&&!d.sourceContext)fail();if(d.sourceContext)validSource(d.sourceContext,d.source,d.owner);
  ids.add(d.cast);
  if((a?.delivery?.kind==='swarm')!==!!d.swarm)fail();
  if(d.swarm&&a?.delivery?.kind==='swarm'){
   const s=d.swarm,p=a.delivery,r=a.ranks[d.rank-1],key=`${s.group}:${s.index}`,group=swarmGroups.get(s.group);
   if(!d.sourceContext||s.group>=d.cast||s.group>=state.nextCast||s.index>=value(p.count,r)||swarmIndices.has(key)||s.launchTick!==d.started+s.index*p.launchIntervalTicks||s.expires!==d.started+value(p.durationTicks,r)||s.expires+p.returnTimeoutTicks<=state.tick||s.hits>p.maxHitsPerTrip||d.hit.length||d.power!==1000||d.nextTick>state.tick+p.attackIntervalTicks||s.phase==='waiting'&&(s.launchTick<state.tick||s.hits||s.health||s.mana||d.target)||s.phase!=='waiting'&&s.launchTick>state.tick||s.phase==='returning'&&d.target||s.phase!=='returning'&&state.tick>=s.expires)fail();
   if(group&&(group.ability!==d.ability||group.rank!==d.rank||group.source!==d.source||group.owner!==d.owner||group.started!==d.started))fail();
   swarmIndices.add(key);swarmGroups.set(s.group,d);
  }
  if(a?.delivery?.kind==='chain'&&d.hit.length>value(a.delivery.bounces,a.ranks[d.rank-1]))fail();
 }
 for(const group of swarmGroups.keys())if(ids.has(group))fail();
 for(const instance of state.spellInstances){
  const a=ability(instance.ability),p=a?.persistent,r=a?.ranks[instance.rank-1];
  if(!a||!p||!r||instance.cast>=state.nextCast||ids.has(instance.cast)||instance.started>state.tick||instance.expires<=state.tick||instance.expires!==instance.started+value(p.durationTicks,r)||instance.nextTick<=state.tick||(instance.nextTick-instance.started)%value(p.intervalTicks,r)!==0)fail();
  if(needsSource(a)&&!instance.sourceContext)fail();if(instance.sourceContext)validSource(instance.sourceContext,instance.source,instance.owner);
  ids.add(instance.cast);
 }
 const visionIds=new Set<number>();
 for(const v of state.spellVisions){
  const a=ability(v.ability),r=a?.ranks[v.rank-1],op=a&&allEffects(a).find(e=>e.op==='vision'&&e.id===v.operation);
  if(!a||!r||!op||op.op!=='vision'||visionIds.has(v.id)||v.id>=state.nextSpellVision||v.cast>=state.nextCast||v.started>state.tick||v.expires<=state.tick||v.expires!==v.started+value(op.amount,r)||v.radius!==value(op.radius,r)||v.ignoreTerrain!==op.ignoreTerrain||v.detectInvisible!==op.detectInvisible||v.endsWithCaster!==op.endsWithCaster||v.point.x<0||v.point.y<0||v.point.x>=mapSize||v.point.y>=mapSize)fail();
  visionIds.add(v.id);
 }
 for(const reaction of state.spellLifecycleReactions){
  const a=ability(reaction.ability),trigger=a?.triggers?.find(t=>t.id===reaction.trigger),d=registry.find(reaction.definition);
  if(!a?.ranks[reaction.rank-1]||trigger?.event!==reaction.event||!d?.body||reaction.cast>=state.nextCast||ids.has(reaction.cast)||reaction.source>=state.nextId||reaction.subject.id>=state.nextId||reaction.subject.x>=mapSize||reaction.subject.y>=mapSize||reaction.event==='death'&&!trigger?.executor&&reaction.subject.id!==reaction.source||reaction.tick>state.tick||reaction.position.x>=mapSize||reaction.position.y>=mapSize)fail();
  if((reaction.event==='weaponRelease')!==!!reaction.weapon||trigger?.weapon&&trigger.weapon!==reaction.weapon)fail();
  if(reaction.event==='interval'?(reaction.timerStarted===undefined||reaction.timerStarted>=reaction.tick||reaction.subject.id!==reaction.source||!!trigger?.whileStatus!==!!reaction.timerGrant||reaction.timerGrant!==undefined&&reaction.timerGrant>=state.nextCast):reaction.timerGrant!==undefined||reaction.timerStarted!==undefined)fail();
  validSource(reaction);
  ids.add(reaction.cast);
 }
 const reanimatedIds=new Set<number>();
 for(const e of state.entities){
  const order=e.abilities?.weaponOrder;
  if(order&&(!e.unit||e.fallen||order.id>=state.nextCast||order.target>=state.nextId||!registry.find(order.profile)?.behaviors.combat))fail();
  for(const [key,record] of Object.entries(e.spellTriggerCooldowns??{})){
   const split=key.lastIndexOf(':'),a=ability(key.slice(0,split)),trigger=a?.triggers?.find(t=>t.id===key.slice(split+1)),rank=a?.ranks[record.rank-1];
   if(!a||!rank||trigger?.cooldownTicks===undefined||record.started>state.tick||record.expires!==record.started+value(trigger.cooldownTicks,rank))fail();
  }
  for(const [key,record] of Object.entries(e.spellTriggerTimers??{})){
   const split=key.lastIndexOf(':'),a=ability(key.slice(0,split)),trigger=a?.triggers?.find(t=>t.id===key.slice(split+1)),rank=a?.ranks[record.rank-1],period=trigger?.intervalTicks!==undefined&&rank?value(trigger.intervalTicks,rank):0;
   if(!a||!rank||trigger?.event!=='interval'||period<1||record.started>state.tick||record.nextTick<=record.started||(record.nextTick-record.started)%period!==0||record.nextTick>state.tick+period||!!trigger.whileStatus!==!!record.grant||record.grant!==undefined&&record.grant>=state.nextCast)fail();
  }
  if(e.unit?.contained&&state.entities.find(h=>h.id===e.unit!.contained)?.unit&&!e.spellContainment&&!e.spellSplit)fail();
  if(e.spellSplit){
   const s=e.spellSplit,a=ability(s.ability),r=a?.ranks[s.rank-1],op=a&&allEffects(a).find(o=>o.op==='split'&&o.id===s.operation),u=e.unit;
   if(!a||!r||op?.op!=='split'||!u||!e.hp||e.fallen||e.spellContainment||e.summoned?.splitOperation||e.owner!==s.owner||(u.camp??undefined)!==s.camp||s.cast>=state.nextCast||s.started>state.tick||s.expires<=state.tick||s.expires!==s.started+value(op.amount,r)||s.members.length!==op.members.length||s.members.some(id=>id<=e.id||id>=state.nextId)||u.release||u.garrison||u.job||u.employment||u.order||u.orderQueue?.length||u.route.length||u.segment||u.position||u.goal!==null||u.target!==null)fail();
   const living=s.members.map(id=>state.entities.find(m=>m.id===id)).filter(m=>m?.hp);
   if(!living.length||u!.contained!==living[0]!.id)fail();
   for(const [i,id] of s.members.entries()){
    const m=state.entities.find(m=>m.id===id),t=m?.summoned;if(!m)continue;
    if(!m.hp||!m.unit||m.unit.contained||m.unit.garrison||m.owner!==s.owner||(m.unit.camp??undefined)!==s.camp||!t||t.source!==e.id||t.ability!==s.ability||t.rank!==s.rank||t.cast!==s.cast||t.started!==s.started||t.expires!==s.expires||t.splitOperation!==s.operation||op?.op==='split'&&m.definition!==referenceAtRank(op.members[i],s.rank))fail();
   }
  }
  if(e.spellContainment){
   const s=e.spellContainment,a=ability(s.ability),r=a?.ranks[s.rank-1],op=a&&allEffects(a).find(o=>o.op==='contain'&&o.id===s.operation),host=state.entities.find(h=>h.id===s.host),u=e.unit;
   if(!a||!r||op?.op!=='contain'||!u||!e.hp||registry.get(e.definition).hero||!host?.unit||!host.hp||host.owner!==s.owner||host.id===e.id||host.unit.contained||host.unit.release||host.unit.garrison||s.host!==u.contained||u.release||u.garrison||u.job||u.employment||u.order||u.orderQueue?.length||u.route.length||u.segment||u.position||u.goal!==null||u.target!==null||s.cast>=state.nextCast||s.started>state.tick||s.expires<=state.tick)fail();
   if(op?.op==='contain'&&r){
    if(s.expires!==(op.lifetime==='untilDeath'?UNTIL_DEATH:s.started+value(op.amount,r))||s.nextTick<=state.tick||s.nextTick!==(op.digestion?s.started+(Math.floor((state.tick-s.started)/op.digestion.intervalTicks)+1)*op.digestion.intervalTicks:s.expires)||state.entities.filter(v=>v.spellContainment?.host===s.host).length>op.capacity)fail();
   }
  }
  if(e.spellReturn){
   const s=e.spellReturn,a=ability(s.ability),r=a?.ranks[s.rank-1],op=a&&allEffects(a).find(op=>op.op==='revive'&&op.id===s.operation);
   if(!e.fallen||!registry.get(e.definition).hero||s.owner!==e.owner||!a||!r||op?.op!=='revive'||s.cast>=state.nextCast||s.started>state.tick||s.due!==s.started+value(op.amount,r)||s.deadline!==s.due+op.placementWaitTicks||s.deadline<state.tick)fail();
  }
  const seen=new Set<string>();
  for(const s of e.spellStatuses??[]){
   const a=ability(s.ability),d=a&&allEffects(a).find(op=>op.op==='status'&&op.id===s.status);
   const key=s.ability+':'+s.status;
   if(!a||!a.ranks[s.rank-1]||!d||d.op!=='status'||seen.has(key)||s.started>state.tick||s.expires<=state.tick||!s.aura&&s.cast>=state.nextCast)return fail();
   const requiresSource=a.triggers?.some(t=>t.executor==='statusSource'&&t.whileStatus===s.status);
   if(!!s.sourceContext!==!!requiresSource)fail();if(s.sourceContext)validSource(s.sourceContext,s.source,s.owner);
   seen.add(key);
   if(s.blockedControls?.some(k=>!statusControls(d,a,s.rank).includes(k)))fail();
   if(s.shield!==undefined&&(d.shield===undefined||s.shield>value(d.shield,a.ranks[s.rank-1])))fail();
   if(d.shield!==undefined&&s.shield===undefined||d.onShieldDepleted==='remove'&&s.shield===0)fail();
   if(s.aura){if(!a.aura||a.activation!=='passive'||s.expires!==s.started+1)fail();}
   else{
    const duration=d.lifetime==='untilDeath'?UNTIL_DEATH-s.started:registry.get(e.definition).hero&&d.heroDuration!==undefined?value(d.heroDuration,a.ranks[s.rank-1]):value(d.amount,a.ranks[s.rank-1]);
    if(s.expires!==s.started+duration||s.nextTick<s.started||d.periodic&&(s.nextTick-s.started)%d.periodic.intervalTicks!==0)fail();
   }
  }
  if(e.summoned){
   const s=e.summoned,a=ability(s.ability),r=a?.ranks[s.rank-1];
   if(!e.unit||!a||!r||s.source>=state.nextId||s.cast>=state.nextCast||s.started>state.tick||!allEffects(a).some(op=>s.splitOperation!==undefined?op.op==='split'&&op.id===s.splitOperation&&!s.sourceLink&&s.reanimatedFrom===undefined&&s.expires===s.started+value(op.amount,r)&&state.entities.some(parent=>parent.id===s.source&&parent.spellSplit?.cast===s.cast&&parent.spellSplit.members.includes(e.id)):s.reanimatedFrom===undefined?op.op==='summon'&&referenceAtRank(op.definition,s.rank)===e.definition&&s.expires===(op.durationTicks===undefined?UNTIL_DEATH:s.started+value(op.durationTicks,r))&&!!s.sourceLink===!!op.endsWithCaster:op.op==='resurrect'&&!s.sourceLink&&op.durationTicks!==undefined&&s.expires===s.started+value(op.durationTicks,r))||s.expires<=state.tick&&e.hp)fail();
   if(s.sourceLink&&(s.source>=e.id||s.sourceLink.camp&&(s.sourceLink.owner!=='none'||!camps.some(c=>c.id===s.sourceLink!.camp))))fail();
   if(s.reanimatedFrom!==undefined){
    const d=registry.get(e.definition),level=entityStats(d,{progression:e.progression},registry).level;
    if(d.hero||unitNature(d)==='mechanical'||s.reanimatedFrom>=e.id||corpseIds.has(s.reanimatedFrom)||state.entities.some(other=>other.id===s.reanimatedFrom)||reanimatedIds.has(s.reanimatedFrom)||!allEffects(a!).some(op=>op.op==='resurrect'&&op.durationTicks!==undefined&&s.expires===s.started+value(op.durationTicks,r!)&&matchesSpellFilter({hero:false,summoned:false,locomotion:locomotion(d),nature:unitNature(d),level},op.corpses.filter)))fail();
    reanimatedIds.add(s.reanimatedFrom);
   }
  }
 }
}
