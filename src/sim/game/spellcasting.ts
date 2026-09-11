import {heading,turnDifference} from "./facing";
import {TICK_MS} from "../../shared/match/match";
import { areaDamageScale, stunDuration } from './damage';
import {spellAreaContains} from '../../content/spellArea';
import type {Observation} from "./observation";
import type {VisualCue} from "./visualCues";
import {isStunned} from "./effects";
import type {GameContext} from './context';
import type {Combat,DamageHit} from './combat';
import type {Entity,Point} from './state';
import {fixed,motionCell,precise} from './motion';
import {distance2} from './spatial';

export class Spellcasting {
 constructor(private readonly c:GameContext,private readonly combat:Combat,private readonly vision:Observation){}
 points(e:Entity){return this.c.stats(e).level-Object.values(e.spellcasting?.learned??{}).reduce((n,r)=>n+r,0);}
 learn(e:Entity,id:string):string|null {
  const state=e.spellcasting,policy=this.c.def(e).behaviors.spellcasting,spell=this.c.registry.rules.spells[id];
  if(!state || !policy?.abilities.includes(id) || !spell)return 'Cannot learn this ability';
  const rank=spell.ranks[state.learned[id]??0];
  if(!rank)return 'Ability is fully learned';
  if(this.points(e)<1)return 'No unspent skill points';
  if(this.c.stats(e).level<rank.requiredLevel)return `Requires level ${rank.requiredLevel}`;
  state.learned[id]=(state.learned[id]??0)+1;return null;
 }
 cancel(e:Entity):void {
  const state=e.spellcasting,pending=state?.pending;if(!state || !pending)return;
  const rank=this.c.registry.rules.spells[pending.ability].ranks[pending.rank-1];
  state.mana=Math.min(this.c.stats(e).maxMana,state.mana+rank.mana);
  delete state.cooldowns[pending.ability];state.pending=null;
  this.c.state.visuals=this.c.state.visuals.filter(v=>!(v.phase==='cast'&&v.ability===pending.ability&&v.origin.x===e.x&&v.origin.y===e.y));
 }
 cast(e:Entity,id:string,point?:Point):string|null {
  const state=e.spellcasting,policy=this.c.def(e).behaviors.spellcasting,spell=this.c.registry.rules.spells[id];
  if(!state || !policy?.abilities.includes(id) || !spell)return 'Cannot cast this ability';
  const learned=state.learned[id]??0,rank=spell.ranks[learned-1];
  if(!rank)return 'Learn this ability first';
  if(state.pending || isStunned(e,this.c.registry))return 'Cannot cast while busy or stunned';
  if((state.cooldowns[id]??0)>this.c.state.tick)return 'Ability is cooling down';
  if(state.mana<rank.mana)return 'Not enough mana';
  if(spell.target==='point' && !point)return 'Choose a ground target';
  const target=spell.target==='self'?{x:precise(e).x,y:precise(e).y}:point!;
  if(distance2(precise(e),target)>rank.range**2 && spell.target==='point')return 'Target is out of range';
  state.mana-=rank.mana;state.cooldowns[id]=this.c.state.tick+Math.max(1, Math.round(rank.cooldownTicks*(1000-this.c.stats(e).cooldownReductionPermille)/1000));
  const turnTicks=spell.target==='self'?0:Math.ceil(Math.abs(turnDifference(e.rotation,heading(e,target)))/((this.c.def(e).behaviors.movement?.turnRate??720)*TICK_MS/1000));
  const startTick=this.c.state.tick+turnTicks;
  state.pending={ability:id,rank:learned,point:target,startTick,resolveTick:startTick+rank.castTicks};
  if(!turnTicks)this.cue(e,id,learned,target,"cast",rank.castTicks);
  e.unit!.order=null;e.unit!.target=null;e.unit!.route=[];e.unit!.goal=null;e.unit!.idle=null;
  delete e.unit!.attack;
  delete e.unit!.detour;
  return null;
 }
 private cue(caster:Entity,ability:string,rank:number,target:Point,phase:VisualCue['phase'],durationTicks:number){
  const position=precise(caster),origin={x:position.x,y:position.y};
  const viewers=Object.keys(this.c.state.objectives).filter(owner=>owner===caster.owner ||
    (this.vision.visible(owner as Entity['owner'],caster) && this.vision.currentlyVisible(owner as Entity['owner'],[motionCell(fixed(target),this.c.spatial.size)]))) as Entity['owner'][];
  this.c.state.visuals.push({id:this.c.state.nextVisual++,tick:this.c.state.tick,ability,rank,phase,origin,target,durationTicks,viewers});
 }
 tick(){
  this.c.state.visuals=this.c.state.visuals.filter(v=>v.tick+v.durationTicks>this.c.state.tick);
  for(const e of this.c.live()){
   if(e.effects){e.effects=e.effects.filter(b=>b.expires>this.c.state.tick);if(!e.effects.length)delete e.effects;}
   const state=e.spellcasting; if (!state) continue;
   const policy=this.c.def(e).behaviors.spellcasting;
   if(state&&policy){
    if(isStunned(e,this.c.registry))state.pending=null;
    const pending=state.pending;
    if(pending?.startTick===this.c.state.tick)this.cue(e,pending.ability,pending.rank,pending.point,"cast",this.c.registry.rules.spells[pending.ability].ranks[pending.rank-1].castTicks);
   }
  }
 }
 resolve():DamageHit[]{
  const hits:DamageHit[]=[];
  for(const caster of this.c.activeUnits()){
   const state=caster.spellcasting,pending=state?.pending;
   if(!state || !pending || pending.resolveTick>this.c.state.tick)continue;
   state.pending=null;
   const spell=this.c.registry.rules.spells[pending.ability],rank=spell.ranks[pending.rank-1],origin=precise(caster);
   const targets: Entity[] = [];
   for(const target of this.c.liveBodies()){
    if(target.hp===null || target.unit?.contained || target.unit?.release)continue;
    const p=precise(target);
    let affected=false;
    if(spell.effect==='guard')affected=target.id===caster.id;
    else if(spell.effect==='rally')affected=!!target.unit && this.combat.allied(caster,target) && distance2(origin,p)<=rank.radius**2;
    else if(this.combat.hostile(caster,target)){
     affected=spellAreaContains(spell.effect,origin,pending.point,rank.radius,p);
    }
    if(affected)targets.push(target);
   }
   const eligible = targets.filter(t => this.c.registry.rules.damageMultipliers[spell.damageType][this.c.def(t).body!.armorType] > 0);
   const scale = areaDamageScale(spell.damageTargetBudget, eligible.length);
   for (const target of targets) {
    if(rank.damage && eligible.includes(target))hits.push({source:caster.id,target:target.id,damage:rank.damage*scale,damageType:spell.damageType});
    const stun = stunDuration(this.c.registry.rules, rank.stunTicks, !!target.unit, !!this.c.def(target).hero);
    if(rank.damageBonusPermille || rank.reductionPermille || stun){
     // Refresh the same spell's effect; multiple marshals cannot stack identical rally buffs.
     target.effects=(target.effects??[]).filter(b=>b.ability!==pending.ability);
     target.effects.push({ability:pending.ability,source:caster.id,expires:this.c.state.tick+(stun||rank.durationTicks),
      rank:pending.rank});
    }
   }
   this.cue(caster,pending.ability,pending.rank,pending.point,"impact",this.c.registry.rules.spellVisuals[spell.visual].durationTicks);
   this.c.event(caster.owner,spell.name);
  }
  return hits;
 }
}
