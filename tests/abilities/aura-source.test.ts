import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

it('enemy auras retain their source marker without recipients and never debuff their source',()=>{
 const base=coreAbilities.abilities.find(a=>a.id==='ability.marshal.rally')!;
 const spell=abilitySchema.parse({...base,targeting:{...base.targeting,relations:['enemy'],allowSelf:false},onRelease:[
  {op:'status',target:'target',id:'crushed',amount:1,polarity:'negative',dispel:false,modifiers:{armor:-3}},
  {op:'status',target:'caster',id:'presence',amount:1,polarity:'positive',dispel:false,modifiers:{}},
 ]});
 const f=createAbilityEncounter(spell,coreAbilities.presentations.find(p=>p.id===base.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',distance:30,combat:false}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 f.game.tick();
 expect(c.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 expect(t.spellStatuses).toBeUndefined();
 t.x=c.x+5;t.y=c.y;f.game.tick();
 expect(t.spellStatuses?.map(s=>s.status)).toEqual(['crushed']);
 expect(c.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 t.x=c.x+30;f.game.tick();
 expect(t.spellStatuses).toBeUndefined();
 expect(c.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 c.abilities!.ranks.preview=0;f.game.tick();
 expect(c.spellStatuses).toBeUndefined();
});


it('refreshes aura status without computing discarded event visibility',()=>{
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.marshal.rally')!;
 const f=createAbilityEncounter(spell,coreAbilities.presentations.find(p=>p.id===spell.presentation)!,encounterSettingsSchema.parse({relationship:'ally',distance:6,combat:false}));
 const visibility=vi.spyOn(f.game.observation,'visible');
 try{
  f.game.abilities.tick();
  expect(f.game.context.get(f.target)!.spellStatuses?.some(s=>s.ability===spell.id)).toBe(true);
  expect(visibility).not.toHaveBeenCalled();
 }finally{visibility.mockRestore();}
});
