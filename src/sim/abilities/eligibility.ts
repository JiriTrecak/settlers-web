import {matchesAbilityCondition,matchesTargetFilter,type TargetTraits} from '../../content/abilities/conditions';
import type {Definition} from '../../content/schema';
import {statusDefinition,type AbilityDefinition,type Effect,type ControlKind} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from '../game/state';
export type SpellEligibility=TargetTraits&{summonOrigin?:{source:number;ability:string};spellImmunity?:'hostile'|'all';controlImmunity?:ControlKind[];ethereal?:boolean;damageTakenPermille?:Record<string,number>};
export const matchesSpellFilter=matchesTargetFilter;
export function unitNature(d:Pick<Definition,'kind'|'unitNature'>){return d.kind==='unit'?d.unitNature??'organic':undefined;}
export function matchesSpellTarget(target:TargetTraits,spell:AbilityDefinition,caster:TargetTraits,relation:string){
 return matchesTargetFilter(target,spell.targeting.filter)&&(!spell.targeting.condition||matchesAbilityCondition(spell.targeting.condition,{caster,target,relation}));
}
export function acceptsSpell(target:SpellEligibility,spell:AbilityDefinition,relation:string){
 return !!spell.piercesSpellImmunity||!target.spellImmunity||target.spellImmunity==='hostile'&&relation!=='enemy';
}
export function operationFilter(effect:Effect){return 'filter' in effect?effect.filter:undefined;}
/** Resolved from saved declarations, shared with observed AI actors. */
export function spellImmunity(e:Pick<Entity,'spellStatuses'>,registry:ContentRegistry,tick?:number):SpellEligibility['spellImmunity']{
 let result:SpellEligibility['spellImmunity'];
 for(const s of e.spellStatuses??[]){if(tick!==undefined&&s.expires<=tick)continue;const a=registry.abilityLibrary.abilities.find(a=>a.id===s.ability),protection=a&&statusDefinition(a,s.status)?.spellImmunity;if(protection==='all')return 'all';if(protection)result=protection;}
 return result;
}
