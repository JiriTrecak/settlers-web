import {afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {atomic} from '../../tooling/asset-studio/server/storage';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
const roots:string[]=[];
async function workspace(){const root=await mkdtemp(path.join(os.tmpdir(),'authoring-'));roots.push(root);return root;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
describe('shared authoring command service',()=>{
 it('guards revisions and does not allow arbitrary filenames or resource metadata writes',async()=>{
  const store=new AuthoringStore(await workspace()),a=assetDefinitionSchema.parse({version:1,id:'new-icon',name:'New icon',kind:'icon',revision:1,status:'draft',resources:[],usesGeometry:false,provenance:{method:'authored'}});
  await store.dispatch({op:'asset.create',definition:a});await expect(store.dispatch({op:'asset.create',definition:a})).rejects.toThrow('already exists');
  const saved=await store.dispatch({op:'asset.save',definition:{...a,name:'Renamed'},expectedRevision:1}) as typeof a;expect(saved.revision).toBe(2);
  await expect(store.dispatch({op:'asset.save',definition:a,expectedRevision:1})).rejects.toThrow('another editor');
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:1,format:'png',base64:'YWJj',filename:'../../bad.png'})).rejects.toThrow();
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:2,format:'png',base64:'YWJj'})).rejects.toThrow('gaps');
  await expect(store.dispatch({op:'asset.upload',id:a.id,expectedRevision:2,role:'image',index:1,format:'png',base64:'YWJj'})).rejects.toThrow();expect((await store.get(a.id)).revision).toBe(2);
 });
 it('uploads by role and validates bytes on read',async()=>{
  const root=await workspace(),store=new AuthoringStore(root),a=assetDefinitionSchema.parse({version:1,id:'data',name:'Data',kind:'data',revision:1,status:'draft',resources:[],usesGeometry:false,provenance:{method:'authored'}});await store.dispatch({op:'asset.create',definition:a});
  const bytes=Buffer.from('{"answer":42}');await store.dispatch({op:'asset.upload',id:a.id,expectedRevision:1,role:'data',index:1,format:'json',base64:bytes.toString('base64')});
  expect((await store.resource(a.id,{role:'data',index:1})).bytes).toEqual(bytes);expect(await store.dispatch({op:'asset.validate',id:a.id})).toMatchObject({valid:true,revision:2});
  await atomic(path.join(root,'art/assets/data/data.json'),Buffer.from('{}'));await expect(store.resource(a.id,{role:'data',index:1})).rejects.toThrow('outside the editor');
 });
});
