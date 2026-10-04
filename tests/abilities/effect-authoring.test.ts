import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {visualEffectSchema,resolveEffectBindings} from '../../src/content/effects/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {documentSchema} from '../../tooling/spell-editor/shared/protocol';
const effect=()=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.sunshine',name:'Sunshine',durationTicks:80,loop:false,layers:[{id:'glow',shape:'glow',anchor:'target',colour:'#ffcc55',accent:'#ffffff',durationTicks:40,count:1,size:2,height:.1}]});
it('saves and publishes independent effects; linked spells follow the current publication, never drafts',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-effects-'));try{
  const service=new SpellEditorService(root);const doc=effect();
  const saved=await service.execute({op:'effects.save',document:doc,expectedRevision:null}) as {revision:string};
  await expect(service.execute({op:'effects.save',document:doc,expectedRevision:null})).rejects.toThrow('Revision conflict');
  await expect(service.execute({op:'publication.status',kind:'effects',id:doc.id})).resolves.toMatchObject({published:false,matchesDraft:false});
  await service.execute({op:'effects.publish',id:doc.id,expectedRevision:saved.revision});
  await expect(service.execute({op:'publication.status',kind:'effects',id:doc.id})).resolves.toMatchObject({published:true,matchesDraft:true});
  const spell=documentSchema.parse({definition:structuredClone(coreAbilities.abilities[0]),presentation:structuredClone(coreAbilities.presentations[0])});delete spell.presentation.icon;spell.presentation.effects=[{id:'release',effect:doc.id,event:'released',anchor:'target',lifetime:'finite'}];
  const savedSpell=await service.execute({op:'save',document:spell,expectedRevision:null}) as {revision:string};await service.execute({op:'publish',id:spell.definition.id,expectedRevision:savedSpell.revision});
  const spellBefore=await readFile(path.join(root,'content/abilities/published.json'),'utf8');
  doc.layers[0].size=4;const next=await service.execute({op:'effects.save',document:doc,expectedRevision:saved.revision}) as {revision:string};
  await expect(service.execute({op:'publication.status',kind:'effects',id:doc.id})).resolves.toMatchObject({published:true,matchesDraft:false});
  let library=await service.execute({op:'effects.library'}) as {effects:ReturnType<typeof effect>[]};expect(resolveEffectBindings(spell.presentation.effects,library.effects)[0].size).toBe(2);
  await service.execute({op:'effects.publish',id:doc.id,expectedRevision:next.revision});library=await service.execute({op:'effects.library'}) as typeof library;expect(resolveEffectBindings(spell.presentation.effects,library.effects)[0].size).toBe(4);expect(await readFile(path.join(root,'content/abilities/published.json'),'utf8')).toBe(spellBefore);
  await expect(service.execute({op:'publication.status',kind:'effects',id:doc.id})).resolves.toMatchObject({published:true,matchesDraft:true});
  expect((await service.execute({op:'effects.list'}) as any[])[0].name).toBe('Sunshine');
  spell.presentation.effects[0].effect='effect.test.missing';await expect(service.execute({op:'validate',document:spell})).rejects.toThrow('Unknown visual effect');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('rejects bad texture references and embedded visual recipes in spells',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-effect-invalid-'));try{
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[]}));
  const doc=effect();doc.layers[0].shape='billboard';doc.layers[0].texture={asset:'asset.missing.texture',role:'image',index:1};await expect(new SpellEditorService(root).execute({op:'effects.validate',document:doc})).rejects.toThrow('Missing published effect resource');
  expect(documentSchema.safeParse({definition:coreAbilities.abilities[0],presentation:{...coreAbilities.presentations[0],cues:[]}}).success).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('discovers published actor sockets and rejects unknown preview models without replacing the active take',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-effect-actor-'));try{
  const {assetDefinitionSchema}=await import('../../src/shared/authoring/asset');
  const actor=assetDefinitionSchema.parse({version:1,id:'asset.test.actor',name:'Actor',kind:'unit',status:'published',revision:1,usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',bytes:20,sha256:'a'.repeat(64)}],capabilities:{sockets:[{name:'hand',node:'HandBone',offset:[0,1,0]}]},provenance:{method:'authored'}});
  await mkdir(path.join(root,'assets/authoring'),{recursive:true});await writeFile(path.join(root,'assets/authoring/published.json'),JSON.stringify({version:1,assets:[actor]}));
  const service=new SpellEditorService(root),catalog=await service.execute({op:'catalog'}) as any;
  expect(catalog.models).toEqual([{id:actor.id,name:'Actor',geometry:[1],animations:[]}]);expect(catalog.sockets).toContainEqual({id:'hand',name:'hand',model:actor.id,modelName:'Actor',node:'HandBone',offset:[0,1,0]});
  const doc=effect();doc.layers[0].attachment={socket:'hand',fallback:'hide',inheritRotation:true};
  await service.execute({op:'effects.preview.load',document:doc,settings:{model:actor.id,modelAnchor:'source'}});
  await service.execute({op:'effects.preview.seek',tick:20});const before=await service.execute({op:'effects.preview.state'});
  await expect(service.execute({op:'effects.preview.load',document:doc,settings:{model:'asset.test.unknown'}})).rejects.toThrow('Unknown published preview model');
  expect(await service.execute({op:'effects.preview.state'})).toEqual(before);
  expect(()=>service.execute({op:'effects.preview.load',document:doc,settings:{model:'../../private'}})).toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
