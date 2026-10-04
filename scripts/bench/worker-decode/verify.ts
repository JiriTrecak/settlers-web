import raw from '../../../assets/maps/skirmish/heartroot-glade.utcmap?raw';
import {parseUtcMap} from '../../../src/shared/map/utcmap';
import type {CompileReply} from '../../../src/shared/authoring/worker/protocol';
import {AuthoringTransferDecoder,type Packet} from '../../../src/shared/authoring/worker/transfer';
import {TaskYield} from '../../../src/shared/authoring/worker/taskYield';
import {createMapCompiler} from '../../../src/shared/authoring/worker/client';

const button=document.querySelector<HTMLButtonElement>('#run')!,status=document.querySelector('#status')!,result=document.querySelector('#result')!;
const edits=document.querySelector<HTMLButtonElement>('#edits')!;
const timerTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
// Exact recursive comparison outside timing windows, including signed zero and
// every terrain-buffer element. No JSON rounding or sampled checksums.
function equal(a:any,b:any):boolean{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(a instanceof Float32Array||b instanceof Float32Array){
  if(!(a instanceof Float32Array)||!(b instanceof Float32Array)||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))return false;return true;
 }
 if(a instanceof Map||b instanceof Map){
  return a instanceof Map&&b instanceof Map&&a.size===b.size&&equal([...a],[...b]);
 }
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
}
async function measure(packet:Packet,kind:'timer'|'task'){
 const tasks=new TaskYield(),decoder=new AuthoringTransferDecoder();
 let began=performance.now(),slice=began,last=began,maxSliceMs=0,maxHeartbeatGapMs=0,yields=0,waitMs=0;
 const heartbeat=setInterval(()=>{const t=performance.now();maxHeartbeatGapMs=Math.max(maxHeartbeatGapMs,t-last);last=t;},8);
 const yieldTask=async()=>{
  const now=performance.now();maxSliceMs=Math.max(maxSliceMs,now-slice);
  if(now-slice>4){yields++;if(kind==='timer')await timerTask();else await tasks.next();slice=performance.now();waitMs+=slice-now;}
 };
 try{
  const value=await decoder.decode(packet,yieldTask),finished=performance.now();
  maxSliceMs=Math.max(maxSliceMs,finished-slice);
  return {value,timing:{kind,wallMs:finished-began,waitMs,maxSliceMs,maxHeartbeatGapMs,yields}};
 }finally{clearInterval(heartbeat);tasks.dispose();}
}
button.onclick=async()=>{
 button.disabled=edits.disabled=true;result.textContent='';status.textContent='Compiling Heartroot in a real worker…';
 const worker=new Worker(new URL('../../../src/shared/authoring/worker/entry.ts',import.meta.url),{type:'module'});
 try{
  const map=parseUtcMap(JSON.parse(raw));if(!map)throw Error('Invalid benchmark map');
  const reply=await new Promise<CompileReply>((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:1,patch:map});});
  if('error' in reply)throw Error(reply.error);
  const timings=[];let baseline:unknown;
  for(let round=0;round<3;round++)for(const kind of (round%2?['task','timer']:['timer','task']) as ('timer'|'task')[]){
   status.textContent=`Decoding round ${round+1}: ${kind}`;
   const sample=await measure(reply.packet,kind);
   if(baseline===undefined)baseline=sample.value;else if(!equal(baseline,sample.value))throw Error('Decoded scene differs');
   timings.push({round,...sample.timing});
   result.textContent=JSON.stringify({compileMs:reply.compileMs,encodeMs:reply.encodeMs,identical:true,timings},null,2);
   await timerTask();
  }
  status.textContent='Passed: all six decodes are identical.';
 }catch(error){status.textContent=String(error);}finally{worker.terminate();button.disabled=edits.disabled=false;}
};

edits.onclick=async()=>{
 button.disabled=edits.disabled=true;result.textContent='';
 const client=createMapCompiler();
 try{
  const map=parseUtcMap(JSON.parse(raw)),object=map?.authoring?.objects.find(o=>!o.locked&&!o.bakedPlacement);
  if(!map?.authoring||!object)throw Error('Benchmark map requires an editable object');
  status.textContent='Loading through the production compiler client…';
  const initial=await client.compile(map),timings=[{kind:'load',...client.timings}];
  for(let step=0;step<6;step++){
   status.textContent=`Rotation ${step+1} through the production compiler client…`;
   const next=step%2?map:{...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>o.id===object.id?{...o,yaw:o.yaw+.2}:o)}};
   const scene=await client.compile(next);
   if(scene.field!==initial.field||scene.generated?.objects!==initial.generated?.objects)throw Error('Pose edit regenerated immutable landscape');
   if(step%2&&(!equal(scene.stamps,initial.stamps)||!equal(scene.resources,initial.resources)||!equal(scene.owners,initial.owners)))throw Error('Undo differs from initial scene');
   timings.push({kind:step%2?'undo':'rotate',...client.timings});
   result.textContent=JSON.stringify({map:map.name,objects:initial.generated?.objects.length,identicalUndo:true,reusedLandscape:true,timings},null,2);
  }
  status.textContent='Passed: production client edits and undo preserve the landscape.';
 }catch(error){status.textContent=String(error);}finally{client.dispose();button.disabled=edits.disabled=false;}
};
