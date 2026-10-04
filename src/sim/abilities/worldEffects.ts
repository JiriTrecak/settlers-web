import {locomotion} from '../game/locomotion';
import {SpellSplitForms} from './splitForms';
import {SpellContainments} from './containment';
import {UnitOwnership} from '../game/ownership';
import {unitNature,matchesSpellFilter,operationFilter} from './eligibility';
import {matchesAbilityCondition} from '../../content/abilities/conditions';
import type {Owner} from '../../content/schema';
import {value,type AbilityDefinition,type Effect} from '../../content/abilities/schema';
import {alive,type Entity} from '../game/state';
import type {Game} from '../game/game';
import type {AbilityAim,AbilityPoint} from './runtime';
type Teleport=Extract<Effect,{op:'teleport'}>;
/** World operations reuse spatial clearance, economy detachment and observation. */
export class SpellWorldEffects {
 constructor(private readonly game:Game){}
 private get c(){return this.game.context;}
 private sacrificeReason(source:Entity,target:Entity){
  return !alive(source)||!source.unit||source.owner!==target.owner||source.owner==='none'&&(!source.unit.camp||source.unit.camp!==target.unit?.camp)||source.id===target.id||!alive(target)||!target.unit||this.c.def(target).hero||target.summoned?.splitOperation||target.unit.contained||target.unit.garrison||target.unit.release?'Sacrifice requires an owned, living non-hero unit other than the caster':null;
 }
 private landing(e:Entity,operation:Teleport,radius:number,aim:AbilityPoint,origin:AbilityPoint){
  const destination=operation.destination==='caster'?origin:aim;
  const offset=operation.preserveOffset?{x:e.x-origin.x,y:e.y-origin.y}:{x:0,y:0};
  return this.c.spatial.nearest({x:Math.round(destination.x+offset.x),y:Math.round(destination.y+offset.y),...(!this.c.spatial.airborne(e)&&destination.surface?{surface:destination.surface}:{})},radius,e.id,e);
 }
 validateAim(casterId:number,aim:AbilityAim,spell:AbilityDefinition,rank:number):string|null{
  const caster=this.c.get(casterId),point=typeof aim==='number'?this.c.get(aim):aim;if(!caster||!point)return null;
  const traits=(e:Entity)=>({hp:e.hp??0,maxHp:this.c.stats(e).maxHp,mana:e.abilities?.mana,maxMana:this.c.stats(e).maxMana,owner:e.owner,hero:!!this.c.def(e).hero,summoned:!!e.summoned,locomotion:locomotion(this.c.def(e)),nature:unitNature(this.c.def(e)),level:this.c.stats(e).level});
  // Only the first operation can be checked against the starting world. Every
  // later operation (including inside a branch) validates live state when applied;
  // earlier operations may have changed ownership, movement or placement.
  const operation=spell.onRelease[0];if(!operation)return null;
  for(const op of operation.op==='branch'?[operation.then[0],operation.else[0]]:[operation]){
   if(op.query||op.target==='point')continue;
   const target=op.target==='caster'?caster:typeof aim==='number'?this.c.get(aim):undefined;
   if(!target||!matchesSpellFilter(traits(target),operationFilter(op)))continue;
   if(operation.op==='branch'){
    const relation=caster.id===target.id||this.game.combat.allied(caster,target)?'ally':this.game.combat.opponents(caster,target)?'enemy':'neutral';
    const selected=matchesAbilityCondition(operation.condition,{relation,caster:traits(caster),target:traits(target)})?operation.then:operation.else;
    if(!selected.includes(op))continue;
   }
   if(op.op==='split'){const reason=new SpellSplitForms(this.game).reason(caster,op,rank);if(reason)return reason;}
   if(op.op==='teleport'&&op.target==='caster'&&!this.landing(caster,op,value(op.amount,spell.ranks[rank-1]),point,caster))return 'No clear arrival position';
   if(op.target!=='target')continue;
   const reason=op.op==='sacrifice'?this.sacrificeReason(caster,target):op.op==='contain'?new SpellContainments(this.game).reason(caster,target,op.capacity):op.op==='convert'?new UnitOwnership(this.game).reason(target,caster.owner,op.supply,caster.unit?.camp??undefined):null;
   if(reason)return reason;
  }
  return null;
 }
 tick(){
  this.c.profile.measure('Containment',()=>new SpellContainments(this.game).tick());
  this.c.profile.measure('Linked forms',()=>new SpellSplitForms(this.game).tick());
  this.c.state.spellVisions=this.c.state.spellVisions.filter(v=>v.expires>this.c.state.tick&&(!v.endsWithCaster||!!this.c.get(v.source)&&alive(this.c.get(v.source)!)));
 }
 apply(source:number,target:number,ability:AbilityDefinition,rank:number,cast:number,effect:Effect&{amount:number},owner:string,point:AbilityPoint,context:{aim:AbilityPoint;origin:AbilityPoint&{sourceContext?:import('./state').SpellSource}}):number{
  if(effect.op==='split'){const parent=this.c.get(source);return parent&&source===target&&parent.owner===owner?new SpellSplitForms(this.game).enter(parent,ability,rank,cast,effect):0;}
  if(effect.op==='vision'){
   if(this.c.state.spellVisions.length>=256)return 0;
   this.c.state.spellVisions.push({id:this.c.state.nextSpellVision++,cast,ability:ability.id,operation:effect.id,rank,source,owner,point:{x:point.x,y:point.y},radius:value(effect.radius,ability.ranks[rank-1]),ignoreTerrain:effect.ignoreTerrain,detectInvisible:effect.detectInvisible,endsWithCaster:effect.endsWithCaster,started:this.c.state.tick,expires:this.c.state.tick+effect.amount});
   return effect.amount;
  }
  if(effect.op==='contain'){const host=this.c.get(source),victim=this.c.get(target);return host&&host.owner===owner&&victim?new SpellContainments(this.game).hold(host,victim,ability,rank,cast,effect):0;}
  if(effect.op==='releaseContained')return new SpellContainments(this.game).releaseHosted(target);
  if(effect.op==='sacrifice'){
   const caster=this.c.get(source),victim=this.c.get(target);
   if(!caster||caster.owner!==owner||!victim||this.sacrificeReason(caster,victim))return 0;
   victim.hp=0;this.game.onCombatDeath(victim);return 1;
  }
  if(effect.op==='convert'){const e=this.c.get(target);return e&&new UnitOwnership(this.game).transfer(e,owner as Owner,effect.supply,context.origin.sourceContext?.camp)?1:0;}
  if(effect.op!=='teleport')return 0;
  const e=this.c.get(target);if(!e?.unit||!alive(e)||e.unit.contained||e.unit.garrison||e.unit.release)return 0;
  const to=this.landing(e,effect,effect.amount,context.aim,context.origin);if(!to)return 0;
  if(e.id!==source)this.game.abilities.cancel(e.id,'Displaced');
  this.game.economy.interrupt(e);
  const u=e.unit;u.route=[];u.goal=null;u.target=null;u.position=null;u.segment=null;u.idle=null;u.pendingMove=null;
  delete u.attack;delete u.pursuit;delete u.detour;delete u.lastMovedTick;
  e.x=to.x;e.y=to.y;if(to.surface)e.surface=to.surface;else delete e.surface;
  this.c.spatial.updateUnitMovement(e);
  this.c.motionRevision++;this.c.observationRevision++;
  return 1;
 }
}
