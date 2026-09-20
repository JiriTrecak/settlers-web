import {afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {planMigration,applyMigration} from '../../tooling/asset-studio/server/authoring/migrate';
import {compilePackageRecords,readPackages,validatePackage} from '../../tooling/asset-studio/server/authoring/packages';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {atomic,hash,saveJson} from '../../tooling/asset-studio/server/storage';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'authoring-'));roots.push(root);const bytes=Buffer.from('geometry fixture'),file='assets/models/pine/model.glb';await atomic(path.join(root,file),bytes);
 await saveJson(path.join(root,'art/records/pine/asset.json'),{version:1,id:'pine',name:'Pine',kind:'model',tags:[],status:'published',revision:1,profile:'model',outputs:[{role:'model',path:file,sha256:hash(bytes),bytes:bytes.length}],render:[{id:'tree',file}],scenery:[{id:'pine',name:'Pine',category:'foliage',type:'prop',file:file.slice(7),blockers:[{width:1,depth:1}]}],source:{path:file,sha256:hash(bytes),quality:'runtime-only'},origin:{method:'import'},validation:{checkedAt:'test',warnings:[]}});return root;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
describe('asset authoring migration',()=>{
 it('preserves source bytes and cross-system bindings while deriving canonical filenames',async()=>{
  const root=await fixture();await atomic(path.join(root,'assets/textures/orphan.bin'),Buffer.from([1,2,3]));const plan=await planMigration(root);
  expect(plan.assets).toHaveLength(2);expect(plan.copies).toHaveLength(2);expect(plan.assets[0]!.resources).toHaveLength(1);
  await applyMigration(root,plan);await applyMigration(root,plan);
  const all=await readPackages(root);await Promise.all(all.map(a=>validatePackage(root,a)));
  const runtime=compilePackageRecords(all).find(r=>r.id==='pine')!;
  expect(runtime.render[0]!.file).toBe('assets/library/pine/geometry.glb');expect(runtime.scenery[0]!.file).toBe('library/pine/geometry.glb');
  expect(await readFile(path.join(root,'assets/models/pine/model.glb'))).toEqual(await readFile(path.join(root,'art/assets/pine/geometry.glb')));
 });
 it('refuses to overwrite a migrated resource edited by the user',async()=>{
  const root=await fixture(),plan=await planMigration(root);await applyMigration(root,plan);await atomic(path.join(root,'art/assets/pine/geometry.glb'),Buffer.from('edited'));
  await expect(applyMigration(root,plan)).rejects.toThrow('already differs');
 });
 it('detects source changes between audit and apply before writing anything',async()=>{
  const root=await fixture(),plan=await planMigration(root);await atomic(path.join(root,'assets/models/pine/model.glb'),Buffer.from('changed'));
  await expect(applyMigration(root,plan)).rejects.toThrow('changed since audit');expect(await readPackages(root)).toEqual([]);
 });
});
describe('shared authoring command service',()=>{
 it('guards revisions and does not allow arbitrary filenames or resource metadata writes',async()=>{
  const root=await fixture(),store=new AuthoringStore(root),a=assetDefinitionSchema.parse({version:1,id:'new-icon',name:'New icon',kind:'icon',revision:1,status:'draft',resources:[],usesGeometry:false,provenance:{method:'authored'}});
  await store.dispatch({op:'asset.create',definition:a});await expect(store.dispatch({op:'asset.create',definition:a})).rejects.toThrow('already exists');
  const saved=await store.dispatch({op:'asset.save',definition:{...a,name:'Renamed'},expectedRevision:1}) as typeof a;expect(saved.revision).toBe(2);
  await expect(store.dispatch({op:'asset.save',definition:a,expectedRevision:1})).rejects.toThrow('another editor');
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:1,format:'png',base64:'YWJj',filename:'../../bad.png'})).rejects.toThrow();
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:2,format:'png',base64:'YWJj'})).rejects.toThrow('gaps');
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:1,format:'png',base64:'YWJj'})).rejects.toThrow();expect((await store.get(a.id)).revision).toBe(2);
 });
 it('uploads by role and validates bytes on read',async()=>{
  const root=await fixture(),store=new AuthoringStore(root),a=assetDefinitionSchema.parse({version:1,id:'data',name:'Data',kind:'data',revision:1,status:'draft',resources:[],usesGeometry:false,provenance:{method:'authored'}});await store.dispatch({op:'asset.create',definition:a});
  const bytes=Buffer.from('{"answer":42}');await store.dispatch({op:'asset.upload',id:a.id,expectedRevision:1,role:'data',index:1,format:'json',base64:bytes.toString('base64')});
  expect((await store.resource(a.id,{role:'data',index:1})).bytes).toEqual(bytes);expect(await store.dispatch({op:'asset.validate',id:a.id})).toMatchObject({valid:true,revision:2});
  await atomic(path.join(root,'art/assets/data/data.json'),Buffer.from('{}'));await expect(store.resource(a.id,{role:'data',index:1})).rejects.toThrow('outside the editor');
 });
});
