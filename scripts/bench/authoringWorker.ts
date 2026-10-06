/** Measure persistent compiler work AND structured-clone delivery separately.
 * No browser/GPU claim. Never modifies the map. Run: node --import tsx scripts/bench/authoringWorker.ts
 */
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {AuthoringTransferEncoder,AuthoringTransferDecoder} from '../../src/shared/authoring/worker/transfer';

// Runtime samplers contain closures. Send their source data, as a future browser
// transport must, rather than quietly omitting the terrain/paint payload.
function snapshot(scene:CompiledMapScene){
 const {source,sourceWater,courseWater,walkSurface,...field}=scene.field;
 return {field,generated:scene.generated,stamps:scene.stamps,resources:scene.resources,owners:scene.owners};
}
function bytes(value:unknown,seen=new Set<unknown>()):number{
 if(!value||typeof value!=='object'||seen.has(value))return 0;seen.add(value);
 if(ArrayBuffer.isView(value))return bytes(value.buffer,seen);
 if(value instanceof ArrayBuffer)return value.byteLength;
 return Object.values(value).reduce<number>((sum,item)=>sum+bytes(item,seen),0);
}
function move(map:UtcMap,step:number):UtcMap{
 const object=map.authoring?.objects.find(o=>!o.locked&&!o.bakedPlacement);if(!object)throw Error('Map needs an editable object');
 return {...map,authoring:{...map.authoring!,objects:map.authoring!.objects.map(o=>o.id===object.id?(editKind==='rotate'?{...o,yaw:o.yaw+(step%2?.2:-.2)}:{...o,x:o.x+(step%2?2:-2),z:o.z+(step%2?2:-2)}):o)}};
}
const now=()=>performance.timeOrigin+performance.now();
const editKind=process.env.BENCH_EDIT==='rotate'?'rotate':'move';
const incremental=process.env.BENCH_TRANSPORT==='delta';
if(!isMainThread){
 let map:UtcMap,scene:CompiledMapScene;
 const encoder=new AuthoringTransferEncoder();
 parentPort!.on('message',(request:{map?:UtcMap;step:number})=>{
  try{
   const start=now(),next=request.map??move(map,request.step);
   scene=request.map?compileMapScene(next,landscapeAssets):updateMapScene(map,next,scene,landscapeAssets);map=next;
   const compiled=now(),value=snapshot(scene),encoded=incremental?encoder.encode(value):undefined,publish=now();
   const message={type:'scene',step:request.step,value:encoded?.packet??value,started:start,compiled,publish};
   if(encoded)parentPort!.postMessage(message,encoded.transfer);else parentPort!.postMessage(message);
   parentPort!.postMessage({type:'sent',step:request.step,postMessageMs:now()-publish});
  }catch(error){parentPort!.postMessage({type:'error',error:String(error)});}
 });
 parentPort!.postMessage({type:'ready'});
}else{
 void main().catch(error=>{console.error(error);process.exitCode=1;});
}
async function main(){
 const path=process.argv[2]??'assets/maps/skirmish/amberwake-basin.utcmap';
 const initial=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!initial)throw Error('Invalid map');
 const worker=new Worker(new URL('./authoring-worker.cjs',import.meta.url)),samples:unknown[]=[];
 const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  await new Promise<void>((resolve,reject)=>{worker.once('message',message=>message.type==='ready'?resolve():reject(Error('Worker did not initialize')));worker.once('error',reject);});
  let localMap=initial,localScene:CompiledMapScene|undefined;
  const decoder=new AuthoringTransferDecoder();
  for(let step=0;step<7;step++){
   let last=now();const gaps:number[]=[];
   const timer=setInterval(()=>{const time=now();gaps.push(time-last);last=time;},8);
   try{
    await wait(24);
    const sent=now();
    const reply=await new Promise<{message:any;received:number;postMessageMs:number}>((resolve,reject)=>{
     let message:any,received=0;
     const onError=(error:Error)=>{cleanup();reject(error);};
     const cleanup=()=>{worker.off('message',onMessage);worker.off('error',onError);};
     const onMessage=(data:any)=>{
      if(data.type==='error'){onError(Error(data.error));return;}
      if(data.step!==step)return;
      if(data.type==='scene'){message=data;received=now();}
      if(data.type==='sent'){cleanup();resolve({message,received,postMessageMs:data.postMessageMs});}
     };
     worker.on('message',onMessage);worker.once('error',onError);
     worker.postMessage(step?{step}:{step,map:initial});
    });
    const {message,received,postMessageMs}=reply;
    let yieldAt=performance.now();
    const yieldTask=async()=>{if(performance.now()-yieldAt>4){await wait(0);yieldAt=performance.now();}};
    const decodeStart=now(),value=incremental?await decoder.decode(message.value,yieldTask):message.value,decodeMs=now()-decodeStart;
    await wait(24);clearInterval(timer);
    samples.push({step,compileMs:message.compiled-message.started,encodeMs:message.publish-message.compiled,postMessageMs,deliveryMs:received-message.publish,decodeMs,roundTripMs:received-sent+decodeMs,parentMaxHeartbeatGapMs:Math.max(...gaps),parentHeartbeatSamples:gaps.length,transferredArrayBytes:bytes(message.value),snapshotArrayBytes:bytes(value)});
    // Correctness work is outside the heartbeat/timing window. Compare every
    // reply, including alternate moves, to the real main-thread compiler.
    const next:UtcMap=step?move(localMap,step):initial;
    localScene=localScene?updateMapScene(localMap,next,localScene,landscapeAssets):compileMapScene(next,landscapeAssets);localMap=next;
    assert.deepEqual(value,snapshot(localScene));
    console.error(`Step ${step}: ${JSON.stringify(samples.at(-1))}`);
   }finally{clearInterval(timer);}
  }
  console.log(JSON.stringify({map:path,editKind,transport:incremental?'record deltas and transferable buffer references':'structured clone of complete compiled scene',identicalOutput:true,heartbeatIntervalMs:8,samples},null,2));
 }finally{await worker.terminate();}
}
