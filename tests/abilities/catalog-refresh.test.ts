import {expect,it} from 'vitest';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {testAbilities} from '../fixtures/content';
import {testWorkspace} from '../fixtures/content/workspace';
import {editorService} from './encounter-harness';
import {authoringSchema} from '../../tooling/spell-editor/server/authoringTools';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';

it('accepts an icon published after the service started, then saves, publishes, reloads and replays it',async()=>{
 const workspace=await testWorkspace(),root=workspace.root;
 const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
 const put=async(file:string,data:unknown)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),JSON.stringify(data));};
 try{
  const service=editorService(root),id='asset.test.fresh-icon';
  expect((await service.execute({op:'catalog'}) as any).icons.some((i:any)=>i.id===id)).toBe(false);
  // Simulate the canonical publisher atomically replacing its indices and runtime image.
  const manifest=await json(path.join(root,'assets/manifest.json'));
  const published=await json(path.join(root,'assets/authoring/published.json'));
  const original='asset.test.icons-spell-thorns-aura',record=structuredClone(manifest.records.find((r:any)=>r.id===original));
  const asset=structuredClone(published.assets.find((a:any)=>a.id===original));
  const replace=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(original,id));
  const image=await sharp({create:{width:64,height:64,channels:4,background:{r:40,g:160,b:90,alpha:1}}}).png().toBuffer(),icon=replace(asset);
  icon.resources=icon.resources.filter((r:any)=>r.role==='image').map((r:any)=>({...r,bytes:image.length,sha256:createHash('sha256').update(image).digest('hex')}));
  manifest.records.push(replace(record));published.assets.push(icon);
  await mkdir(path.join(root,'assets/library',id),{recursive:true});
  await writeFile(path.join(root,'assets/library',id,'image.png'),image);
  await put('assets/manifest.json',manifest);await put('assets/authoring/published.json',published);
  const definition=structuredClone(testAbilities.abilities.find(a=>a.id==='ability.test.holy-light-lite')!);
  const presentation=structuredClone(testAbilities.presentations.find(p=>p.id===definition.presentation)!);
  definition.id='ability.test.fresh-icon';definition.presentation=presentation.id='presentation.test.fresh-icon';presentation.icon=id;presentation.effects=[];
  const document={definition,presentation};
  expect(await service.execute({op:'validate',document})).toMatchObject({valid:true});
  const saved=await service.execute({op:'save',document,expectedRevision:null}) as {revision:string};
  expect(await service.execute({op:'publish',id:definition.id,expectedRevision:saved.revision})).toMatchObject({published:true});
  const reopened=await service.execute({op:'read',id:definition.id}) as {document:typeof document};
  expect(reopened.document.presentation.icon).toBe(id);
  await service.execute({op:'preview.load',document:reopened.document,settings:{casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior',relationship:'ally',targetHealth:40}});
  await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:30});
  const state=service.state() as PreviewState;
  expect(state.entities.find(e=>e.id===state.target)?.hp).toBe(140);
  await service.execute({op:'preview.seek',tick:0});await service.execute({op:'preview.seek',tick:30});
  expect((service.state() as PreviewState).checksum).toBe(state.checksum);
 }finally{await workspace.dispose();}
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
