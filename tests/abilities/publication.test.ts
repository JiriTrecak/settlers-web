import {it,expect} from 'vitest';
import published from '../../content/abilities/published.json';
import {verifyAbilityPublication} from '../../src/content/abilities/publication';
it('validates current definitions without immutable release metadata',async()=>{
 expect((await verifyAbilityPublication()).abilities).toHaveLength(published.library.abilities.length);
 const changed=structuredClone(published);(changed.library.abilities[0].ranks[0] as Record<string,number>).damage++;
 await expect(verifyAbilityPublication(changed)).resolves.toEqual(changed.library);
 const missing=structuredClone(published);missing.library.presentations[0].icon='asset.icons.missing';
 await expect(verifyAbilityPublication(missing)).rejects.toThrow(/Missing published effect image/);
 await expect(verifyAbilityPublication({...published,abi:'unsupported'})).rejects.toThrow(/ABI/);
 expect(published).not.toHaveProperty('releases');expect(published).not.toHaveProperty('resources');
});

it('resolves current spell icons by ID and uses them on command cards without a unit-specific override',async()=>{
 const {createAbilityEncounter}=await import('../../src/sim/abilities/encounter');
 const {encounterSettingsSchema}=await import('../../src/content/abilities/encounter');
 const {commandCard}=await import('../../src/presentation/commands');
 const {abilityLibrarySchema}=await import('../../src/content/abilities/schema');
 const library=abilityLibrarySchema.parse(published.library);
 for(const spell of library.abilities){
  const presentation=library.presentations.find(p=>p.id===spell.presentation)!;
  const {game,caster}=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({}));
  if(presentation.icon)expect(game.registry.asset(presentation.icon).image).toBeTruthy();
  const card=commandCard(game.view('player.1'),[caster],'player.1',game.registry).find(c=>c.type==='castAbility');
  expect(card?.icon).toBe(presentation.icon);
 }
 const changed=structuredClone(published);
 changed.library.presentations[0].icon=changed.library.presentations[1].icon;
 await expect(verifyAbilityPublication(changed)).resolves.toEqual(changed.library);
});
