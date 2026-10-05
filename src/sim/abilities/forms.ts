import type {StatusEffect} from '../../content/abilities/schema';
import type {ContentRegistry} from '../../content/registry';
import type {Definition} from '../../content/schema';
import type {Entity} from '../game/state';
/** Latest form owns presentation and optional combat profile; modifiers compose normally.
 * Newest form wins, with cast then status identity as stable same-tick tie breakers.
 * Removing it exposes the previous form or the original authored appearance.
 */
export function activeSpellFormEntry(e:Pick<Entity,'spellStatuses'>,registry:ContentRegistry) {
 if(!e.spellStatuses?.length)return;
 let latest:{s:NonNullable<Entity['spellStatuses']>[number];form:NonNullable<StatusEffect['form']>}|undefined;
 for(const s of e.spellStatuses){
  const form=registry.findStatus(s.ability,s.status)?.form;if(!form)continue;
  const previous=latest?.s;
  if(!previous||s.started>previous.started||s.started===previous.started&&
    (s.cast>previous.cast||s.cast===previous.cast&&(s.ability<previous.ability||s.ability===previous.ability&&s.status<previous.status)))latest={s,form};
 }
 return latest;
}
export function activeSpellForm(e:Pick<Entity,'spellStatuses'>,registry:ContentRegistry){return activeSpellFormEntry(e,registry)?.form;}
/** Requested movement excludes retained airborne state during a blocked landing. */
export function desiredMovement(d:Definition,e:Pick<Entity,'spellStatuses'>,registry:ContentRegistry){const movement=d.behaviors.movement,override=activeSpellForm(e,registry)?.movement;return movement&&override?{...movement,...override}:movement;}

export function spellAppearance(e:Pick<Entity,'spellStatuses'|'appearance'>,registry:ContentRegistry):Entity['appearance'] {
 const active=activeSpellForm(e,registry);
 if(!active)return e.appearance;
 return {...e.appearance,...(active.asset?{asset:active.asset}:{}),scale:(e.appearance?.scale??1)*active.scale};
}

const resolved=new WeakMap<Definition,Map<string,Definition>>();
/** Identity/body/ownership stay authored; the latest form selects weapon and movement policies. */
export function formDefinition(d:Definition,e:Pick<Entity,'spellStatuses'> & {unit?:{flight?:{height:number}}},registry:ContentRegistry):Definition {
 if(!e.spellStatuses?.length&&!e.unit?.flight)return d;
 const form=activeSpellForm(e,registry),combat=form?.combatProfile?registry.get(form.combatProfile).behaviors.combat:d.behaviors.combat;
 let movement=d.behaviors.movement;if(movement&&form?.movement)movement={...movement,...form.movement};
 if(movement&&e.unit?.flight&&(movement.locomotion??'ground')==='ground')movement={...movement,locomotion:'air',flightHeight:e.unit.flight.height};
 if(combat===d.behaviors.combat&&movement===d.behaviors.movement)return d;
 const key=JSON.stringify([form?.combatProfile,movement]);
 let variants=resolved.get(d);if(!variants){variants=new Map();resolved.set(d,variants);}
 let result=variants.get(key);if(!result){result={...d,behaviors:{...d.behaviors,combat,movement}};variants.set(key,result);}return result;
}
export function weaponDefinition(e:Pick<Entity,'spellStatuses'|'definition'>,registry:ContentRegistry){return activeSpellForm(e,registry)?.combatProfile??e.definition;}

/** Cosmetic form opacity never changes visibility or targeting. */
export function spellFormOpacity(e:Pick<Entity,"spellStatuses">,registry:ContentRegistry){return activeSpellForm(e,registry)?.opacity??1;}
