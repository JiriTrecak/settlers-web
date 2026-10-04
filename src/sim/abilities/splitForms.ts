import {allEffects,referenceAtRank,value,type AbilityDefinition,type Effect} from '../../content/abilities/schema';
import type {Game} from '../game/game';
import {alive,type Entity,type Point} from '../game/state';
import {colonySupply} from '../game/supply';
import type {SplitForm} from './state';
type Split=Extract<Effect,{op:'split'}>;
/** Linked forms retain the original actor; members own ordinary unit definitions and commands. */
export class SpellSplitForms {
 constructor(private readonly game:Game){}
 private get c(){return this.game.context;}
 private plan(parent:Entity,op:Split,rank:number){
  const result:{definition:string;position:Point}[]=[];
  for(const [index,member] of op.members.entries()){
   const definition=referenceAtRank(member,rank),angle=index*Math.PI*2/op.members.length,actor={definition},radius=this.c.spatial.dimensions(actor).radius;
   const origin={x:parent.x+Math.round(Math.cos(angle)*op.radius),y:parent.y+Math.round(Math.sin(angle)*op.radius),...(parent.surface?{surface:parent.surface}:{})};
   const position=this.c.spatial.nearest(origin,op.radius,parent.id,actor,p=>result.every(other=>!this.c.spatial.sameLocomotion(actor,other)||(p.x-other.position.x)**2+(p.y-other.position.y)**2>(radius+this.c.spatial.dimensions(other).radius)**2));
   if(!position)return null;result.push({definition,position});
  }
  return result;
 }
 reason(parent:Entity,op:Split,rank:number){
  if(this.c.state.entities.some(e=>e.spellContainment?.host===parent.id))return 'Release contained units before entering a linked form';
  if(!parent.unit||!alive(parent)||parent.spellSplit||parent.summoned?.splitOperation||parent.unit.contained||parent.unit.garrison||parent.unit.release)return 'Unit cannot enter a linked form';
  const population=colonySupply(this.c.populationCandidates(),parent.owner,this.c.registry);
  if(population.units+population.queuedUnits+op.members.length>population.unitLimit)return 'Unit limit reached';
  return this.plan(parent,op,rank)?null:'Not enough clear space for every form member';
 }
 enter(parent:Entity,ability:AbilityDefinition,rank:number,cast:number,op:Split){
  if(this.reason(parent,op,rank))return 0;
  const plan=this.plan(parent,op,rank)!;const now=this.c.state.tick,expires=now+value(op.amount,ability.ranks[rank-1]);
  const members=plan.map(({definition,position})=>{const unit=this.c.create({id:'',definition,owner:parent.owner,position,rotation:parent.rotation});unit.unit!.camp=parent.unit!.camp;
   unit.summoned={source:parent.id,ability:ability.id,rank,cast,started:now,expires,splitOperation:op.id};return unit.id;});
  this.game.economy.detachUnit(parent);const u=parent.unit!;
  parent.unit={...this.c.freshUnit(),cargo:u.cargo,cooldown:u.cooldown,camp:u.camp,contained:members[0]};
  // The original inventory/progression stay on the retained actor, not on its temporary bodies.
  delete parent.spellStatuses;delete parent.itemStatuses;delete parent.stunnedUntil;
  parent.spellSplit={owner:parent.owner,camp:u.camp??undefined,ability:ability.id,operation:op.id,rank,cast,started:now,expires,members};
  this.follow(parent,this.c.get(members[0])!);this.c.clampPools(parent);this.changed(parent);
  this.game.abilities.splitEvent(parent.id,parent.spellSplit,'splitStarted',members);return members.length;
 }
 private changed(parent:Entity){this.c.spatial.updateUnitMovement(parent);this.c.motionRevision++;this.c.observationRevision++;}
 private follow(parent:Entity,anchor:Entity){parent.x=anchor.x;parent.y=anchor.y;parent.unit!.contained=anchor.id;if(anchor.surface)parent.surface=anchor.surface;else delete parent.surface;}
 private members(parent:Entity,s:SplitForm,excluding?:number){return s.members.map(id=>this.c.get(id)).filter((e):e is Entity=>!!e&&e.id!==excluding&&alive(e)&&e.owner===s.owner&&(e.unit?.camp??undefined)===s.camp&&e.summoned?.source===parent.id&&e.summoned.cast===s.cast);}
 private cleanup(parent:Entity,s:SplitForm,excluding?:number){
  delete parent.spellSplit;if(parent.unit)parent.unit.contained=null;
  for(const id of s.members){const e=this.c.get(id);if(e&&id!==excluding&&e.summoned?.source===parent.id&&e.summoned.cast===s.cast)this.game.economy.remove(e);}
 }
 private finish(parent:Entity,s:SplitForm,success:boolean,op:Split,excluding?:number){
  this.cleanup(parent,s,excluding);
  if(!success){parent.hp=0;this.game.abilities.splitEvent(parent.id,s,'splitEnded',[],false);this.game.onCombatDeath(parent);return;}
  const a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability)!,rank=a.ranks[s.rank-1];
  if(op.returnHealthPermille!==undefined)parent.hp=Math.max(1,Math.floor(this.c.stats(parent).maxHp*value(op.returnHealthPermille,rank)/1000));
  if(parent.abilities&&op.returnManaPermille!==undefined)parent.abilities.mana=Math.floor(this.c.stats(parent).maxMana*value(op.returnManaPermille,rank)/1000);
  this.c.release(parent,{x:parent.x,y:parent.y,...(parent.surface?{surface:parent.surface}:{})});this.c.clampPools(parent);this.changed(parent);this.game.abilities.splitEvent(parent.id,s,'splitEnded',[],true);
 }
 private reconcile(parent:Entity,excluding?:number){
  const s=parent.spellSplit;if(!s)return;
  const a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability),op=a&&allEffects(a).find((o):o is Split=>o.op==='split'&&o.id===s.operation);
  if(!op||!alive(parent)||parent.owner!==s.owner||(parent.unit?.camp??undefined)!==s.camp){this.cleanup(parent,s,excluding);if(alive(parent))this.c.release(parent,{x:parent.x,y:parent.y,...(parent.surface?{surface:parent.surface}:{})});this.changed(parent);return;}
  const members=this.members(parent,s,excluding);if(members[0])this.follow(parent,members[0]);
  if(!members.length||s.expires<=this.c.state.tick)this.finish(parent,s,!!members.length||op.onAllLost==='return',op,excluding);else this.changed(parent);
 }
 removing(e:Entity){
  if(e.spellSplit){const s=e.spellSplit;this.cleanup(e,s,e.id);return;}
  if(e.summoned?.splitOperation){const parent=this.c.get(e.summoned.source);if(parent?.spellSplit?.cast===e.summoned.cast)this.reconcile(parent,e.id);}
 }
 tick(){for(const parent of [...this.c.state.entities].sort((a,b)=>a.id-b.id))if(parent.spellSplit)this.reconcile(parent);}
}
