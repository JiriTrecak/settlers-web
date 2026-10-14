import {it,expect} from 'vitest';
import published from '../../content/abilities/published.json';
import {verifyAbilityPublication} from '../../src/content/abilities/publication';

// CONTENT-VALIDATION: the shipped ability publication, whatever it contains, resolves every dependency by ID.
it('verifies the shipped publication and rejects unsupported ABIs or missing presentation images',async()=>{
 expect((await verifyAbilityPublication()).abilities).toHaveLength(published.library.abilities.length);
 expect(published).not.toHaveProperty('releases');expect(published).not.toHaveProperty('resources');
 await expect(verifyAbilityPublication({...published,abi:'unsupported'})).rejects.toThrow(/ABI/);
 const iconic=published.library.presentations.findIndex(p=>'icon' in p&&p.icon);
 if(iconic>=0){
  const missing=structuredClone(published);(missing.library.presentations[iconic] as {icon?:string}).icon='asset.test.missing-icon';
  await expect(verifyAbilityPublication(missing)).rejects.toThrow(/Missing published effect image/);
 }
});

it('every shipped spell icon resolves and is used on its command card without a unit-specific override',async()=>{
 const {createAbilityEncounter}=await import('../../src/sim/abilities/encounter');
 const {encounterSettingsSchema}=await import('../../src/content/abilities/encounter');
 const {commandCard}=await import('../../src/presentation/commands');
 const {abilityLibrarySchema}=await import('../../src/content/abilities/schema');
 const library=abilityLibrarySchema.parse(published.library);
 for(const spell of library.abilities){
  const presentation=library.presentations.find(p=>p.id===spell.presentation)!;
  // Shipped content on purpose: the default encounter source and settings are the shipped ones.
  const {game,caster}=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({}));
  if(presentation.icon)expect(game.registry.asset(presentation.icon).image).toBeTruthy();
  const card=commandCard(game.view('player.1'),[caster],'player.1',game.registry).find(c=>c.type==='castAbility');
  expect(card,spell.id).toBeDefined();
  expect(card?.icon,spell.id).toBe(presentation.icon??game.registry.get(game.context.get(caster)!.definition).icon);
 }
});
