import {Worker} from 'node:worker_threads';
import {expect,it} from 'vitest';
import {MapCompilerClient} from '../../src/shared/authoring/worker/client';
import type {CompilerPort} from '../../src/shared/authoring/worker/protocol';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralFixture} from './fixture';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';

function create(){
 const worker=new Worker(new URL('./fixtures/compiler-worker.cjs',import.meta.url));
 const port:CompilerPort={postMessage:m=>worker.postMessage(m),terminate:()=>{void worker.terminate();},onmessage:null,onerror:null,onmessageerror:null};
 worker.on('message',data=>port.onmessage?.({data} as MessageEvent));
 worker.on('error',error=>port.onerror?.({message:error instanceof Error?error.message:String(error)} as ErrorEvent));
 worker.on('messageerror',()=>port.onmessageerror?.({} as MessageEvent));
 return {client:new MapCompilerClient(port),worker};
}
it('delivers real compilations with live height/water samplers, queues edits, and recovers from invalid commands',async()=>{
 const {client,worker}=create();
 try{
  const base=proceduralFixture(),map={...base,authoring:authoringSceneSchema.parse({...base.authoring,objects:[{id:'oak',asset:'asset.models.environment.canopy-oak',x:110,z:120}]})};
  const first=await client.compile(map),direct=compileMapScene(map,landscapeAssets);
  expect(first.generated).toEqual(direct.generated);expect(first.stamps).toEqual(direct.stamps);expect(first.owners).toEqual(direct.owners);
  for(const [x,z] of [[0,0],[110,120],[127,129],[150,140]]){expect(first.field.sample(x,z)).toBe(direct.field.sample(x,z));expect(first.field.waterAt(x,z)).toBe(direct.field.waterAt(x,z));}
  const rotated={...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>({...o,yaw:1}))}};
  const moved={...rotated,authoring:{...rotated.authoring,objects:rotated.authoring.objects.map(o=>({...o,x:115,z:125}))}};
  const [pose,move,undo]=await Promise.all([client.compile(rotated),client.compile(moved),client.compile(map)]);
  expect(pose.field).toBe(first.field);expect(move.generated?.terrain).toBe(first.generated?.terrain);
  expect(move.generated?.paint).toBe(first.generated?.paint);expect(move.field.surfacePaint).toBe(move.generated?.paint);
  expect(move.generated).toEqual(compileMapScene(moved,landscapeAssets).generated);expect(undo.generated).toEqual(direct.generated);
  await expect(client.compile({...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>({...o,asset:'missing.asset'}))}})).rejects.toThrow('published scenery');
  expect((await client.compile(rotated)).stamps).toEqual(pose.stamps);
  expect(client.timings?.roundTripMs).toBeGreaterThan(0);
 }finally{client.dispose();await worker.terminate();}
},15000);

it('rejects queued requests on disposal and never publishes their scenes',async()=>{
 const {client,worker}=create();
 const pending=Promise.allSettled([client.compile(proceduralFixture()),client.compile(proceduralFixture())]);
 await Promise.resolve();client.dispose(new Error('Map replaced'));
 const results=await pending;expect(results.map(r=>r.status)).toEqual(['rejected','rejected']);
 expect(results.every(r=>r.status==='rejected'&&r.reason.message==='Map replaced')).toBe(true);
 await worker.terminate();
});

it('retains dependency provenance for safe edits to worker-decoded scenes',async()=>{
 const {client,worker}=create();
 try{
  const base=proceduralFixture(),map={...base,authoring:authoringSceneSchema.parse({...base.authoring,objects:[{id:'oak',asset:'asset.models.environment.canopy-oak',x:110,z:120}]})};
  const received=await client.compile(map);
  const {updateMapScene}=await import('../../src/shared/authoring/updateMapScene');
  const {reusableMapSurface}=await import('../../src/shared/authoring/mapScene');
  const pose={...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>({...o,yaw:1}))}};
  const edited=updateMapScene(map,pose,received,landscapeAssets);
  expect(edited.field).toBe(received.field);
  expect(edited.generated).toEqual(compileMapScene(pose,landscapeAssets).generated);
  expect(reusableMapSurface({...pose,waterLevel:(pose.waterLevel??0)+1},landscapeAssets,received)).toBeUndefined();
  expect(reusableMapSurface(pose,[...landscapeAssets],received)).toBeUndefined();
  const changed={...pose,waterLevel:(pose.waterLevel??0)+1};
  const rebuilt=updateMapScene(pose,changed,edited,landscapeAssets),fresh=compileMapScene(changed,landscapeAssets);
  expect(rebuilt.field).not.toBe(received.field);expect(rebuilt.field.samples).toEqual(fresh.field.samples);expect(rebuilt.generated).toEqual(fresh.generated);
 }finally{client.dispose();await worker.terminate();}
},15000);
