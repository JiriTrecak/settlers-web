import {statusDefinition,value} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from '../game/state';
type Subject=Pick<Entity,'spellStatuses'>;
function declarations(e:Subject,r:ContentRegistry){return (e.spellStatuses??[]).flatMap(s=>{const a=r.abilityLibrary.abilities.find(a=>a.id===s.ability),d=a&&statusDefinition(a,s.status);return a&&d?[{d,rank:a.ranks[s.rank-1]}]:[];});}
/** Combat state, not a suppressible control. Spell-type weapons may hit an ethereal target. */
export function isEthereal(e:Subject,r:ContentRegistry){return declarations(e,r).some(({d})=>d.ethereal);}
export function weaponCanTarget(e:Subject,r:ContentRegistry,type:string){return type==='spell'||!isEthereal(e,r);}
/** Strongest amplification and reduction compose once; duplicate statuses cannot multiply exponentially. */
export function spellDamageMultiplier(e:Subject,r:ContentRegistry,type:string){
 const entries=declarations(e,r);if(entries.some(({d})=>d.immunity===(type==='spell'?'spell':'physical')||type!=='spell'&&d.ethereal))return 0;
 const factors=entries.flatMap(({d,rank})=>d.damageTakenPermille?.[type]===undefined?[]:[value(d.damageTakenPermille[type],rank)]);
 return Math.min(1000,...factors)*Math.max(1000,...factors)/1000;
}
export function damageEligibility(e:Subject,r:ContentRegistry){return {ethereal:isEthereal(e,r),damageTakenPermille:Object.fromEntries(Object.keys(r.rules.damageTypes).map(type=>[type,spellDamageMultiplier(e,r,type)]))};}
