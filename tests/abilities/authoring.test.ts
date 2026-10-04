import {describe,it,expect,afterEach} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import type {SpellDocument} from '../../tooling/spell-editor/shared/protocol';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
async function setup(){
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-spells-'));roots.push(root);const doc={definition:structuredClone(coreAbilities.abilities[0]),presentation:structuredClone(coreAbilities.presentations[0])};
 delete doc.presentation.icon;
 doc.presentation.effects=[];
 const folder=path.join(root,'content/abilities',doc.definition.id);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'definition.json'),JSON.stringify(doc.definition));await writeFile(path.join(folder,'presentation.json'),JSON.stringify(doc.presentation));return {root,doc,service:new SpellEditorService(root)};
}
describe('independent spell authoring service',()=>{
 it('validates, saves optimistically, replaces the current publication and rejects stale edits',async()=>{
  const {service,doc,root}=await setup();const first=await service.execute({op:'read',id:doc.definition.id}) as {revision:string};
  await expect(service.execute({op:'publication.status',kind:'spells',id:doc.definition.id})).resolves.toMatchObject({published:false,matchesDraft:false});
  doc.definition.ranks[0].heal=125;
  const saved=await service.execute({op:'save',document:doc,expectedRevision:first.revision}) as {revision:string;document:SpellDocument};
  expect(saved.revision).not.toBe(first.revision);
  await expect(service.execute({op:'save',document:doc,expectedRevision:first.revision})).rejects.toThrow(/conflict/);
  expect(await service.execute({op:'publish',id:doc.definition.id,expectedRevision:saved.revision})).toEqual({published:true,id:doc.definition.id});
  await expect(service.execute({op:'publication.status',kind:'spells',id:doc.definition.id})).resolves.toMatchObject({published:true,matchesDraft:true});
  const file=path.join(root,'content/abilities/published.json');
  expect(JSON.parse(await readFile(file,'utf8')).library.abilities[0].ranks[0].heal).toBe(125);
  doc.definition.ranks[0].heal=200;
  const next=await service.execute({op:'save',document:doc,expectedRevision:saved.revision}) as {revision:string};
  expect(JSON.parse(await readFile(file,'utf8')).library.abilities[0].ranks[0].heal).toBe(125);
  await expect(service.execute({op:'publication.status',kind:'spells',id:doc.definition.id})).resolves.toMatchObject({published:true,matchesDraft:false});
  await service.execute({op:'publish',id:doc.definition.id,expectedRevision:next.revision});
  await expect(service.execute({op:'publication.status',kind:'spells',id:doc.definition.id})).resolves.toMatchObject({published:true,matchesDraft:true});
  const current=JSON.parse(await readFile(file,'utf8'));
  expect(current.library.abilities).toHaveLength(1);expect(current.library.abilities[0].ranks[0].heal).toBe(200);
  expect(current).not.toHaveProperty('releases');expect(current).not.toHaveProperty('resources');
  await expect(readFile(path.join(root,'content/abilities',doc.definition.id,'release.json'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(readFile(path.join(root,'assets/abilities/releases'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('controls an actual encounter independently of any browser or map editor',async()=>{
  const {service,doc}=await setup();
  await service.execute({op:'preview.load',document:doc,settings:{}});
  expect(await service.execute({op:'preview.cast'})).toMatchObject({accepted:true});
  const state=await service.execute({op:'preview.step',ticks:30}) as PreviewState;
  expect(state.entities.find(e=>e.id===state.target)?.hp).toBe(140);
  expect(state.events.some(e=>e.event==='healed'&&e.amount===100)).toBe(true);
  await service.execute({op:'preview.reset'});
  const reset=await service.execute({op:'preview.state'}) as PreviewState;
  expect(reset.events).toEqual([]);expect(reset.tick).toBe(0);
  expect(reset.entities.find(e=>e.id===reset.target)?.hp).toBe(40);
 });
 it('adopts saved visual-only changes into a clean paused take without resetting simulation or replay',async()=>{
  const {service,doc}=await setup(),saved=await service.execute({op:'read',id:doc.definition.id}) as {revision:string};
  await service.execute({op:'preview.load',document:doc,settings:{}});await service.execute({op:'preview.cast'});
  await service.execute({op:'preview.play',playing:false});await service.execute({op:'preview.step',ticks:30});
  const before=service.state() as PreviewState;
  const revised=structuredClone(doc);revised.presentation.animations.prepare='idle';
  await service.execute({op:'save',document:revised,expectedRevision:saved.revision});
  const after=service.state() as PreviewState;
  expect(after.document).toEqual(revised);expect(after.epoch).toBeGreaterThan(before.epoch);
  expect(after).toMatchObject({tick:30,playing:false,checksum:before.checksum,entities:before.entities,events:before.events});
  const replay=await service.execute({op:'preview.seek',tick:30}) as PreviewState;expect(replay.checksum).toBe(before.checksum);
  await expect(service.execute({op:'save',document:doc,expectedRevision:saved.revision})).rejects.toThrow(/conflict/);
  expect((service.state() as PreviewState).document).toEqual(revised);
 });
 it.each(['unsaved-preview','mechanical-change'] as const)('preserves the active take on %s instead of silently replacing it',async mode=>{
  const {service,doc}=await setup(),saved=await service.execute({op:'read',id:doc.definition.id}) as {revision:string};
  const preview=structuredClone(doc);if(mode==='unsaved-preview')preview.presentation.animations.recover='idle';
  await service.execute({op:'preview.load',document:preview,settings:{}});const before=service.state() as PreviewState;
  const revised=structuredClone(doc);revised.presentation.animations.prepare='idle';if(mode==='mechanical-change')revised.definition.cast.prepareTicks++;
  await service.execute({op:'save',document:revised,expectedRevision:saved.revision});
  expect(service.state()).toMatchObject({document:preview,epoch:before.epoch,checksum:before.checksum});
 });
 it('rejects unsafe IDs and bad definitions without changing the encounter',async()=>{
  const {service,doc}=await setup();await service.execute({op:'preview.load',document:doc,settings:{}});
  expect(()=>service.execute({op:'read',id:'../../credentials'})).toThrow();
  const before=service.state() as PreviewState;
  doc.definition.ranks[0].range=5000;
  expect(()=>service.execute({op:'preview.load',document:doc,settings:{}})).toThrow();
  expect((service.state() as PreviewState).checksum).toBe(before.checksum);
 });
 it('replays a single cast into a stable paused release frame after live playback',async()=>{
  const {service,doc}=await setup();await service.execute({op:'preview.load',document:doc,settings:{}});
  await service.execute({op:'preview.play',playing:true,speed:2});service.advance(250);
  const first=await service.execute({op:'preview.replay',tick:18}) as {state:PreviewState};
  expect(first.state).toMatchObject({tick:18,playing:false});
  expect(first.state.events.filter(e=>e.event==='healed')).toHaveLength(1);
  service.advance(250);expect(service.state()).toMatchObject({tick:18,checksum:first.state.checksum});
  const second=await service.execute({op:'preview.replay',tick:18}) as {state:PreviewState};
  expect(second.state.checksum).toBe(first.state.checksum);expect(second.state.events).toEqual(first.state.events);
 });
});
