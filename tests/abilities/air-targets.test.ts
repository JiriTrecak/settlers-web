import {it,expect} from 'vitest';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {testAbilities,testSource} from '../fixtures/content';
/** Encounter subjects come from the test world; the schema defaults name shipped units. */
const encounterUnits={casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior'};
const base=testAbilities.abilities.find(a=>a.id==='ability.test.holy-light')!;
const look=testAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(allowed:'air'|'ground',mode:'air'|'ground'){
 const ability=abilitySchema.parse({...base,targeting:{...base.targeting,filter:{locomotion:[allowed]}},cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0}},onRelease:[{op:'heal',target:'target',amount:50}]});
 return createAbilityEncounter(ability,look,encounterSettingsSchema.parse({...encounterUnits,relationship:'ally',targetLocomotion:mode,targetHealth:100,distance:4}),false,testSource());
}
it.each(['air','ground'] as const)('encounter movement overrides inherited archetypes and filters %s targets on the shared cast path',mode=>{
 for(const allowed of ['air','ground'] as const){const f=fixture(allowed,mode),target=f.game.context.get(f.target!)!;
  expect(f.game.context.def(target).behaviors.movement!.locomotion).toBe(mode);
  const result=f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.target!}});
  expect(result.accepted).toBe(allowed===mode);
  for(let i=0;i<2;i++)f.game.tick(undefined,{passiveUnits:true});
  expect(target.hp).toBe(allowed===mode?150:100);
 }
});
it('retains air targeting and effect results through save/load and matching command streams',()=>{
 const a=fixture('air','air'),b=fixture('air','air');b.game.restore(a.game.snapshot());
 const action={type:'castAbility' as const,actor:a.caster,binding:'preview',target:{kind:'unit' as const,entity:a.target!}};
 expect(a.game.command('player.1',action).accepted).toBe(true);expect(b.game.command('player.1',action).accepted).toBe(true);
 for(let i=0;i<80;i++){a.game.tick(undefined,{passiveUnits:true});b.game.tick(undefined,{passiveUnits:true});expect(b.game.checksum()).toBe(a.game.checksum());}
});
