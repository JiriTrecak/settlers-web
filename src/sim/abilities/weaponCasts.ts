import {finishCombat} from '../game/combatIntent';
import {weaponTargets} from '../game/locomotion';
import {value,type AbilityDefinition} from '../../content/abilities/schema';
import {enhanceWeapon,type AttackGrant} from './combatModifiers';
import {spellControl} from './statuses';
import {isEthereal,weaponCanTarget} from './damagePolicy';
import {spellSource} from './source';
import type {Game} from '../game/game';
import type {Entity} from '../game/state';
import type {WeaponEnhancement} from '../game/missileState';
/** Cast commands select one weapon release. Autocast decorates existing attacks and never issues orders. */
export class SpellWeaponCasts {
 constructor(private readonly game:Game){}
 private get c(){return this.game.context;}
 reason(source:number,target:number,spell:AbilityDefinition):string|null{
  const e=this.c.get(source),t=this.c.get(target),combat=e&&this.c.def(e).behaviors.combat,w=spell.weaponCast;
  if(!e?.unit||!t||!w||!combat||combat.shell||e.unit.contained||e.unit.garrison||e.unit.release)return 'This unit cannot use that weapon ability';
  if(w.weapon!=='any'&&w.weapon!==(combat.projectile?'projectile':'melee'))return 'Ability requires a different weapon kind';
  if(!weaponTargets(combat,this.c.def(t))||spellControl(e,this.c.registry,'disarm')||isEthereal(e,this.c.registry)||!weaponCanTarget(t,this.c.registry,combat.damageType))return 'Weapon cannot attack this target';
  if(e.unit.cargo)return 'Return carried resources before using this weapon ability';
  return null;
 }
 order(source:number,target:number,spell:AbilityDefinition,binding:string,rank:number,cast:number){
  const e=this.c.get(source)!;
  this.game.orders.issue(e,{type:'attack',target,force:false});
  e.abilities!.weaponOrder={id:cast,binding,ability:spell.id,rank,target,owner:e.owner,profile:this.c.weaponDefinition(e),started:this.c.state.tick};
 }
 private cancel(e:Entity,reason:string){
  const target=e.abilities?.weaponOrder?.target;
  this.game.abilities.cancel(e.id,reason);
  // Do not erase a replacement order installed by another system.
  const u=e.unit;if(u?.order?.type==='attack'&&u.order.target===target){finishCombat(u,this.c.state.tick);}
 }
 tick(){
  for(const e of this.c.indexedUnits()){
   const order=e.abilities?.weaponOrder;if(!order)continue;
   const u=e.unit,b=this.c.def(e).behaviors.abilities?.bindings.find(b=>b.id===order.binding);
   const invalid=!u||e.owner!==order.owner||this.c.weaponDefinition(e)!==order.profile||u.order?.type!=='attack'||u.order.target!==order.target||!b||e.abilities!.ranks[order.binding]!==order.rank;
   const reason=invalid?'Weapon order interrupted':this.game.abilities.reason(e.id,order.binding,order.target,b!.controls[0]);
   if(reason)this.cancel(e,reason);
  }
 }
 private grant(a:AbilityDefinition,rank:number):AttackGrant{
  const w=a.weaponCast!,r=a.ranks[rank-1];
  return {ability:a.id,rank,attackBonus:{amount:value(w.bonus,r),manaCost:value(a.cast.cost.amount,r),weapon:w.weapon,blockedBySilence:true,...(w.status?{status:w.status}:{})}};
 }
 /** false cancels a failed manual release; undefined means an ordinary unenhanced shot. */
 release(e:Entity,target:Entity,projectile:boolean):WeaponEnhancement|false|undefined{
  const order=e.abilities?.weaponOrder,extras:AttackGrant[]=[];
  const bindings=this.c.def(e).behaviors.abilities?.bindings??[];
  for(const b of bindings){
   const a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===b.ability),rank=e.abilities?.ranks[b.id]??0;
   if(!a?.weaponCast||!rank)continue;
   if(order?order.binding!==b.id:!b.controls.includes('ai')||!a.autocast||!(e.abilities?.autocast?.[b.id]??a.autocast.enabledByDefault))continue;
   if(!this.game.abilities.reason(e.id,b.id,target.id,order?b.controls[0]:'ai'))extras.push(this.grant(a,rank));
  }
  if(order&&(target.id!==order.target||!extras.length)){this.cancel(e,'Weapon ability could not release');return false;}
  const grant=enhanceWeapon(e,target,this.c.registry,this.c.state.tick,projectile,extras,!!order);
  if(!grant)return;
  const spell=this.c.registry.abilityLibrary.abilities.find(a=>a.id===grant.ability)!;
  const cast=order?.id??this.c.state.nextCast++;
  if(spell.weaponCast){
   e.abilities!.cooldowns[spell.id]=this.c.state.tick+Math.round(value(spell.cast.cooldown.ticks,spell.ranks[grant.rank-1])*(1000-this.c.stats(e).cooldownReductionPermille)/1000);
   delete e.abilities!.weaponOrder;
   this.game.abilities.weaponEvent(e.id,target.id,spell.id,cast,'released',grant.bonus);
   this.game.abilities.weaponEvent(e.id,target.id,spell.id,cast,'finished',grant.bonus);
  }
  return {...grant,cast,...(grant.status?{sourceContext:spellSource(this.c,e)}:{})};
 }
}
