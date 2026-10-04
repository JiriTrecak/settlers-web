/** CPU cache/restore regression benchmark. Uses the real compact transport with
 * structured cloning, but an in-memory store; browser IDB/startup is measured by
 * editor_performance. Does not measure GPU time or disk latency. */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {MapCompilerRuntime} from '../../src/shared/authoring/worker/runtime';
import {sceneCacheKey,packedSceneEntry,type SceneCache} from '../../src/shared/authoring/worker/cache';
import {AuthoringTransferEncoder,AuthoringTransferDecoder,type Packet} from '../../src/shared/authoring/worker/transfer';
import {SceneSnapshotReader,type SceneSnapshot} from '../../src/shared/authoring/worker/scene';
import {landscapeAssets} from '../../src/shared/authoring/project';

const reports=[];
for(const path of process.argv.slice(2)){
 const map=parseUtcMap(JSON.parse(await readFile(path,'utf8')));assert(map,`Invalid map: ${path}`);
 let stored:{key:string;packet:Packet}|undefined;
 const cache:SceneCache={
  key:map=>sceneCacheKey(map,'benchmark'),
  read:async key=>stored?.key===key?packedSceneEntry(structuredClone(stored.packet)):undefined,
  write:async(key,snapshot)=>{stored={key,packet:structuredClone(new AuthoringTransferEncoder().encode(snapshot).packet)};},
 };
 const decode=async(result:Awaited<ReturnType<MapCompilerRuntime['compileCached']>>)=>{
  assert(!('error' in result.reply));
  return new SceneSnapshotReader(landscapeAssets).read(await new AuthoringTransferDecoder().decode(structuredClone(result.reply.packet,{transfer:result.transfer}),async()=>{}) as SceneSnapshot,map);
 };
 const cold=await new MapCompilerRuntime().compileCached({id:1,patch:map},cache);
 const direct=await decode(cold);assert(cold.persist);await cold.persist();
 const warm=await new MapCompilerRuntime().compileCached({id:1,patch:structuredClone(map)},cache),restored=await decode(warm);
 assert(!('error' in cold.reply));assert(!('error' in warm.reply));assert.equal(warm.reply.cache?.status,'hit');
 assert.deepStrictEqual(restored.generated,direct.generated);assert.deepStrictEqual(restored.stamps,direct.stamps);assert.deepStrictEqual(restored.resources,direct.resources);assert.deepStrictEqual(restored.owners,direct.owners);
 assert.deepStrictEqual(restored.field.samples,direct.field.samples);
 for(let z=0;z<=map.size;z+=7)for(let x=0;x<=map.size;x+=7){assert.equal(restored.field.sample(x,z),direct.field.sample(x,z));assert.equal(restored.field.waterAt(x,z),direct.field.waterAt(x,z));}
 reports.push({map:map.name,objects:restored.generated?.objects.length,coldCompileMs:cold.reply.compileMs,coldEncodeMs:cold.reply.encodeMs,warmLookupMs:warm.reply.cache.lookupMs,warmEncodeMs:warm.reply.encodeMs,exact:true});
}
console.log(JSON.stringify({scope:'CPU only; compact in-memory storage, no IDB or GPU',maps:reports},null,2));
