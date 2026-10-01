import {releaseEffects,value,type AbilityDefinition,type Relation} from '../../content/abilities/schema';
/** Only observable candidate information enters this ranking. Stable entity ID breaks ties. */
export function abilityTargetScore(ability:AbilityDefinition,rank:number,relation:Relation,hp:number,maxHp:number,preference:'wounded-ally'|'enemy'){
 if(relation==='neutral'||!ability.targeting.relations.includes(relation))return 0;
 const effects=releaseEffects(ability,rank,relation);
 const benefit=effects.reduce((n,e)=>n+(e.op==='heal'&&relation==='ally'?Math.min(e.amount,maxHp-hp):e.op==='damage'&&relation==='enemy'?Math.min(e.amount,hp):e.op==='status'?10:e.op==='summon'?e.amount*20:e.op==='dispel'?10:0),0);
 return benefit*(relation===(preference==='wounded-ally'?'ally':'enemy')?2:1);
}
export {value};
