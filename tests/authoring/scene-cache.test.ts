import {expect,it} from 'vitest';
import {MapCompilerRuntime} from '../../src/shared/authoring/worker/runtime';
import {sceneCacheKey,packedSceneEntry,type SceneCache} from '../../src/shared/authoring/worker/cache';
import {AuthoringTransferDecoder,AuthoringTransferEncoder} from '../../src/shared/authoring/worker/transfer';
import {SceneSnapshotReader,type SceneSnapshot} from '../../src/shared/authoring/worker/scene';
import {compileMapScene,reusableMapSurface} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';
import type {UtcMap} from '../../src/shared/map/utcmap';

function memory(packed=false){
 const entries=new Map<string,unknown>();let writes=0,reads=0;
 const cache:SceneCache={key:map=>sceneCacheKey(map,'compiler-a'),read:async key=>{reads++;return structuredClone(entries.get(key));},write:async(key,snapshot)=>{writes++;entries.clear();entries.set(key,structuredClone(packed?packedSceneEntry(new AuthoringTransferEncoder().encode(snapshot).packet):snapshot));}};
 return {cache,entries,get writes(){return writes;},get reads(){return reads;}};
}
function receiver(){
 const decoder=new AuthoringTransferDecoder(),reader=new SceneSnapshotReader(landscapeAssets);
 return async(result:Awaited<ReturnType<MapCompilerRuntime['compileCached']>>,map:UtcMap)=>{
  if('error' in result.reply)throw Error(result.reply.error);
  return reader.read(await decoder.decode(structuredClone(result.reply.packet,{transfer:result.transfer}),async()=>{}) as SceneSnapshot,map);
 };
}
function check(scene:ReturnType<typeof compileMapScene>,map:UtcMap){
 const fresh=compileMapScene(map,landscapeAssets);
 expect(scene.generated).toEqual(fresh.generated);expect(scene.stamps).toEqual(fresh.stamps);expect(scene.resources).toEqual(fresh.resources);expect(scene.owners).toEqual(fresh.owners);expect(scene.field.samples).toEqual(fresh.field.samples);
 for(const [x,z] of [[0,0],[110,120],[127,129],[150,140]]){expect(scene.field.sample(x,z)).toBe(fresh.field.sample(x,z));expect(scene.field.waterAt(x,z)).toBe(fresh.field.waterAt(x,z));}
}
it.each([false,true])('restores a persisted world exactly, then supports edits and undo (packed=%s)',async packed=>{
 const base=proceduralFixture(),map={...base,authoring:authoringSceneSchema.parse({...base.authoring,objects:[{id:'oak',asset:'asset.models.environment.canopy-oak',x:110,z:120}]})};
 const store=memory(packed),cold=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);
 expect(cold.reply).toMatchObject({cache:{status:'miss'}});expect(store.writes).toBe(0);
 await receiver()(cold,map);await cold.persist!();expect(store.writes).toBe(1);
 const runtime=new MapCompilerRuntime(),receive=receiver(),warm=await runtime.compileCached({id:1,patch:structuredClone(map)},store.cache);
 expect(warm.reply).toMatchObject({compileMs:0,cache:{status:'hit'}});expect(warm.persist).toBeUndefined();
 const first=await receive(warm,map);check(first,map);expect(reusableMapSurface(map,landscapeAssets,first)).toBeDefined();
 const pose={...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>({...o,yaw:1}))}};
 const posed=await receive(await runtime.compileCached({id:2,patch:{authoring:pose.authoring}},store.cache),pose);
 expect(posed.field).toBe(first.field);check(posed,pose);
 const moved={...pose,authoring:{...pose.authoring,objects:pose.authoring.objects.map(o=>({...o,x:116,z:125}))}};
 check(await receive(await runtime.compileCached({id:3,patch:{authoring:moved.authoring}},store.cache),moved),moved);
 const flooded={...moved,waterLevel:3};
 check(await receive(await runtime.compileCached({id:4,patch:{waterLevel:3}},store.cache),flooded),flooded);
 check(await receive(await runtime.compileCached({id:5,patch:map},store.cache),map),map);
 expect(store.reads).toBe(2);expect(store.writes).toBe(1);
},15000);
it('keys every map input and compiler revision without JSON ambiguities',async()=>{
 const map=proceduralFixture(),key=await sceneCacheKey(map,'a');
 expect(await sceneCacheKey(structuredClone(map),'a')).toBe(key);
 for(const changed of [{...map,waterLevel:2},{...map,biome:'frost'},{...map,name:'renamed'},{...map,height:'changed-height-data'}])expect(await sceneCacheKey(changed,'a')).not.toBe(key);
 expect(await sceneCacheKey(map,'b')).not.toBe(key);
 const hash=(value:unknown)=>sceneCacheKey({...map,extra:value} as UtcMap,'a');
 const keys=await Promise.all([undefined,null,-0,0,NaN,'NaN',[undefined],[],{a:undefined},{}].map(hash));
 expect(new Set(keys).size).toBe(keys.length);
});
it('falls back on corrupt snapshots, denied storage and write failures',async()=>{
 const map=proceduralFixture(),store=memory();
 const cold=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);await cold.persist!();
 const key=await store.cache.key(map),snapshot=store.entries.get(key) as SceneSnapshot;
 for(const broken of [{}, {...snapshot,field:{...snapshot.field,samples:new Float32Array(1)}},{...snapshot,owners:[]}]){
  store.entries.set(key,broken);
  const result=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);
  expect(result.reply).toMatchObject({cache:{status:'invalid'}});check(await receiver()(result,map),map);
 }
 store.entries.set(key,{...snapshot,generated:{...snapshot.generated,objects:[null]}});
 const damaged=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);
 expect(damaged.reply).toMatchObject({cache:{status:'unavailable'}});check(await receiver()(damaged,map),map);
 const denied:SceneCache={...store.cache,read:async()=>{throw Error('Denied');},write:async()=>{throw Error('Quota exceeded');}};
 const result=await new MapCompilerRuntime().compileCached({id:1,patch:map},denied);
 expect(result.reply).toMatchObject({cache:{status:'unavailable'}});check(await receiver()(result,map),map);await expect(result.persist!()).resolves.toBeUndefined();
 const disabled=await new MapCompilerRuntime().compileCached({id:1,patch:map});expect(disabled.reply).toMatchObject({cache:{status:'disabled'}});
},15000);
it('does not reuse a snapshot after map or compiler changes',async()=>{
 const map=proceduralFixture(),store=memory();
 const result=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);await result.persist!();
 for(const [input,cache] of [[{...map,waterLevel:2},store.cache],[map,{...store.cache,key:(m:UtcMap)=>sceneCacheKey(m,'compiler-b')}]] as const){
  const rebuilt=await new MapCompilerRuntime().compileCached({id:1,patch:input},cache);
  expect(rebuilt.reply).toMatchObject({cache:{status:'miss'}});check(await receiver()(rebuilt,input),input);
 }
},15000);

it('discards a corrupt packed bootstrap and starts a fresh sequence for compilation',async()=>{
 const map=proceduralFixture(),store=memory(true);
 const cold=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);await cold.persist!();
 const key=await store.cache.key(map),stored=store.entries.get(key) as ReturnType<typeof packedSceneEntry>;
 const damaged=structuredClone(stored);
 // The record decoder can resolve repeated handles, but a complete bootstrap
 // must reject them before they can corrupt the next incremental edit.
 expect(damaged.packet.objects.order!.length).toBeGreaterThan(1);
 damaged.packet.objects.order![1]=damaged.packet.objects.order![0];
 store.entries.set(key,damaged);
 const result=await new MapCompilerRuntime().compileCached({id:1,patch:map},store.cache);
 expect(result.reply).toMatchObject({cache:{status:'unavailable'},packet:{sequence:1}});
 check(await receiver()(result,map),map);
},15000);
