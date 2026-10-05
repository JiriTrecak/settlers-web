import {controlKindSchema,value,type AbilityDefinition,type StatusEffect,type ControlKind} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from '../game/state';
import type {SpellStatus} from './state';
import {nonSpellModifiers} from '../game/itemModifiers';
export const CONTROL_KINDS:readonly ControlKind[]=controlKindSchema.options;
type Holder=Pick<Entity,'equipment'|'itemStatuses'|'spellStatuses'>;
/** Read raw grants, never resolved stats/modifiers: immunity cannot recursively depend on itself. */
export function controlImmunities(e:Holder,registry:ContentRegistry):Set<ControlKind>{
 const kinds=new Set<ControlKind>();
 if(nonSpellModifiers(e,registry).some(m=>m.controlImmune))return new Set(CONTROL_KINDS);
 for(const s of e.spellStatuses??[]){
  const d=registry.findStatus(s.ability,s.status);if(!d)continue;
  if(d.modifiers.controlImmune)return new Set(CONTROL_KINDS);
  for(const kind of d.controlImmunity??[])kinds.add(kind);
 }
 return kinds;
}
export const controlImmune=(e:Holder,registry:ContentRegistry,kind:ControlKind)=>{
 // Most actors have no immunity source. Avoid allocating modifier arrays and a
 // Set for every movement/control predicate on those actors; no cached state.
 if(!e.spellStatuses?.length&&!e.itemStatuses?.length&&!e.equipment?.some(Boolean))return false;
 if(nonSpellModifiers(e,registry).some(m=>m.controlImmune))return true;
 for(const s of e.spellStatuses??[]){const d=registry.findStatus(s.ability,s.status);if(d?.modifiers.controlImmune||d?.controlImmunity?.includes(kind))return true;}
 return false;
};
export function statusModifiersRaw(d:StatusEffect,a:AbilityDefinition,rank:number){return {...d.modifiers,...Object.fromEntries(Object.entries(d.rankedModifiers??{}).map(([key,n])=>[key,value(n,a.ranks[rank-1])]))};}
export function statusControls(d:StatusEffect,a:AbilityDefinition,rank:number):ControlKind[]{
 const m=statusModifiersRaw(d,a,rank),k:ControlKind[]=[];
 for(const kind of ['stun','disarm','silence','itemBlocked'] as const)if(d[kind])k.push(kind);
 if(m.rooted)k.push('root');if((m.moveSpeedPermille??0)<0)k.push('moveSlow');if((m.attackSpeedPermille??0)<0)k.push('attackSlow');return k;
}
export function blockedStatusControls(s:SpellStatus,immune:ReadonlySet<ControlKind>){return new Set([...immune,...s.blockedControls??[]]);}
/** Whether a partially prevented application has another component worth retaining. */
export function statusHasPayload(d:StatusEffect,a:AbilityDefinition,rank:number,blocked:ReadonlySet<ControlKind>){
 if(statusControls(d,a,rank).some(k=>!blocked.has(k)))return true;
 const m=statusModifiersRaw(d,a,rank);delete m.rooted;
 if((m.moveSpeedPermille??0)<0)delete m.moveSpeedPermille;if((m.attackSpeedPermille??0)<0)delete m.attackSpeedPermille;
 return Object.values(m).some(Boolean)||!!(d.ethereal||d.damageTakenPermille||d.periodic||d.shield||d.manaShield||d.concealment||d.detectionRadius||d.form||d.immunity||d.spellImmunity||d.controlImmunity?.length||d.combatModifiers||a.triggers?.some(t=>t.whileStatus===d.id));
}
