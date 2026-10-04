import {expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {coreAbilities} from '../../src/content/abilities/core';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {authoringSchema} from '../../tooling/spell-editor/server/authoringTools';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';

it('accepts an icon published after the service started, then saves, publishes, reloads and replays it',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'spell-catalog-'));
 const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
 const put=async(file:string,data:unknown)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),JSON.stringify(data));};
 try{
  for(const file of ['content/game.json','content/abilities/published.json','assets/manifest.json','assets/authoring/published.json'])await put(file,await json(file));
  const service=new SpellEditorService(root),id='asset.test.fresh-icon';
  expect((await service.execute({op:'catalog'}) as any).icons.some((i:any)=>i.id===id)).toBe(false);
  // Simulate the canonical publisher atomically replacing its indices and runtime image.
  const manifest=await json(path.join(root,'assets/manifest.json'));
  const published=await json(path.join(root,'assets/authoring/published.json'));
  const original='asset.icons.spell-thorns-aura',record=structuredClone(manifest.records.find((r:any)=>r.id===original));
  const asset=structuredClone(published.assets.find((a:any)=>a.id===original));
  const replace=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(original,id));
  manifest.records.push(replace(record));published.assets.push(replace(asset));
  await mkdir(path.join(root,'assets/library',id),{recursive:true});
  await copyFile(`assets/library/${original}/image.png`,path.join(root,'assets/library',id,'image.png'));
  await put('assets/manifest.json',manifest);await put('assets/authoring/published.json',published);
  const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light-lite')!);
  const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);
  definition.id='ability.test.fresh-icon';definition.presentation=presentation.id='presentation.test.fresh-icon';presentation.icon=id;presentation.effects=[];
  const document={definition,presentation};
  expect(await service.execute({op:'validate',document})).toMatchObject({valid:true});
  const saved=await service.execute({op:'save',document,expectedRevision:null}) as {revision:string};
  expect(await service.execute({op:'publish',id:definition.id,expectedRevision:saved.revision})).toMatchObject({published:true});
  const reopened=await service.execute({op:'read',id:definition.id}) as {document:typeof document};
  expect(reopened.document.presentation.icon).toBe(id);
  await service.execute({op:'preview.load',document:reopened.document,settings:{relationship:'ally',targetHealth:40}});
  await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:30});
  const state=service.state() as PreviewState;
  expect(state.entities.find(e=>e.id===state.target)?.hp).toBe(140);
  await service.execute({op:'preview.seek',tick:0});await service.execute({op:'preview.seek',tick:30});
  expect((service.state() as PreviewState).checksum).toBe(state.checksum);
 }finally{await rm(root,{recursive:true,force:true});}
});

it('shares repeated schema definitions without blowing up the assistant context',()=>{
 for(const section of ['spell','save','preview.load']){
  const schema=authoringSchema(section),encoded=JSON.stringify(schema);
  expect(encoded.length).toBeLessThan(65000);
  const refs=[...encoded.matchAll(/"\$ref":"#\/\$defs\/([^"/]+)"/g)];
  expect(refs.length).toBeGreaterThan(0);
  for(const ref of refs)expect(schema).toHaveProperty(['$defs',ref[1]]);
 }
});
