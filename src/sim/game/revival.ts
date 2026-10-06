import {workplaceHead, workplaceQueueSize} from '../../content/workplaceQueue';
import {revivalTerms} from '../../content/revival';
import type {Economy} from './economy';
import {allEffects,value,type AbilityDefinition,type Effect} from '../../content/abilities/schema';
import type {HeroReturn} from '../abilities/state';
import { colonySupply, supplyAdmission, supplyStart } from "./supply";
import type {GameContext} from './context';
import type {Entity} from './state';
/** Fallen heroes retain identity and progression in authoritative state, outside the live battlefield. */
export class Revival {
 constructor(private readonly c:GameContext,private readonly economy:Economy){}
 retain(hero:Entity){
  hero.hp=0;hero.fallen=true;hero.unit=this.c.freshUnit();hero.inventory={};delete hero.stunnedUntil;delete hero.itemStatuses;delete hero.itemHits;
  if(hero.abilities){hero.abilities.pending=null;delete hero.abilities.weaponOrder;}
  this.c.retainUnit(hero);
 }
 enqueue(building:Entity,id:number):string|null {
  const policy=this.c.def(building).behaviors.revival,hero=this.c.get(id);
  if(!policy||!building.revival||building.construction)return 'Select a completed revival building';
  if(!hero?.fallen||hero.owner!==building.owner)return 'Choose one of your fallen heroes';
  if(hero.spellReturn)return 'Hero is already returning through an ability';
  if(this.c.state.entities.some(e=>e.revival?.queue.some(q=>q.hero===id)))return 'Hero is already being revived';
  if(workplaceQueueSize(building)>=policy.queueCapacity)return 'Revival queue is full';
  const reason=supplyAdmission(colonySupply(this.c.populationCandidates(),building.owner,this.c.registry),this.c.def(hero).supplyCost!);
  if(reason)return reason;
  const level=this.c.stats(hero).level,terms=revivalTerms(policy,level),bill=Object.fromEntries(terms.items.map(p=>[p.item,p.amount]));
  const payment=this.economy.reserveCost(building.owner,bill);if(!payment)return 'Insufficient resources';
  this.economy.pay(payment);
  building.revival.queue.push({id:this.c.state.nextQueue++,hero:id,level,progress:0});return null;
 }
 cancel(building:Entity,id:number):string|null {
  const queue=building.revival?.queue,index=queue?.findIndex(q=>q.hero===id)??-1;
  if(!queue||index<0)return 'Hero is not queued here';
  const terms=revivalTerms(this.c.def(building).behaviors.revival!,queue[index].level);
  this.economy.refundCost(building,Object.fromEntries(terms.items.map(p=>[p.item,p.amount])));
  queue.splice(index,1);return null;
 }
 /** Schedule only the retained holder; identities and learned state are never cloned. */
 schedule(id:number,owner:Entity['owner'],ability:AbilityDefinition,rank:number,cast:number,op:Extract<Effect,{op:'revive'}>){
  const hero=this.c.get(id);if(!hero?.fallen||!this.c.def(hero).hero||hero.owner!==owner||hero.spellReturn||this.c.state.entities.some(e=>e.revival?.queue.some(q=>q.hero===id)))return 0;
  const delay=value(op.amount,ability.ranks[rank-1]);
  hero.spellReturn={ability:ability.id,operation:op.id,rank,cast,owner,started:this.c.state.tick,due:this.c.state.tick+delay,deadline:this.c.state.tick+delay+op.placementWaitTicks};return delay;
 }
 private returnAt(hero:Entity,location:{x:number;y:number;surface?:string},healthPermille=1000,manaPermille=1000){
  hero.x=location.x;hero.y=location.y;if(location.surface)hero.surface=location.surface;else delete hero.surface;hero.unit=this.c.freshUnit();hero.hp=Math.max(1,Math.floor(this.c.stats(hero).maxHp*healthPermille/1000));hero.regeneration={health:0,mana:0};delete hero.fallen;
  hero.readyTick=this.c.state.tick+1;
  if(hero.abilities){hero.abilities.mana=Math.floor(this.c.stats(hero).maxMana*manaPermille/1000);hero.abilities.pending=null;delete hero.abilities.weaponOrder;hero.abilities.regeneration=0;}
 }
 tick(){
  const outcomes:{hero:number;record:HeroReturn;success:boolean}[]=[];
  for(const hero of this.c.indexedUnits()){
   const record=hero.spellReturn;if(!record)continue;
   const ability=this.c.registry.abilityLibrary.abilities.find(a=>a.id===record.ability),op=ability&&allEffects(ability).find(e=>e.op==='revive'&&e.id===record.operation);
   const parameters=ability?.ranks[record.rank-1];
   if(!hero.fallen||hero.owner!==record.owner||op?.op!=='revive'||!parameters){delete hero.spellReturn;outcomes.push({hero:hero.id,record,success:false});continue;}
   if(this.c.state.tick<record.due)continue;
   const population=colonySupply(this.c.populationCandidates(),hero.owner,this.c.registry);
   const location=population.units<population.unitLimit?this.c.spatial.nearest(hero,op.placementRadius,hero.id,{definition:hero.definition}):null;
   if(location){
    this.returnAt(hero,location,value(op.healthPermille,parameters),value(op.manaPermille,parameters));delete hero.spellReturn;outcomes.push({hero:hero.id,record,success:true});this.c.spatial.rebuild();
   }else if(this.c.state.tick>=record.deadline){delete hero.spellReturn;outcomes.push({hero:hero.id,record,success:false});}
  }
  for(const building of this.c.liveBuildings()){
   const queue=building.revival?.queue,entry=queue?.[0],policy=this.c.def(building).behaviors.revival;
   if(!entry||!policy||building.construction||building.upgrade||building.production?.paused||workplaceHead(building)!=='revival'||!this.c.ready(building))continue;
   const hero=this.c.get(entry.hero);if(!hero?.fallen||hero.owner!==building.owner){this.cancel(building,entry.hero);continue;}
   const terms=revivalTerms(policy,entry.level);
   if(entry.progress===0 && supplyStart(colonySupply(this.c.populationCandidates(),building.owner,this.c.registry),this.c.def(hero).supplyCost!))continue;
   entry.progress=Math.min(terms.workTicks,entry.progress+1);if(entry.progress<terms.workTicks)continue;
   if(this.c.liveUnits().filter(e=>e.owner===building.owner).length>=this.c.registry.rules.maxUnits)continue;
   const location=this.c.spatial.nearest(this.c.spatial.entrance(building),12,hero.id,hero);if(!location)continue;
   this.returnAt(hero,location);
   for(const p of terms.items)this.c.event(building.owner,"Hero revival completed","consumed",p.item,p.amount);
   queue!.shift();this.c.event(hero.owner,`${this.c.def(hero).name} has returned`);
  }
  return outcomes;
 }
}
