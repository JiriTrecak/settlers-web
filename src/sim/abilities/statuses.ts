import {locomotion} from '../game/locomotion';
import {SpellSummons} from './summons';
import {SpellCorpses} from './corpses';
import {isEthereal} from './damagePolicy';
import {controlImmunities,blockedStatusControls,statusModifiersRaw,statusControls,statusHasPayload} from './controlPolicy';
import {unitNature,acceptsSpell,spellImmunity,matchesSpellFilter,operationFilter} from './eligibility';
import {SpellWorldEffects} from './worldEffects';
import {value,type AbilityDefinition,releaseEffects} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Owner} from '../../content/schema';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import type {ItemModifiers} from '../../content/items';
import {UNTIL_DEATH,type SpellStatus,type SpellSource} from './state';
import {spellSource} from './source';

export function spellStatusDefinition(s:SpellStatus,registry:ContentRegistry){
 return registry.findStatus(s.ability,s.status);
}
export function spellModifiers(e:Pick<Entity,'equipment'|'itemStatuses'|'spellStatuses'>,registry:ContentRegistry):ItemModifiers[]{
 if(!e.spellStatuses?.length)return [];
 const immune=controlImmunities(e,registry);
 return (e.spellStatuses??[]).flatMap(s=>{
  const d=spellStatusDefinition(s,registry),a=registry.findAbility(s.ability);if(!d||!a)return [];
  const m=statusModifiersRaw(d,a,s.rank),blocked=blockedStatusControls(s,immune);
  if(blocked.has('root'))delete m.rooted;
  if(blocked.has('moveSlow')&&(m.moveSpeedPermille??0)<0)delete m.moveSpeedPermille;
  if(blocked.has('attackSlow')&&(m.attackSpeedPermille??0)<0)delete m.attackSpeedPermille;
  return [m];
 });
}
export function spellControl(e:Entity,registry:ContentRegistry,kind:'stun'|'disarm'|'silence'|'itemBlocked'){
 if(!e.spellStatuses?.length)return false;
 if(controlImmunities(e,registry).has(kind))return false;
 return (e.spellStatuses??[]).some(s=>!s.blockedControls?.includes(kind)&&spellStatusDefinition(s,registry)?.[kind]);
}
/** Status records pin declarations; modifiers are resolved by the same stat path as equipment. */
export class SpellStatuses{
 private world:SpellWorldEffects;
 constructor(private game:Game){this.world=new SpellWorldEffects(game);}
 private get c(){return this.game.context;}
 tick(){
  this.c.profile.measure('World effects',()=>this.world.tick());
  this.c.profile.measure('Corpse expiry',()=>new SpellCorpses(this.c).tick());
  this.c.profile.measure('Summon lifetimes',()=>new SpellSummons(this.game).tick());
  // Keep callbacks out of the world scan: capturing e in the filters below
  // gives every iteration a closure scope, even scenery without any statuses.
  for(const e of this.c.entitySnapshot())if(e.spellStatuses)this.tickEntity(e);
 }
 private tickEntity(e:Entity){
  // Auras are reconstructed every tick in stable source order, before combat/navigation.
  e.spellStatuses=e.spellStatuses!.filter(s=>!s.aura&&s.expires>=this.c.state.tick&&alive(e));
  for(const s of [...e.spellStatuses]){
   const d=spellStatusDefinition(s,this.c.registry),a=this.c.registry.findAbility(s.ability)!;
   if(d?.periodic&&s.nextTick<=this.c.state.tick){
    s.nextTick+=d.periodic.intervalTicks;
    if(!this.accepts(e,a,s.source,s.owner,s.sourceContext))continue;
    const result=this.game.combat.abilityHit({source:s.source,owner:s.owner as Owner,target:e.id,damage:value(d.periodic.damage,a.ranks[s.rank-1]),damageType:d.periodic.damageType});
    for(const dead of result.dead)this.game.onCombatDeath(dead);
   }
  }
  e.spellStatuses=e.spellStatuses?.filter(s=>s.expires>this.c.state.tick);
  if(!e.spellStatuses?.length)delete e.spellStatuses;
 }

 has(target:number,ability:string){return this.c.get(target)?.spellStatuses?.some(s=>s.ability===ability)??false;}
 apply(source:number,target:number,ability:AbilityDefinition,rank:number,cast:number,effect:ReturnType<typeof releaseEffects>[number],aura=false,owner?:string,point?:{x:number;y:number},context?:{aim:{x:number;y:number};origin:{x:number;y:number;sourceContext?:SpellSource};creationGrant?:boolean}):number{
  const e=this.c.get(target),caster=this.c.get(source)??(owner?{id:source,owner,rotation:0} as Entity:undefined);if(!caster)return 0;
  const now=this.c.state.tick,resolvedOwner=(owner??caster.owner) as Owner;
  // Creation grants initialize the new unit; an earlier grant must not block its siblings.
  if(e&&(!(context?.creationGrant&&effect.op==='status')&&!this.accepts(e,ability,source,resolvedOwner,context?.origin.sourceContext)||!matchesSpellFilter({owner:e.owner,locomotion:locomotion(this.c.def(e)),nature:unitNature(this.c.def(e)),hero:!!this.c.def(e).hero,summoned:!!e.summoned,level:this.c.stats(e).level},operationFilter(effect))))return 0;
  if((effect.op==='split'||effect.op==='teleport'||effect.op==='vision'||effect.op==='convert'||effect.op==='contain'||effect.op==='releaseContained'||effect.op==='sacrifice')&&point&&context)return this.world.apply(source,target,ability,rank,cast,effect,resolvedOwner,point,context);
  if(effect.op==='summon'){
   const center=point??e;if(!center||effect.corpses)return 0;
   return new SpellSummons(this.game).at({id:source,owner:resolvedOwner,rotation:caster.rotation,camp:context?.origin.sourceContext?.camp??caster.unit?.camp??undefined},ability,rank,cast,effect,center);
  }
  if(!e||!alive(e))return 0;
  if(effect.op==='mana'){
   if(!e.abilities)return 0;const before=e.abilities.mana;
   e.abilities.mana=Math.min(Math.max(0,this.c.stats(e).maxMana-(e.abilities.pending?.escrow??0)),before+effect.amount);return e.abilities.mana-before;
  }
  if(effect.op==='drain'){
   let actual=0;
   if(effect.resource==='health'){
    const result=this.game.combat.abilityHit({source,target,damage:effect.amount,damageType:effect.damageType,owner:resolvedOwner});actual=result.damage;
    for(const dead of result.dead)this.game.onCombatDeath(dead);
   }else if(e.abilities){actual=Math.min(e.abilities.mana,effect.amount);e.abilities.mana-=actual;}
   if(effect.restoreCaster&&alive(caster)&&caster.owner===resolvedOwner){
    if(effect.resource==='health')caster.hp=Math.min(this.c.stats(caster).maxHp,(caster.hp??0)+actual);
    else if(caster.abilities)caster.abilities.mana=Math.min(Math.max(0,this.c.stats(caster).maxMana-(caster.abilities.pending?.escrow??0)),caster.abilities.mana+actual);
   }
   if(effect.resource==='mana'&&effect.damagePerDrainedPermille&&actual){
    const result=this.game.combat.abilityHit({source,target,damage:Math.floor(actual*effect.damagePerDrainedPermille/1000),damageType:effect.damageType,owner:resolvedOwner});for(const dead of result.dead)this.game.onCombatDeath(dead);
   }
   return actual;
  }
  if(effect.op==='status'){
   if(effect.form?.movement&&(!this.c.def(e).behaviors.movement||e.unit?.garrison||e.unit?.contained||e.unit?.release))return 0;
   if((effect.concealment||effect.form||effect.ethereal)&&!e.unit)return 0;
   if((effect.stun||effect.modifiers.rooted||effect.disarm||effect.silence||effect.itemBlocked)&&this.c.registry&&this.c.def(e).kind!=='unit')return 0;
   const blocked=statusControls(effect,ability,rank).filter(k=>controlImmunities(e,this.c.registry).has(k));
   if(blocked.length&&!statusHasPayload(effect,ability,rank,new Set(blocked)))return 0;
   const duration=effect.lifetime==='untilDeath'?UNTIL_DEATH-now:this.c.def(e).hero&&effect.heroDuration!==undefined?value(effect.heroDuration,ability.ranks[rank-1]):effect.amount;
   const needsSource=ability.triggers?.some(t=>t.event==='death'&&t.executor==='statusSource'&&t.whileStatus===effect.id);
   const sourceContext=needsSource?(context?.origin.sourceContext??(this.c.get(source)?spellSource(this.c,this.c.get(source)!):undefined)):undefined;
   if(needsSource&&(!sourceContext||sourceContext.owner!==resolvedOwner))return 0;
   const statuses=e.spellStatuses??=[];
   const existing=statuses.find(s=>s.ability===ability.id&&s.status===effect.id);
   // Same aura does not stack. Prefer the stronger rank, then the lower source ID.
   if(aura&&existing&&(existing.rank>rank||existing.rank===rank&&existing.source<source))return 0;
   if(existing)statuses.splice(statuses.indexOf(existing),1);
   if(statuses.length>=32)return 0;

   statuses.push({...(sourceContext?{sourceContext}:{}),owner:resolvedOwner,ability:ability.id,status:effect.id,source,rank,cast,started:now,expires:now+(aura?1:duration),nextTick:now+(effect.periodic?.intervalTicks??duration),...(blocked.length?{blockedControls:blocked}:{}),...(effect.shield!==undefined?{shield:value(effect.shield,ability.ranks[rank-1])}:{}),aura});
   const stun=spellControl(e,this.c.registry,'stun'),silence=spellControl(e,this.c.registry,'silence'),disarm=spellControl(e,this.c.registry,'disarm')||isEthereal(e,this.c.registry);
   if(stun||silence)this.game.abilities.cancel(e.id,stun?'Stunned':'Silenced');
   if(stun||disarm){if(e.unit)delete e.unit.attack;}
   if(!aura)this.c.clampPools(e);
   return duration;
  }
  if(effect.op==='dispel'){
   let removed=0;
   e.spellStatuses=e.spellStatuses?.filter(s=>{const d=spellStatusDefinition(s,this.c.registry);const remove=!s.aura&&d?.dispel&&(effect.polarity==='all'||d.polarity===effect.polarity);if(remove)removed++;return !remove;});
   if(!e.spellStatuses?.length)delete e.spellStatuses;
   this.c.clampPools(e);
   if(e.summoned&&this.game.combat.hostile({...caster,owner:resolvedOwner},e)){
    const result=this.game.combat.abilityHit({source,target,owner:resolvedOwner,damage:effect.amount,damageType:effect.damageType});for(const dead of result.dead)this.game.onCombatDeath(dead);
   }
   return removed;
  }

  return 0;
 }
 private accepts(e:Entity,ability:AbilityDefinition,source:number,owner:string,origin?:SpellSource){
  const live=this.c.get(source),caster=live?{...live,owner:owner as Owner}:{id:source,owner,...(origin?.camp?{unit:{camp:origin.camp}}:{})} as Entity;
  return acceptsSpell({spellImmunity:spellImmunity(e,this.c.registry,this.c.state.tick)},ability,this.game.combat.hostile(caster,e)?'enemy':'ally');
 }
}

/** All damage sources use this after armor and before health loss. */
export function spellAbsorb(e:Entity,registry:ContentRegistry,damage:number,type:string){
 const statuses=e.spellStatuses??[];
 if(statuses.some(s=>{const d=spellStatusDefinition(s,registry);return d?.immunity===(type==='spell'?'spell':'physical');}))return 0;
 for(const s of statuses){const shield=spellStatusDefinition(s,registry)?.manaShield;
  if(shield&&e.abilities){const absorbed=Math.min(Math.floor(damage*shield.absorbPermille/1000),Math.floor(e.abilities.mana*shield.damagePerMana));e.abilities.mana-=Math.ceil(absorbed/shield.damagePerMana);damage-=absorbed;}
 }
 for(const s of statuses)if(s.shield){const n=Math.min(damage,s.shield);s.shield-=n;damage-=n;}
 // Exhaustion is explicit: a compound ward may retain armor or reactions after its pool empties.
 // Remove after all pools process this hit so remaining shields still absorb overflow in order.
 if(statuses.some(s=>s.shield===0&&spellStatusDefinition(s,registry)?.onShieldDepleted==='remove')){
  e.spellStatuses=statuses.filter(s=>s.shield!==0||spellStatusDefinition(s,registry)?.onShieldDepleted!=='remove');
  if(!e.spellStatuses.length)delete e.spellStatuses;
 }
 return damage;
}
export function wakeOnDamage(e:Entity,registry:ContentRegistry,damage:number){
 if(damage<=0||!e.spellStatuses)return;
 e.spellStatuses=e.spellStatuses.filter(s=>!spellStatusDefinition(s,registry)?.breakOnDamage);
 if(!e.spellStatuses.length)delete e.spellStatuses;
}
