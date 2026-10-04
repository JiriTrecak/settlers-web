import {locomotion} from '../game/locomotion';
import {entityStats} from '../game/stats';
import {matchesSpellFilter,unitNature} from './eligibility';
import {spellControl} from './statuses';
import {value,statusDefinition,type AbilityDefinition} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from '../game/state';
import {randomBelow,type RandomState} from '../game/loot';
/** Duplicate bindings/status stacks of one ability provide one modifier, at the strongest rank. */
export function combatModifiers(holder:Entity,registry:ContentRegistry,tick:number){
 type Policy=NonNullable<AbilityDefinition['combatModifiers']>;
 const entries=new Map<string,{ability:string;rank:number;policy:Policy}>();
 const add=(a:AbilityDefinition,rank:number,policy:Policy,key:string)=>{if(a.ranks[rank-1]&&rank>(entries.get(key)?.rank??0))entries.set(key,{ability:a.id,rank,policy});};
 for(const b of registry.get(holder.definition).behaviors.abilities?.bindings??[]){
  const a=registry.abilityLibrary.abilities.find(a=>a.id===b.ability),rank=holder.abilities?.ranks[b.id]??0;
  if(a?.activation==='passive'&&a.combatModifiers&&rank)add(a,rank,a.combatModifiers,a.id);
 }
 for(const s of holder.spellStatuses??[]){
  if(s.expires<=tick)continue;
  const a=registry.abilityLibrary.abilities.find(a=>a.id===s.ability),policy=a&&statusDefinition(a,s.status)?.combatModifiers;
  if(a&&policy)add(a,s.rank,policy,a.id+':'+s.status);
 }
 return [...entries.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,e])=>{
  const r=registry.abilityLibrary.abilities.find(a=>a.id===e.ability)!.ranks[e.rank-1],p=e.policy;
  return {ability:e.ability,rank:e.rank,attackBonus:p.attackBonus&&{...p.attackBonus,amount:value(p.attackBonus.amount,r),manaCost:value(p.attackBonus.manaCost,r)},critical:p.critical&&{chance:value(p.critical.chancePermille,r),multiplier:value(p.critical.multiplierPermille,r)},evasion:p.evasionPermille===undefined?0:value(p.evasionPermille,r),cleave:p.cleave&&{...p.cleave,damagePermille:value(p.cleave.damagePermille,r),radius:value(p.cleave.radius,r)}};
 });
}
export function criticalStrike(holder:Entity,registry:ContentRegistry,tick:number,random:RandomState){
 let result:{ability:string;multiplier:number}|undefined;
 for(const e of combatModifiers(holder,registry,tick))if(e.critical&&e.critical.chance>0&&(e.critical.chance===1000||randomBelow(random,1000)<e.critical.chance)&&e.critical.multiplier>(result?.multiplier??1000))result={ability:e.ability,multiplier:e.critical.multiplier};
 return result;
}
export function evadeWeapon(holder:Entity,registry:ContentRegistry,tick:number,random:RandomState){
 const best=combatModifiers(holder,registry,tick).filter(e=>e.evasion>0).sort((a,b)=>b.evasion-a.evasion)[0];
 return best&&(best.evasion===1000||randomBelow(random,1000)<best.evasion)?best.ability:undefined;
}
export function cleaveWeapon(holder:Entity,registry:ContentRegistry,tick:number){
 return combatModifiers(holder,registry,tick).filter(e=>e.cleave&&e.cleave.damagePermille>0).sort((a,b)=>b.cleave!.damagePermille-a.cleave!.damagePermille)[0];
}

export type AttackGrant={ability:string;rank:number;attackBonus:NonNullable<ReturnType<typeof combatModifiers>[number]['attackBonus']>};
/** At release, choose the strongest affordable matching grant. One payment and one saved payload. */
export function enhanceWeapon(holder:Entity,target:Entity,registry:ContentRegistry,tick:number,projectile:boolean,extra:AttackGrant[]=[],exclusive=false){
 const d=registry.get(target.definition),traits={locomotion:locomotion(d),nature:unitNature(d),hero:!!d.hero,summoned:!!target.summoned,level:entityStats(d,target,registry).level};
 const grant=[...(exclusive?[]:combatModifiers(holder,registry,tick)),...extra].filter(e=>e.attackBonus&&(e.attackBonus.amount>0||!!e.attackBonus.status)&&
  (e.attackBonus.weapon==='any'||e.attackBonus.weapon===(projectile?'projectile':'melee'))&&
  (!e.attackBonus.blockedBySilence||!spellControl(holder,registry,'silence'))&&
  matchesSpellFilter(traits,e.attackBonus.filter)&&(holder.abilities?.mana??0)>=e.attackBonus.manaCost)
  .sort((a,b)=>b.attackBonus!.amount-a.attackBonus!.amount)[0];
 if(!grant)return;
 const p=grant.attackBonus!;if(p.manaCost)holder.abilities!.mana-=p.manaCost;
 return {ability:grant.ability,rank:grant.rank,bonus:p.amount,...(p.status?{status:p.status}:{})};
}
