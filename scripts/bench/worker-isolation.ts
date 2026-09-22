/** Actual worker entry and transferable snapshot protocol, with a parent-loop
 * heartbeat instead of a renderer. This measures isolation, not browser FPS. */
import {Worker} from 'node:worker_threads';
import {readFileSync,writeFileSync} from 'node:fs';
import {SimulationClient} from '../../src/session/worker/client';
import type {WorkerInput,WorkerOutput} from '../../src/session/worker/protocol';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';

const args=process.argv.slice(2),option=(key:string,fallback:string)=>args[args.indexOf(key)+1]??fallback;
const ticks=Number(args.includes('--ticks')?option('--ticks','12000'):'12000');
const output=args.includes('--output')?option('--output','/tmp/worker-isolation.json'):'/tmp/worker-isolation.json';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/threewater-forest.utcmap','utf8')))!;
const match=localMatch({mapId:'threewater-forest',mapRevision:'benchmark',seed:731942,slotCount:map.playerStarts.length,me:0});match.slots.forEach(s=>{s.kind='ai';s.team=s.player;});
const worker=new Worker(new URL('../../tests/session/fixtures/simulation-worker.cjs',import.meta.url),{workerData:{benchmark:{ticks}}});
const samples:Record<string,number[]>={},add=(key:string,value:number)=>(samples[key]??=[]).push(value);
const stats=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
let done:(value:{samples:number[];checksum:number;tick:number;routing:unknown})=>void,failed:(error:Error)=>void;
const complete=new Promise<{samples:number[];checksum:number;tick:number;routing:unknown}>((resolve,reject)=>{done=resolve;failed=reject;});
const port={postMessage:(message:WorkerInput)=>worker.postMessage(message),terminate:()=>{void worker.terminate();},onmessage:null as ((e:MessageEvent<WorkerOutput>)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,onmessageerror:null as ((e:MessageEvent)=>void)|null};
let warm=false,frames=0,entityUpdates=0,fogBytes=0;
worker.on('error',error=>failed(error instanceof Error?error:new Error(String(error))));
worker.on('message',message=>{
 if(message.type==='benchmark-complete'){done(message);return;}
 const begin=performance.now();
 if(message.type==='frame'&&message.packet.tick>=200){
  warm=true;frames++;entityUpdates+=message.packet.visual.entities.length;
  const f=message.packet.visual.fog;for(const b of [f?.cells,f?.floors?.cells])if(b)fogBytes+=('full' in b?b.full.byteLength:b.changes.byteLength);
 }
 port.onmessage?.({data:message} as MessageEvent<WorkerOutput>);
 if(warm)add('parentMessageHandler',performance.now()-begin);
});
const client=new SimulationClient({frame:frame=>{if(frame.tick>=200){for(const key of ['projection','encode'])add('worker '+key,frame.timings[key]??0);}},chat:()=>{},learned:()=>{},error:failed!,sample:(name,ms)=>{if(warm)add(name,ms);}},undefined,port);
const start=performance.now();let timer:ReturnType<typeof setInterval>|undefined;
try{
 await client.request('init',{map,match,player:null,remote:false});
 await client.request('configure',{speed:4,reveal:true,visionPlayer:0});
 let last=performance.now();timer=setInterval(()=>{const now=performance.now();if(warm)add('parentHeartbeatInterval',now-last);last=now;},8);
 await client.request('start',undefined);
 const result=await complete;
 const report={map:'threewater-forest',seed:731942,speed:4,ticks:result.tick,checksum:result.checksum,wallMs:performance.now()-start,
  simulation:stats(result.samples),timings:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,stats(values)])),frames,entityUpdates,fogBytes,routing:result.routing,
  note:'Node worker using production entry/protocol; 8 ms parent heartbeat, no GPU or browser rendering. Tick samples include worker-owned lockstep/receipts. Snapshot timings are per publication at most 40 Hz, not per accelerated tick.'};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(timer)clearInterval(timer);client.stop();}
