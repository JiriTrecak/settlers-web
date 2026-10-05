import {expect,it} from 'vitest';
import {allEffects,statusDefinition} from '../../src/content/abilities/schema';
import {game} from '../game/helpers';

it('indexes exactly the published ability/status declarations, including branches and triggers',()=>{
 const registry=game().registry;
 for(const ability of registry.abilityLibrary.abilities){
  expect(registry.findAbility(ability.id)).toBe(ability);
  for(const effect of allEffects(ability))if(effect.op==='status'){
   expect(registry.findStatus(ability.id,effect.id)).toBe(statusDefinition(ability,effect.id));
   expect(Object.isFrozen(registry.findStatus(ability.id,effect.id))).toBe(true);
  }
  expect(registry.findStatus(ability.id,'toString')).toBeUndefined();
 }
 for(const id of ['missing','__proto__','constructor','toString']){
  expect(registry.findAbility(id)).toBeUndefined();
  expect(registry.findStatus(id,'missing')).toBeUndefined();
 }
});

it('a new publication has its own declarations and cannot poison an existing registry',()=>{
 const old=game().registry,ability=old.abilityLibrary.abilities.find(a=>allEffects(a).some(e=>e.op==='status'))!;
 const effect=allEffects(ability).find(e=>e.op==='status')!;
 const updated=game([],draft=>{
  const library=structuredClone(old.abilityLibrary);
  const edited=library.abilities.find(a=>a.id===ability.id)!;
  const status=allEffects(edited).find(e=>e.op==='status'&&e.id===effect.id)!;
  if(status.op==='status')status.modifiers.armor=17;
  draft.abilityLibrary=library;
 }).registry;
 expect(updated.findStatus(ability.id,effect.id)?.modifiers.armor).toBe(17);
 expect(old.findStatus(ability.id,effect.id)).toBe(effect);
 expect(updated.findStatus(ability.id,effect.id)).not.toBe(effect);
});
