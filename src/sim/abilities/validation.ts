import {value,type AbilityDefinition} from '../../content/abilities/schema';
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
 const p=state.pending;if(!p)return;
 const spell=definition(p.ability),binding=bindings.find(b=>b.id===p.binding);
 if(!spell||spell.activation==='passive'||!binding||binding.ability!==p.ability||!spell.ranks[p.rank-1]||p.rank!==state.ranks[p.binding]||p.owner!==access.actor.owner)return fail();
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
export function validateSpellWorld(state:import('../game/state').GameState,registry:import('../../content/registry').ContentRegistry){
 const ability=(id:string)=>registry.abilityLibrary.abilities.find(a=>a.id===id);
 const fail=()=>{throw Error('Invalid saved spell lifecycle');};
 const ids=new Set<number>();
 for(const d of state.spellDeliveries){
  const a=ability(d.ability);
  if(!a?.delivery||!a.ranks[d.rank-1]||d.cast>=state.nextCast||ids.has(d.cast)||d.started>state.tick||d.nextTick<d.started||new Set(d.hit).size!==d.hit.length)fail();
  ids.add(d.cast);
  if(a?.delivery?.kind==='chain'&&d.hit.length>value(a.delivery.bounces,a.ranks[d.rank-1]))fail();
 }
 for(const e of state.entities){
  const seen=new Set<string>();
  for(const s of e.spellStatuses??[]){
   const a=ability(s.ability),d=a&&a.onRelease.flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]).find(op=>op.op==='status'&&op.id===s.status);
   const key=s.ability+':'+s.status;
   if(!a||!a.ranks[s.rank-1]||!d||d.op!=='status'||seen.has(key)||s.started>state.tick||s.expires<=state.tick||!s.aura&&s.cast>=state.nextCast)return fail();
   seen.add(key);
   if(s.aura){if(!a.aura||a.activation!=='passive'||s.expires!==s.started+1)fail();}
   else{
    const duration=registry.get(e.definition).hero&&d.heroDuration!==undefined?value(d.heroDuration,a.ranks[s.rank-1]):value(d.amount,a.ranks[s.rank-1]);
    if(s.expires!==s.started+duration||s.nextTick<s.started||d.periodic&&(s.nextTick-s.started)%d.periodic.intervalTicks!==0)fail();
   }
  }
  if(e.summoned){
   const a=ability(e.summoned.ability);
   if(!e.unit||!a?.onRelease.some(op=>op.op==='summon'&&op.definition===e.definition)||e.summoned.expires<=state.tick&&e.hp)fail();
  }
 }
}
