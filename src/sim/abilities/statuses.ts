import {statusDefinition,value,type AbilityDefinition,releaseEffects} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Owner} from '../../content/schema';
import {itemFlag} from '../game/itemModifiers';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import type {ItemModifiers} from '../../content/items';
import type {SpellStatus} from './state';

export function spellStatusDefinition(s:SpellStatus,registry:ContentRegistry){
 const ability=registry.abilityLibrary.abilities.find(a=>a.id===s.ability);
 return ability&&statusDefinition(ability,s.status);
}
export function spellModifiers(e:Pick<Entity,'spellStatuses'>,registry:ContentRegistry):ItemModifiers[]{
 return (e.spellStatuses??[]).flatMap(s=>{const d=spellStatusDefinition(s,registry);return d?[d.modifiers]:[];});
}
export function spellControl(e:Entity,registry:ContentRegistry,kind:'stun'|'disarm'){
 return (e.spellStatuses??[]).some(s=>spellStatusDefinition(s,registry)?.[kind]);
}
/** Status records pin declarations; modifiers are resolved by the same stat path as equipment. */
export class SpellStatuses{
 constructor(private game:Game){}
 private get c(){return this.game.context;}
 tick(){
  for(const e of [...this.c.state.entities]){
   // Auras are reconstructed every tick in stable source order, before combat/navigation.
   if(e.spellStatuses){
    e.spellStatuses=e.spellStatuses.filter(s=>!s.aura&&s.expires>=this.c.state.tick&&alive(e));
    for(const s of [...e.spellStatuses]){
     const d=spellStatusDefinition(s,this.c.registry),a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability)!;
     if(d?.periodic&&s.nextTick<=this.c.state.tick){
      s.nextTick+=d.periodic.intervalTicks;
      const result=this.game.combat.abilityHit({source:s.source,owner:s.owner as Owner,target:e.id,damage:value(d.periodic.damage,a.ranks[s.rank-1]),damageType:d.periodic.damageType});
      for(const dead of result.dead)this.game.onCombatDeath(dead);
     }
    }
    e.spellStatuses=e.spellStatuses?.filter(s=>s.expires>this.c.state.tick);
    if(!e.spellStatuses?.length)delete e.spellStatuses;
   }
   if(e.summoned&&alive(e)&&e.summoned.expires<=this.c.state.tick){e.hp=0;this.game.onCombatDeath(e);}
  }
 }
 has(target:number,ability:string){return this.c.get(target)?.spellStatuses?.some(s=>s.ability===ability)??false;}
 apply(source:number,target:number,ability:AbilityDefinition,rank:number,cast:number,effect:ReturnType<typeof releaseEffects>[number],aura=false,owner?:string):number{
  const e=this.c.get(target),caster=this.c.get(source)??(owner?{id:source,owner,rotation:0} as Entity:undefined);if(!e||!caster||!alive(e))return 0;
  const now=this.c.state.tick;
  if(effect.op==='status'){
   if((effect.stun||effect.modifiers.rooted||effect.disarm)&&this.c.registry&&this.c.def(e).kind!=='unit')return 0;
   if((effect.stun||effect.modifiers.rooted||effect.disarm)&&this.immune(e))return 0;
   const duration=this.c.def(e).hero&&effect.heroDuration!==undefined?value(effect.heroDuration,ability.ranks[rank-1]):effect.amount;
   const statuses=e.spellStatuses??=[];
   const existing=statuses.find(s=>s.ability===ability.id&&s.status===effect.id);
   // Same aura does not stack. Prefer the stronger rank, then the lower source ID.
   if(aura&&existing&&(existing.rank>rank||existing.rank===rank&&existing.source<source))return 0;
   if(existing)statuses.splice(statuses.indexOf(existing),1);
   if(statuses.length>=32)return 0;
   statuses.push({owner:caster.owner,ability:ability.id,status:effect.id,source,rank,cast,started:now,expires:now+(aura?1:duration),nextTick:now+(effect.periodic?.intervalTicks??duration),aura});
   if(effect.stun)this.game.abilities.cancel(e.id,'Stunned');
   if(effect.stun||effect.disarm){if(e.unit)delete e.unit.attack;}
   return duration;
  }
  if(effect.op==='dispel'){
   let removed=0;
   e.spellStatuses=e.spellStatuses?.filter(s=>{const d=spellStatusDefinition(s,this.c.registry);const remove=!s.aura&&d?.dispel&&(effect.polarity==='all'||d.polarity===effect.polarity);if(remove)removed++;return !remove;});
   if(!e.spellStatuses?.length)delete e.spellStatuses;
   if(e.summoned&&this.game.combat.hostile(caster,e)){
    const result=this.game.combat.abilityHit({source,target,damage:effect.amount,damageType:effect.damageType});for(const dead of result.dead)this.game.onCombatDeath(dead);
   }
   return removed;
  }
  if(effect.op==='summon'){
   if(effect.replace)for(const unit of this.c.liveUnits())if(unit.summoned?.source===source&&unit.summoned.ability===ability.id){unit.hp=0;this.game.onCombatDeath(unit);}
   const definition=this.c.registry.get(effect.definition);
   let count=0;
   for(let i=0;i<effect.amount;i++){
    const angle=i*2*Math.PI/effect.amount;
    const position=this.c.spatial.nearest({x:Math.round(e.x+Math.cos(angle)*effect.radius),y:Math.round(e.y+Math.sin(angle)*effect.radius)},effect.radius,undefined,{definition:definition.id});
    if(!position)continue;
    const unit=this.c.create({id:'',definition:effect.definition,owner:caster.owner,position,rotation:caster.rotation});
    unit.summoned={source,ability:ability.id,expires:now+effect.durationTicks};count++;
   }
   return count;
  }
  return 0;
 }
 private immune(e:Entity){
  return itemFlag(e,this.c.registry,'controlImmune');
 }
}
