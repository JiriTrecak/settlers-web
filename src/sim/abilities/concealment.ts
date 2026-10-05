import {statusDefinition,value} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from '../game/state';
type Subject=Pick<Entity,'spellStatuses'>;
function declarations(e:Subject,registry:ContentRegistry,tick:number){
 return (e.spellStatuses??[]).filter(s=>s.expires>tick).flatMap(s=>{
  const a=registry.findAbility(s.ability),d=a&&statusDefinition(a,s.status);
  return a&&d?[{s,d,rank:a.ranks[s.rank-1]}]:[];
 });
}
/** Cosmetic fade is separate from the discrete, authoritative hidden-state boundary. */
export function concealmentOpacity(e:Subject,registry:ContentRegistry,tick:number){
 if(!e.spellStatuses?.length)return 1;
 return Math.min(1,...declarations(e,registry,tick).flatMap(({s,d})=>d.concealment?[1-.72*Math.min(1,Math.max(0,(d.concealment.fadeTicks===0?1:(tick-s.started)/d.concealment.fadeTicks)))]:[]));
}
export function spellHidden(e:Subject,registry:ContentRegistry,tick:number){
 if(!e.spellStatuses?.length)return false;
 return declarations(e,registry,tick).some(({s,d})=>d.concealment&&tick>=s.started+d.concealment.fadeTicks);
}
export function spellDetection(e:Subject,registry:ContentRegistry,tick:number){
 if(!e.spellStatuses?.length)return 0;
 return Math.max(0,...declarations(e,registry,tick).map(({d,rank})=>d.detectionRadius===undefined?0:value(d.detectionRadius,rank)));
}
/** Consumed at a successful weapon release or accepted cast. Canceled windups do not reveal. */
export function revealForAction(e:Subject,registry:ContentRegistry,tick:number,action:'attack'|'cast'){
 if(!e.spellStatuses?.length)return 0;
 const broken=declarations(e,registry,tick).filter(({d})=>action==='attack'?d.concealment?.breakOnAttack:d.concealment?.breakOnCast);
 const bonus=action==='attack'?Math.max(0,...broken.map(({s,d,rank})=>tick>=s.started+d.concealment!.fadeTicks?value(d.concealment!.attackBonus,rank):0)):0;
 if(broken.length){const records=new Set(broken.map(b=>b.s));e.spellStatuses=e.spellStatuses?.filter(s=>!records.has(s));if(!e.spellStatuses?.length)delete e.spellStatuses;}
 return bonus;
}
