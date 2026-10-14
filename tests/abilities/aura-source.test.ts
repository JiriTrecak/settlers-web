import {expect,it} from 'vitest';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {testAbilities,testSource} from '../fixtures/content';
/** Encounter subjects come from the test world; the schema defaults name shipped units. */
const encounterUnits={casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior'};

it('enemy auras retain their source marker without recipients and never debuff their source',()=>{
 const base=testAbilities.abilities.find(a=>a.id==='ability.test.marshal-rally')!;
 const spell=abilitySchema.parse({...base,targeting:{...base.targeting,relations:['enemy'],allowSelf:false},onRelease:[
  {op:'status',target:'target',id:'crushed',amount:1,polarity:'negative',dispel:false,modifiers:{armor:-3}},
  {op:'status',target:'caster',id:'presence',amount:1,polarity:'positive',dispel:false,modifiers:{}},
 ]});
 const f=createAbilityEncounter(spell,testAbilities.presentations.find(p=>p.id===base.presentation)!,encounterSettingsSchema.parse({...encounterUnits,relationship:'enemy',distance:30,combat:false}),false,testSource());
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

