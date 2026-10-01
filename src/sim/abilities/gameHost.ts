import {SpellStatuses} from './statuses';
import {AbilityRuntime,type AbilityActor,type AbilityHost} from './runtime';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import {precise} from '../game/motion';
import {isStunned} from '../game/effects';
import {heading,turnDifference} from '../game/facing';
import {TICK_MS} from '../../shared/match/match';
import type {Owner} from '../../content/schema';

export function createGameAbilities(game:Game){
 const c=game.context,statuses=new SpellStatuses(game);
 const get=(id:number):AbilityActor|undefined=>{
  const e=c.get(id);if(!e)return;
  return {id:e.id,owner:e.owner,...precise(e),hp:e.hp??0,maxHp:c.stats(e).maxHp,alive:alive(e),unit:!!e.unit,hero:!!c.def(e).hero,melee:!!c.def(e).behaviors.combat&&!c.def(e).behaviors.combat?.projectile&&!c.def(e).behaviors.combat?.shell,blocked:isStunned(e,c.registry)||!!e.unit?.contained||!!e.unit?.garrison||!!e.unit?.release,targetable:!e.unit?.contained&&!e.unit?.garrison&&!e.unit?.release};
 };
 const host:AbilityHost={
  deliveries:()=>c.state.spellDeliveries,lifecycle:()=>statuses.tick(),effect:(...args)=>statuses.apply(...args),hasStatus:(...args)=>statuses.has(...args),
  ambientCasters:()=>c.activeUnits().filter(e=>e.owner==='none'&&e.abilities).map(e=>e.id).sort((a,b)=>a-b),targets:()=>c.liveBodies().map(e=>e.id),
  tick:()=>c.state.tick,nextCast:()=>c.state.nextCast++,casters:()=>c.state.entities.filter(e=>e.abilities).map(e=>e.id),get,
  caster(id){const e=c.get(id);if(!e?.abilities)return;const policy=c.def(e).behaviors.abilities!;return {actor:get(id)!,state:e.abilities,bindings:policy.bindings,maxMana:c.stats(e).maxMana,regenPerSecond:c.stats(e).manaRegenPerSecond,cooldownReductionPermille:c.stats(e).cooldownReductionPermille};},
  definition:id=>c.registry.abilityLibrary.abilities.find(a=>a.id===id),
  relation(a,b){const ea=c.get(a.id)??({id:a.id,owner:a.owner} as Entity),eb=c.get(b.id)!;if(a.id===b.id||game.combat.allied(ea,eb)||(ea.owner==='none'&&eb.owner==='none'&&ea.unit?.camp&&ea.unit.camp===eb.unit?.camp))return 'ally';return game.combat.hostile(ea,eb)?'enemy':'neutral';},
  visible(owner,target,caster){
   const entity=c.get(target.id);if(!entity)return false;
   if(owner==='none')return !!caster&&c.spatial.visible(caster,target)&&(caster.x-target.x)**2+(caster.y-target.y)**2<=24**2;
   return game.observation.visible(owner as Owner,entity);
  },
  validPoint:p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<c.spatial.size&&p.y<c.spatial.size,
  visiblePoint(owner,p,caster){
   if(owner==='none')return !!caster&&c.spatial.visible(caster,p)&&(caster.x-p.x)**2+(caster.y-p.y)**2<=24**2;
   return game.observation.currentlyVisible(owner as Owner,[Math.round(p.y)*c.spatial.size+Math.round(p.x)]);
  },
  viewers:()=>game.slots.map(s=>`player.${s.player+1}`),
  turnTicks(caster,target){const e=c.get(caster)!,point=typeof target==='number'?precise(c.get(target)!):target;return Math.ceil(Math.abs(turnDifference(e.rotation,heading(e,point)))/((c.def(e).behaviors.movement?.turnRate??720)*TICK_MS/1000));},
  begin(id){const e=c.get(id)!;if(e.unit){e.unit.order=null;e.unit.target=null;e.unit.route=[];e.unit.goal=null;e.unit.idle=null;e.unit.orderQueue=[];delete e.unit.attack;delete e.unit.detour;}},
  heal(_caster,target,amount){const e=c.get(target);if(!e||!alive(e)||e.hp===null)return 0;const before=e.hp;e.hp=Math.min(c.stats(e).maxHp,e.hp+amount);return e.hp-before;},
  damage(caster,target,amount,type,owner){const result=game.combat.abilityHit({source:caster,target,damage:amount,damageType:type,owner:owner as Owner});for(const e of result.dead)game.onCombatDeath(e);return result.damage;},
 };
 return new AbilityRuntime(host);
}
