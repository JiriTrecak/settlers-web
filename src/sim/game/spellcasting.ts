import { areaDamageScale, stunDuration } from './damage';
import {spellAreaContains} from '../../content/spellArea';
import type {Observation} from "./observation";
import type {VisualCue} from "./visualCues";
import {isStunned} from "./effects";
import type {GameContext} from './context';
import type {Combat,DamageHit} from './combat';
import type {Entity,Point} from './state';
import {precise} from './motion';
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
 cast(e:Entity,id:string,point?:Point):string|null {
  const state=e.spellcasting,policy=this.c.def(e).behaviors.spellcasting,spell=this.c.registry.rules.spells[id];
  if(!state || !policy?.abilities.includes(id) || !spell)return 'Cannot cast this ability';
  const learned=state.learned[id]??0,rank=spell.ranks[learned-1];
  if(!rank)return 'Learn this ability first';
  if(state.pending || isStunned(e,this.c.registry))return 'Cannot cast while busy or stunned';
  if((state.cooldowns[id]??0)>this.c.state.tick)return 'Ability is cooling down';
  if(state.mana<rank.mana)return 'Not enough mana';
  if(spell.target==='point' && !point)return 'Choose a ground target';
  const target=spell.target==='self'?{x:e.x,y:e.y}:point!;
  if(distance2(precise(e),target)>rank.range**2 && spell.target==='point')return 'Target is out of range';
  state.mana-=rank.mana;state.cooldowns[id]=this.c.state.tick+rank.cooldownTicks;
  state.pending={ability:id,rank:learned,point:target,resolveTick:this.c.state.tick+rank.castTicks};
  this.cue(e,id,learned,target,"cast",rank.castTicks);
  e.unit!.order=null;e.unit!.target=null;e.unit!.route=[];e.unit!.goal=null;e.unit!.idle=null;
  if(target.x!==e.x || target.y!==e.y)e.rotation=Math.atan2(target.x-e.x,target.y-e.y)*180/Math.PI;
  return null;
 }
 private cue(caster:Entity,ability:string,rank:number,target:Point,phase:VisualCue['phase'],durationTicks:number){
  const origin={x:caster.x,y:caster.y};
  const viewers=Object.keys(this.c.state.objectives).filter(owner=>owner===caster.owner ||
    (this.vision.visible(owner as Entity['owner'],caster) && this.vision.currentlyVisible(owner as Entity['owner'],[this.c.spatial.cell(target)]))) as Entity['owner'][];
  this.c.state.visuals.push({id:this.c.state.nextVisual++,tick:this.c.state.tick,ability,rank,phase,origin,target,durationTicks,viewers});
 }
 tick(){
  this.c.state.visuals=this.c.state.visuals.filter(v=>v.tick+v.durationTicks>this.c.state.tick);
  for(const e of this.c.live()){
   if(e.effects){e.effects=e.effects.filter(b=>b.expires>this.c.state.tick);if(!e.effects.length)delete e.effects;}
   const state=e.spellcasting,policy=this.c.def(e).behaviors.spellcasting;
   if(state&&policy){
    if(isStunned(e,this.c.registry))state.pending=null;
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
   for(const target of this.c.live()){
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
