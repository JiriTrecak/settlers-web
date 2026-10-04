import {UNTIL_DEATH} from './state';
import {alive} from '../game/state';
import {value,type AbilityDefinition,releaseEffects} from '../../content/abilities/schema';
import type {Owner} from '../../content/schema';
import type {Game} from '../game/game';
import {colonySupply} from '../game/supply';
import {SpellCorpses,selectCorpses,type CorpseView} from './corpses';

type Summon=Extract<ReturnType<typeof releaseEffects>[number],{op:'summon'}>;
type Point={x:number;y:number};
type Source={id:number;owner:Owner;rotation:number;camp?:string};
/** One spawn path for ordinary summons and groups paid for with corpses. */
export class SpellSummons {
 constructor(private readonly game:Game){}
 private get c(){return this.game.context;}
 /** Resolve the entire dependency closure before removing anything; entity order cannot delay a child. */
 tick(){
  const units=this.c.liveUnits().filter(e=>e.summoned),children=new Map<number,number[]>(),doomed=new Set<number>(),queue:number[]=[];
  const mark=(id:number)=>{if(!doomed.has(id)){doomed.add(id);queue.push(id);}};
  for(const e of units){const s=e.summoned!;
   if(!s.splitOperation&&s.expires<=this.c.state.tick)mark(e.id);
   if(s.sourceLink){const list=children.get(s.source)??[];list.push(e.id);children.set(s.source,list);const source=this.c.get(s.source);
    if(!source||!alive(source)||source.owner!==s.sourceLink.owner||source.owner==='none'&&(source.unit?.camp??undefined)!==s.sourceLink.camp)mark(e.id);
   }
  }
  for(let i=0;i<queue.length;i++)for(const child of children.get(queue[i])??[])mark(child);
  for(const id of [...doomed].sort((a,b)=>a-b)){const e=this.c.get(id);if(e&&alive(e)){e.hp=0;this.game.onCombatDeath(e);}}
 }

 at(source:Source,ability:AbilityDefinition,rank:number,cast:number,effect:Summon,point:Point){
  return this.groupsAt(source,ability,rank,cast,effect,point).reduce((sum,r)=>sum+r.amount,0);
 }
 groupsAt(source:Source,ability:AbilityDefinition,rank:number,cast:number,effect:Summon,point:Point){return this.create(source,ability,rank,cast,effect,[{point}],1);}
 fromCorpses(source:Source,ability:AbilityDefinition,rank:number,cast:number,effect:Summon,point:Point,visible:readonly CorpseView[]){
  if(!effect.corpses)return [];
  const candidates=selectCorpses(visible,{corpses:effect.corpses},ability.ranks[rank-1],point,c=>c.relation??'neutral');
  return this.create(source,ability,rank,cast,effect,candidates.map(c=>({point:c,corpse:c.id})),value(effect.corpses.maxTargets,ability.ranks[rank-1]));
 }
 private create(source:Source,ability:AbilityDefinition,rank:number,cast:number,effect:Summon,centers:readonly {point:Point;corpse?:number}[],limit:number){
  const parent=this.c.get(source.id);
  if(effect.endsWithCaster&&(!parent||!alive(parent)||parent.owner!==source.owner||source.owner==='none'&&(parent.unit?.camp??undefined)!==source.camp))return [];
  const results:{point:Point;amount:number;units:{id:number;x:number;y:number}[]}[]=[],store=new SpellCorpses(this.c),definition=this.c.registry.get(effect.definition);
  // Replacement is committed only when a new unit can actually be placed. A failed cast leaves the old group intact.
  let replaced=false;
  const existing=this.c.liveUnits().filter(e=>e.owner===source.owner&&e.summoned?.source===source.id&&e.summoned.ability===ability.id);
  const previous=effect.replace?existing:[];let retained=effect.replace?0:existing.length;
  for(const center of centers){
   if(results.length>=limit)break;
   if(center.corpse!==undefined&&!this.c.state.corpses.some(c=>c.id===center.corpse&&c.expires>this.c.state.tick))continue;
   let count=0;const units:{id:number;x:number;y:number}[]=[];
   for(let i=0;i<effect.amount;i++){
    if(effect.maxActive!==undefined&&retained>=effect.maxActive)break;
    const population=colonySupply(this.c.populationCandidates(),source.owner,this.c.registry);
    const replaceable=!replaced?previous.filter(e=>e.owner===source.owner&&e.hp!>0).length:0;
    if(population.units+population.queuedUnits-replaceable>=population.unitLimit)break;
    const angle=i*2*Math.PI/effect.amount;
    const position=this.c.spatial.nearest({x:Math.round(center.point.x+Math.cos(angle)*effect.radius),y:Math.round(center.point.y+Math.sin(angle)*effect.radius)},effect.radius,undefined,{definition:definition.id});
    if(!position)continue;
    if(!replaced){for(const unit of previous){unit.hp=0;this.game.onCombatDeath(unit);}replaced=true;}
    const unit=this.c.create({id:'',definition:definition.id,owner:source.owner,position,rotation:source.rotation});
    if(source.owner==='none'&&source.camp&&unit.unit)unit.unit.camp=source.camp;
    unit.summoned={source:source.id,ability:ability.id,rank,cast,started:this.c.state.tick,expires:effect.durationTicks===undefined?UNTIL_DEATH:this.c.state.tick+effect.durationTicks,...(effect.endsWithCaster?{sourceLink:{owner:source.owner,...(source.camp?{camp:source.camp}:{})}}:{})};count++;retained++;units.push({id:unit.id,x:unit.x,y:unit.y});
   }
   if(count){if(center.corpse!==undefined)store.consume(center.corpse);results.push({point:center.point,amount:count,units});}
  }
  return results;
 }
}
