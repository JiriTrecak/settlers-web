import {afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {assetDefinitionSchema,assetFolder,type AssetDefinition} from '../../src/shared/authoring/asset';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {planPublication,readPublished,RELEASE_PATH} from '../../tooling/asset-studio/server/authoring/publication';
import {atomic,hash,saveJson} from '../../tooling/asset-studio/server/storage';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
const roots:string[]=[];
const recipe=(id='hill')=>assetDefinitionSchema.parse({version:1,id,name:id,kind:'landscape-recipe',revision:1,status:'published',resources:[],usesGeometry:false,recipe:{type:'terrain',operation:'raise',height:3,falloff:5},provenance:{method:'authored'}});
async function fixture(assets:AssetDefinition[]=[recipe()]){const root=await mkdtemp(path.join(os.tmpdir(),'asset-publish-'));roots.push(root);for(const asset of assets)await saveJson(path.join(root,assetFolder(asset.id),'asset.json'),asset);await commitFiles(root,(await planPublication(root,assets,new Set(assets.map(a=>a.id)))).writes);return {root,store:new AuthoringStore(root)};}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
describe('canonical runtime publication',()=>{
 it('publishes pure recipes as metadata and produces an identical no-op rebuild',async()=>{
  const {root}=await fixture();expect(JSON.parse(await readFile(path.join(root,'assets/manifest.json'),'utf8')).records[0].outputs[0].path).toBe('assets/library/hill/definition.json');
  const released=(await readPublished(root))!;expect((await planPublication(root,released,new Set())).writes).toEqual([]);
 });
 it('isolates unrelated draft edits and exposes working versus runtime revisions',async()=>{
  const {root,store}=await fixture([recipe(),recipe('other')]);
  const edited=await store.dispatch({op:'asset.save',definition:{...recipe(),recipe:{type:'terrain',operation:'raise',height:8,falloff:5}},expectedRevision:1}) as AssetDefinition;
  expect(edited.revision).toBe(2);expect(await store.dispatch({op:'asset.publication',id:'hill'})).toEqual({id:'hill',revision:1});
  await store.dispatch({op:'asset.publish',id:'other',expectedRevision:1});
  expect((await readPublished(root))!.find(a=>a.id==='hill')!.recipe).toMatchObject({height:3});
  const published=await store.dispatch({op:'asset.publish',id:'hill',expectedRevision:2}) as AssetDefinition;
  expect(published.revision).toBe(3);expect(JSON.parse(await readFile(path.join(root,'assets/authoring/catalogue.json'),'utf8')).find((a:{id:string})=>a.id==='hill').recipe.height).toBe(8);
  await expect(store.dispatch({op:'asset.publish',id:'hill',expectedRevision:2})).rejects.toThrow('another editor');
 });
 it('keeps edited model files unpublished until explicitly released',async()=>{
  const bytes=Buffer.from('test geometry'),tree=assetDefinitionSchema.parse({...recipe('tree'),recipe:undefined,kind:'tree',usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',bytes:bytes.length,sha256:hash(bytes)}],bindings:{render:[],scenery:[{id:'pine',name:'Pine',category:'foliage',type:'prop',geometry:{role:'geometry',index:1}}]}});
  const root=await mkdtemp(path.join(os.tmpdir(),'asset-publish-model-'));roots.push(root);await atomic(path.join(root,'art/assets/tree/geometry.glb'),bytes);await saveJson(path.join(root,'art/assets/tree/asset.json'),tree);await saveJson(path.join(root,'art/assets/hill/asset.json'),recipe());
  await commitFiles(root,(await planPublication(root,[tree,recipe()],new Set(['tree','hill']))).writes);
  const modelIndex=JSON.parse(await readFile(path.join(root,'assets/authoring/models.json'),'utf8'));expect(modelIndex).toEqual([{id:'tree',transform:tree.transform,geometry:['assets/library/tree/geometry.glb'],scenery:['pine']}]);
  await atomic(path.join(root,'art/assets/tree/geometry.glb'),Buffer.from('unfinished edits'));
  const store=new AuthoringStore(root);await store.dispatch({op:'asset.publish',id:'hill',expectedRevision:1});
  expect(await readFile(path.join(root,'assets/library/tree/geometry.glb'))).toEqual(bytes);
  const before=await readFile(path.join(root,RELEASE_PATH));await expect(store.dispatch({op:'asset.publish',id:'tree',expectedRevision:1})).rejects.toThrow('damaged resource');expect(await readFile(path.join(root,RELEASE_PATH))).toEqual(before);
 });
 it('rejects dependency removal and wrong-kind links without changing either index',async()=>{
  const water=assetDefinitionSchema.parse({...recipe('water'),kind:'water-profile',recipe:undefined,water:{shallowColor:'#456789',deepColor:'#123456',clarity:1,rippleScale:.1,rippleStrength:.1,foamStrength:.1,reflectionStrength:.1,causticStrength:.1,cloudStrength:.1,flowSpeed:1}});
  const river=assetDefinitionSchema.parse({...recipe('river'),recipe:{type:'river',water:'water',width:4,depth:2,bankWidth:1,flow:1,maxUphillGrade:0}});
  const {root,store}=await fixture([water,river]);const before=await readFile(path.join(root,RELEASE_PATH));
  await expect(store.dispatch({op:'asset.archive',id:'water',expectedRevision:1})).rejects.toThrow('requires published asset water');expect((await store.get('water')).status).toBe('published');expect(await readFile(path.join(root,RELEASE_PATH))).toEqual(before);
  await expect(planPublication(root,[recipe('water'),river],new Set())).rejects.toThrow('water-profile');
  await store.dispatch({op:'asset.archive',id:'river',expectedRevision:1});await store.dispatch({op:'asset.archive',id:'water',expectedRevision:1});expect(await readPublished(root)).toEqual([]);expect((await store.get('river')).status).toBe('archived');
 });
 it('refuses to archive recipes still referenced by authored maps',async()=>{
  const {root,store}=await fixture();await saveJson(path.join(root,'assets/maps/showcase/used.utcmap'),{stamps:[],authoring:{layers:[{recipe:'hill'}],objects:[]}});
  await expect(store.dispatch({op:'asset.archive',id:'hill',expectedRevision:1})).rejects.toThrow('used.utcmap still uses hill');
  expect((await readPublished(root))![0]!.id).toBe('hill');
 });
 it('serializes competing editor instances before optimistic revision checks',async()=>{
  const {root,store}=await fixture(),other=new AuthoringStore(root);
  const outcomes=await Promise.allSettled([store.dispatch({op:'asset.save',definition:{...recipe(),name:'First'},expectedRevision:1}),other.dispatch({op:'asset.save',definition:{...recipe(),name:'Second'},expectedRevision:1})]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await store.get('hill')).revision).toBe(2);
 });
 it('rolls back authoring revision, metadata and catalogue on a failed transaction',async()=>{
  const {root}=await fixture(),before=await readFile(path.join(root,RELEASE_PATH));const next={...recipe(),revision:2,name:'New name'},plan=await planPublication(root,[next],new Set(['hill']));
  let count=0;await expect(commitFiles(root,[{path:'art/assets/hill/asset.json',bytes:Buffer.from(JSON.stringify(next))},...plan.writes],async(file,bytes)=>{if(++count===4)throw Error('disk failure');await atomic(file,bytes);})).rejects.toThrow('disk failure');
  expect(JSON.parse(await readFile(path.join(root,'art/assets/hill/asset.json'),'utf8')).revision).toBe(1);expect(await readFile(path.join(root,RELEASE_PATH))).toEqual(before);
  expect((await planPublication(root,(await readPublished(root))!,new Set())).writes).toEqual([]);
 });
});
