import {locomotion} from '../game/locomotion';
import type {GameContext} from '../game/context';
import type {Corpse,Entity} from '../game/state';
import {alive} from '../game/state';
import {entityStats} from '../game/stats';
import {precise} from '../game/motion';
import {value,type AbilityDefinition,type Effect} from '../../content/abilities/schema';
import {colonySupply,supplyAdmission} from '../game/supply';
import {unitNature,matchesSpellFilter} from './eligibility';
/** Deterministic retention budget shared by future corpse consumers and resurrection. */
export const CORPSE_TICKS=2400;
export const MAX_CORPSES=512;
export class SpellCorpses {
 constructor(private readonly c:GameContext){}
 tick(){this.c.state.corpses=this.c.state.corpses.filter(c=>c.expires>this.c.state.tick);}
 capture(e:Entity){
  const d=this.c.def(e);
  if(alive(e)||!e.unit||d.hero||e.summoned||unitNature(d)==='mechanical'||e.unit.contained||e.unit.garrison||e.unit.release||this.c.state.corpses.some(c=>c.id===e.id))return;
  const p=precise(e),position={x:Math.max(0,Math.min(this.c.spatial.size-1,Math.round(p.x))),y:Math.max(0,Math.min(this.c.spatial.size-1,Math.round(p.y))),...(e.surface?{surface:e.surface}:{})};
  const corpse:Corpse={id:e.id,definition:e.definition,owner:e.owner,position,rotation:e.rotation,died:this.c.state.tick,expires:this.c.state.tick+CORPSE_TICKS,...(e.unit.camp?{camp:e.unit.camp}:{}),
   ...(e.progression?{progression:structuredClone(e.progression)}:{}),
   ...(e.abilities?{abilities:{...structuredClone(e.abilities),mana:0,regeneration:0,pending:null}}:{}),
  };
  if(corpse.abilities)delete corpse.abilities.weaponOrder;
  this.tick();this.c.state.corpses.push(corpse);
  this.c.state.corpses.sort((a,b)=>a.died-b.died||a.id-b.id);
  if(this.c.state.corpses.length>MAX_CORPSES)this.c.state.corpses.splice(0,this.c.state.corpses.length-MAX_CORPSES);
 }
 views():CorpseView[]{return this.c.state.corpses.filter(e=>e.expires>this.c.state.tick).map(e=>{const d=this.c.registry.get(e.definition),stats=entityStats(d,e,this.c.registry);return {id:e.id,definition:e.definition,owner:e.owner,camp:e.camp,...e.position,rotation:e.rotation,level:stats.level,maxHp:stats.maxHp,locomotion:locomotion(d),nature:unitNature(d)!,died:e.died,expires:e.expires};});}
 resurrect(op:Extract<Effect,{op:'resurrect'}>,ability:AbilityDefinition,rank:number,point:{x:number;y:number},visible:(c:CorpseView)=>boolean,relation:(c:CorpseView)=>string,source?:{id:number;owner:import('../../content/schema').Owner;cast:number}){
  if((op.ownership==='caster'||op.durationTicks!==undefined)&&!source)return [];
  const parameters=ability.ranks[rank-1],result:{id:number;x:number;y:number}[]=[];
  const candidates=selectCorpses(this.views().filter(visible),op,parameters,point,relation);
  for(const selected of candidates){
   if(result.length>=value(op.amount,parameters))break;
   const corpse=this.c.state.corpses.find(c=>c.id===selected.id);if(!corpse)continue;
   const owner=op.ownership==='caster'?source!.owner:corpse.owner;
   const d=this.c.registry.get(corpse.definition),supply=colonySupply(this.c.populationCandidates(),owner,this.c.registry);
   if(supplyAdmission(supply,op.supply==='require'?(d.supplyCost??0):0))continue;
   const location=this.c.spatial.nearest(corpse.position,op.placementRadius,undefined,{definition:d.id});if(!location)continue;
   const e=this.c.create({id:'',definition:d.id,owner,position:location,rotation:corpse.rotation});
   if(corpse.progression)e.progression=structuredClone(corpse.progression);
   if(corpse.abilities)e.abilities=structuredClone(corpse.abilities);
   e.hp=Math.max(1,Math.floor(this.c.stats(e).maxHp*value(op.healthPermille,parameters)/1000));
   if(e.abilities)e.abilities.mana=Math.floor(this.c.stats(e).maxMana*value(op.manaPermille,parameters)/1000);
   if(op.durationTicks!==undefined)e.summoned={source:source!.id,ability:ability.id,rank,cast:source!.cast,started:this.c.state.tick,expires:this.c.state.tick+value(op.durationTicks,parameters),reanimatedFrom:corpse.id};
   this.consume(corpse.id);result.push({id:e.id,x:e.x,y:e.y});
  }
  return result;
 }
 /** Exact-record consumption prevents two sequential spell operations claiming one corpse. */
 consume(id:number):Corpse|undefined{
  const index=this.c.state.corpses.findIndex(c=>c.id===id&&c.expires>this.c.state.tick);if(index<0)return;
  return this.c.state.corpses.splice(index,1)[0];
 }
}

export type CorpseView={relation?:'ally'|'enemy'|'neutral';id:number;definition:string;owner:string;camp?:string;x:number;y:number;rotation:number;level:number;maxHp:number;locomotion?:'ground'|'air';nature:'organic'|'undead'|'mechanical';died:number;expires:number};
/** The same bounded selector is used against visible corpses by execution and AI. */
export function selectCorpses(corpses:readonly CorpseView[],query:{corpses:import('zod').infer<typeof import('../../content/abilities/schema').corpseQuerySchema>},rank:Record<string,number>,center:{x:number;y:number},relation:(c:CorpseView)=>string){
 const radius=value(query.corpses.radius,rank),dist=(c:CorpseView)=>(c.x-center.x)**2+(c.y-center.y)**2;
 return corpses.filter(c=>query.corpses.relations.includes(relation(c) as 'ally'|'enemy'|'neutral')&&matchesSpellFilter({hero:false,summoned:false,locomotion:c.locomotion,nature:c.nature,level:c.level},query.corpses.filter)&&dist(c)<=radius**2)
  .sort((a,b)=>(query.corpses.order==='strongest'?b.level-a.level||b.maxHp-a.maxHp:0)||dist(a)-dist(b)||a.id-b.id);
}
