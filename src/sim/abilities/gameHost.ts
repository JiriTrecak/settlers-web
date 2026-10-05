import {locomotion} from '../game/locomotion';
import {SpellWeaponCasts} from './weaponCasts';
import {SpellSplitForms} from './splitForms';
import {SpellContainments} from './containment';
import {SpellSummons} from './summons';
import {SpellCorpses} from './corpses';
import {spellSource,sourceActor} from './source';
import {damageEligibility} from './damagePolicy';
import {controlImmunities} from './controlPolicy';
import {unitNature,spellImmunity} from './eligibility';
import {SpellWorldEffects} from './worldEffects';
import {revealForAction} from './concealment';
import {SpellReactions} from './reactions';
import {SpellStatuses,spellControl,spellStatusDefinition} from './statuses';
import {AbilityRuntime,type AbilityActor,type AbilityHost} from './runtime';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import {precise} from '../game/motion';
import {isStunned} from '../game/effects';
import {heading,turnDifference} from '../game/facing';
import {TICK_MS} from '../../shared/match/match';
import type {Owner} from '../../content/schema';

export function createGameAbilities(game:Game){
 const c=game.context,statuses=new SpellStatuses(game),reactions=new SpellReactions(game);
 const weapons=new SpellWeaponCasts(game);
 game.combat.onWeaponCastRelease=(e,t,p)=>weapons.release(e,t,p);
 c.onRemoving=e=>{new SpellSplitForms(game).removing(e);new SpellContainments(game).releaseHosted(e.id);};
 game.combat.onWeaponRelease=(holder,target,weapon)=>reactions.weaponRelease(holder,target,weapon);
 game.combat.onLethal=(source,target,owner)=>reactions.kill(source,target,owner);
 const get=(id:number,resolved?:ReturnType<typeof c.stats>):AbilityActor|undefined=>{
  const e=c.get(id);if(!e)return;
  const stats=resolved??c.stats(e),definition=c.def(e);
  return {height:c.spatial.height(precise(e))+c.spatial.elevation(e),sourceContext:spellSource(c,e,stats),id:e.id,owner:e.owner,camp:e.unit?.camp??undefined,...precise(e),hp:e.hp??0,mana:e.abilities?.mana??0,maxHp:stats.maxHp,maxMana:stats.maxMana,alive:alive(e),unit:!!e.unit,locomotion:locomotion(definition),nature:unitNature(definition),hero:!!definition.hero,summoned:!!e.summoned,...(e.summoned?{summonOrigin:{source:e.summoned.source,ability:e.summoned.ability}}:{}),level:stats.level,spellImmunity:spellImmunity(e,c.registry),...damageEligibility(e,c.registry),controlImmunity:[...controlImmunities(e,c.registry)],melee:!!definition.behaviors.combat&&!definition.behaviors.combat?.projectile&&!definition.behaviors.combat?.shell,blocked:isStunned(e,c.registry)||spellControl(e,c.registry,'silence')||!!e.unit?.contained||!!e.unit?.garrison||!!e.unit?.release,targetable:!e.unit?.contained&&!e.unit?.garrison&&!e.unit?.release};
 };
 const world=new SpellWorldEffects(game);
 // Runtime actors use absolute height; terrain sight accepts a relative elevation.
 type SightTarget=Pick<AbilityActor,'id'|'x'|'y'|'surface'|'height'>;
 const sightPoint=(actor:SightTarget)=>({...actor,elevation:(actor.height??c.spatial.height(actor))-c.spatial.height(actor)});
 const visibleEntity=(owner:string,entity:Entity,caster?:AbilityActor,target?:SightTarget)=>{
  if(owner==='none'){
   const p=target??precise(entity);
   if(!caster||(caster.x-p.x)**2+(caster.y-p.y)**2>24**2)return false;
   if(!game.observation.detects(owner,entity,c.get(caster.id)))return false;
   const point=target??{id:entity.id,...p,height:c.spatial.height(p)+c.spatial.elevation(entity)};
   return c.spatial.visible(sightPoint(caster),sightPoint(point));
  }
  if(!game.observation.detects(owner as Owner,entity,caster?c.get(caster.id):undefined))return false;
  return game.observation.visible(owner as Owner,entity);
 };
 const host:AbilityHost={
  height:p=>c.spatial.height({...p,x:Math.max(0,Math.min(c.spatial.size-1,p.x)),y:Math.max(0,Math.min(c.spatial.size-1,p.y))}),
  weaponOrders:()=>c.profile.measure('Weapon cast orders',()=>weapons.tick()),weaponCastReason:(s,t,a)=>weapons.reason(s,t,a),orderWeaponCast:(...args)=>weapons.order(...args),
  heroReturns:()=>c.indexedUnits().filter(e=>e.fallen&&e.spellReturn).map(e=>({id:e.id,owner:e.owner,x:e.x,y:e.y,ability:e.spellReturn!.ability,cast:e.spellReturn!.cast,started:e.spellReturn!.started,due:e.spellReturn!.due})),
  corpses:caster=>new SpellCorpses(c).views().filter(corpse=>host.visiblePoint(caster.owner,corpse,caster)).map(corpse=>({...corpse,relation:host.relation(caster,{...caster,id:corpse.id,owner:corpse.owner,camp:corpse.camp})})),
  summon:(caster,spell,rank,cast,effect,point)=>{
   const summons=new SpellSummons(game),source={id:caster.id,owner:caster.owner as Owner,rotation:c.get(caster.id)?.rotation??0,camp:caster.camp};
   return effect.corpses?summons.fromCorpses(source,spell,rank,cast,effect,point,host.corpses!(caster)):summons.groupsAt(source,spell,rank,cast,effect,point);
  },
  revive:(caster,spell,rank,cast,effect)=>game.revival.schedule(caster.id,caster.owner as Owner,spell,rank,cast,effect),
  resurrect:(caster,spell,rank,cast,effect,point)=>new SpellCorpses(c).resurrect(effect,spell,rank,point,
   corpse=>host.visiblePoint(caster.owner,corpse,caster),
   corpse=>host.relation(caster,{...caster,id:corpse.id,owner:corpse.owner,camp:corpse.camp}),{id:caster.id,owner:caster.owner as Owner,cast}),
  restoreSource:source=>sourceActor(source,c.registry),
  weaponDeliveries:owner=>game.observation.missileRecords(owner as Owner|undefined).filter(m=>m.enhancement&&!m.resolved).map(m=>{
   const t=Math.min(1,Math.max(0,(c.state.tick-m.launched)/(m.impact-m.launched))),dx=m.destination.x-m.origin.x,dy=m.destination.y-m.origin.y,start=c.spatial.height(m.origin)+(m.origin.elevation??0),end=c.spatial.height(m.destination)+(m.destination.elevation??0),dh=end-start,n=Math.hypot(dx,dy,dh)||1;
   return {cast:m.enhancement!.cast,ability:m.enhancement!.ability,tick:c.state.tick,position:{x:m.origin.x+dx*t,y:m.origin.y+dy*t,height:start+dh*t},direction:{x:dx/n,y:dy/n,height:dh/n}};
  }),
  validateAim:(...args)=>world.validateAim(...args),
  endInstance:cast=>{for(const e of c.state.entities){if(!e.spellStatuses)continue;const before=e.spellStatuses.length;e.spellStatuses=e.spellStatuses?.filter(s=>s.cast!==cast||spellStatusDefinition(s,c.registry)?.lifetime!=='instance');if(!e.spellStatuses?.length)delete e.spellStatuses;if(before!==(e.spellStatuses?.length??0))c.clampPools(e);}},instances:()=>c.state.spellInstances,reactions:()=>c.profile.measure('Reactions',()=>reactions.resolve()),death:id=>{const e=c.get(id);if(e)reactions.death(e);},deliveries:()=>c.state.spellDeliveries,lifecycle:()=>c.profile.measure('Status lifecycle',()=>statuses.tick()),effect:(...args)=>statuses.apply(...args),hasStatus:(...args)=>statuses.has(...args),
  ambientCasters:()=>c.activeUnits().filter(e=>e.owner==='none'&&e.abilities).map(e=>e.id).sort((a,b)=>a-b),targets:()=>c.liveBodies().map(e=>e.id),
  visibleTargets:caster=>c.liveBodies().filter(e=>visibleEntity(caster.owner,e,caster)).map(e=>e.id),
  tick:()=>c.state.tick,nextCast:()=>c.state.nextCast++,casters:()=>c.profile.measure('Caster enumeration',()=>c.indexedUnits().filter(e=>e.abilities).map(e=>e.id)),get,
  caster(id){const e=c.get(id);if(!e?.abilities)return;const policy=c.def(e).behaviors.abilities!,stats=c.stats(e);return {actor:get(id,stats)!,state:e.abilities,bindings:policy.bindings,maxMana:stats.maxMana,regenPerSecond:stats.manaRegenPerSecond,cooldownReductionPermille:stats.cooldownReductionPermille};},
  casterBindings(id){const e=c.get(id);if(!e?.abilities)return;return {state:e.abilities,bindings:c.def(e).behaviors.abilities!.bindings};},
  definition:id=>c.registry.findAbility(id),
  relation(a,b){const ea=({id:a.id,owner:a.owner,...(a.camp?{unit:{camp:a.camp}}:{})} as Entity),eb=c.get(b.id)??({id:b.id,owner:b.owner,...(b.camp?{unit:{camp:b.camp}}:{})} as Entity);if(a.id===b.id||game.combat.allied(ea,eb)||(ea.owner==='none'&&eb.owner==='none'&&ea.unit?.camp&&ea.unit.camp===eb.unit?.camp))return 'ally';return game.combat.opponents(ea,eb)?'enemy':'neutral';},
  visible(owner,target,caster){
   const entity=c.get(target.id);if(!entity)return false;
   return visibleEntity(owner,entity,caster,target);
  },
  validPoint:p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<c.spatial.size&&p.y<c.spatial.size,
  exploredPoint:(owner,p)=>game.observation.explored(owner as Owner,[c.spatial.cell(p)]),
  visiblePoint(owner,p,caster){
   if(owner==='none')return !!caster&&(caster.x-p.x)**2+(caster.y-p.y)**2<=24**2&&c.spatial.visible(sightPoint(caster),p);
   return game.observation.currentlyVisible(owner as Owner,[Math.round(p.y)*c.spatial.size+Math.round(p.x)]);
  },
  viewers:()=>game.slots.map(s=>`player.${s.player+1}`),
  turnTicks(caster,target){const e=c.get(caster)!,point=typeof target==='number'?precise(c.get(target)!):target;return Math.ceil(Math.abs(turnDifference(e.rotation,heading(e,point)))/((c.def(e).behaviors.movement?.turnRate??720)*TICK_MS/1000));},
  begin(id){const e=c.get(id)!;revealForAction(e,c.registry,c.state.tick,'cast');c.clampPools(e);if(e.unit){e.unit.order=null;e.unit.target=null;e.unit.route=[];e.unit.goal=null;e.unit.idle=null;e.unit.orderQueue=[];delete e.unit.attack;delete e.unit.detour;}},
  heal(_caster,target,amount){const e=c.get(target);if(!e||!alive(e)||e.hp===null)return 0;const before=e.hp;e.hp=Math.min(c.stats(e).maxHp,e.hp+amount);return e.hp-before;},
  damage(caster,target,amount,type,owner){const result=game.combat.abilityHit({source:caster,target,damage:amount,damageType:type,owner:owner as Owner});for(const e of result.dead)game.onCombatDeath(e);return result.damage;},
 };
 return new AbilityRuntime(host,c.profile);
}
