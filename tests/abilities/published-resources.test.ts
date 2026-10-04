import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {coreEffects} from '../../src/content/effects/library';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';

// Validate the shipped catalogue through the authoring boundary, including
// file hashes, effect closure, model budgets, animation clips and image grids.
// Runtime schema tests alone cannot detect missing or damaged resource files.
it('validates every published spell and its resource closure',async()=>{
 const service=new SpellEditorService(process.cwd());
 for(const definition of coreAbilities.abilities){
  const presentation=coreAbilities.presentations.find(p=>p.id===definition.presentation);
  await expect(service.execute({op:'validate',document:{definition,presentation}}),definition.id).resolves.toMatchObject({valid:true});
 }
},60000);
it('validates every published effect including effects not bound to a spell',async()=>{
 const service=new SpellEditorService(process.cwd());
 for(const document of coreEffects)await expect(service.execute({op:'effects.validate',document}),document.id).resolves.toEqual({valid:true});
},60000);
