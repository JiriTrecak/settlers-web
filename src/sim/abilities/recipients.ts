import {matchesSpellTarget,acceptsSpell,matchesSpellFilter,operationFilter,type SpellEligibility} from './eligibility';
import {value,type AbilityDefinition,type Effect,type Relation} from '../../content/abilities/schema';
export type RecipientPoint={id:number;x:number;y:number};
export type Recipient=RecipientPoint&SpellEligibility&{alive:boolean;targetable:boolean;unit:boolean;hp:number;maxHp:number;mana?:number;maxMana?:number};
const distance=(a:RecipientPoint,b:RecipientPoint)=>(a.x-b.x)**2+(a.y-b.y)**2;
/** Shared by execution and AI. AI supplies only its observed candidates. */
export function operationTargets<T extends Recipient>(effect:Effect,spell:AbilityDefinition,rank:number,caster:T,aim:RecipientPoint,candidates:readonly T[],relation:(target:T)=>Relation,areaDefaults=true):RecipientPoint[]{
 if(effect.target==='point')return [{id:0,x:aim.x,y:aim.y}];
 const q=effect.query;
 if(q){
  const center=q.center==='caster'?caster:q.center==='target'?(candidates.find(t=>t.id===aim.id)??aim):aim,radius=value(q.radius,spell.ranks[rank-1]);
  return candidates.filter(t=>t.alive&&t.targetable&&acceptsSpell(t,spell,relation(t))&&(t.unit||q.includeBuildings)&&(q.allowSelf||t.id!==caster.id)&&(!q.excludePrimary||t.id!==aim.id)&&q.relations.includes(relation(t) as 'ally'|'enemy')&&matchesSpellFilter(t,operationFilter(effect))&&distance(t,center)<=radius**2)
   .sort((a,b)=>(q.order==='lowest-health'?a.hp*b.maxHp-b.hp*a.maxHp:0)||distance(a,center)-distance(b,center)||a.id-b.id).slice(0,q.maxTargets);
 }
 if(effect.target==='caster')return acceptsSpell(caster,spell,'ally')&&matchesSpellFilter(caster,operationFilter(effect))?[caster]:[];
 if(areaDefaults&&spell.targeting.radius!==undefined){
  const targeting=spell.targeting,radius=value(targeting.radius!,spell.ranks[rank-1]);
  return candidates.filter(t=>t.alive&&t.targetable&&acceptsSpell(t,spell,relation(t))&&(t.unit||targeting.includeBuildings)&&(targeting.allowSelf||t.id!==caster.id)&&targeting.relations.includes(relation(t) as 'ally'|'enemy')&&matchesSpellTarget(t,spell,caster,relation(t))&&matchesSpellFilter(t,operationFilter(effect))&&distance(t,aim)<=radius**2).sort((a,b)=>a.id-b.id).slice(0,targeting.maxTargets??128);
 }
 const target=candidates.find(t=>t.id===aim.id)??aim;return aim.id&&(!("alive" in target)||matchesSpellFilter(target as Recipient,operationFilter(effect)))?[aim]:[];
}
