/** One human + three AIs through the production runtime and snapshot codecs.
 * Headless CPU accounting, not browser FPS or IPC latency. In-process transferable
 * structuredClone approximates transport CPU; actual browser delivery/UI still
 * requires a separate trace before claiming the complete non-render budget. */
import {readFileSync,writeFileSync} from 'node:fs';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {localMatch} from '../../src/shared/match/match';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {fingerprint} from '../../src/content/registry';
import type {SimulationTiming} from '../../src/sim/profiling';
const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const mapId=option('--map','heartroot-glade'),ticks=Number(option('--ticks','6000'));
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`,'utf8')));
if(!map||map.playerStarts.length!==4||!Number.isSafeInteger(ticks)||ticks<400)throw Error('Requires a four-player map and >=400 ticks');
const match=localMatch({mapId,mapRevision:fingerprint(map),seed:731942,slotCount:4,me:0});
const runtime=new SimulationRuntime({map,match,player:0,remote:false});
runtime.reveal=false;runtime.profiling=args.includes('--details');
const resume=option('--resume','');if(resume)runtime.restoreLocal(JSON.parse(readFileSync(resume,'utf8')));
const startTick=runtime.world.clock.tickIndex,encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
const series=new Map<string,number[]>(),detail=new Map<string,{inclusiveMs:number;selfMs:number;calls:number;activeTicks:number;maxMs:number}>();
const sample=(key:string,ms:number)=>{let a=series.get(key);if(!a){a=[];series.set(key,a);}a.push(ms);};
const stats=(a:number[])=>{const sorted=[...a].sort((a,b)=>a-b);return {mean:a.reduce((n,v)=>n+v,0)/a.length,p95:sorted[Math.ceil(a.length*.95)-1],p99:sorted[Math.ceil(a.length*.99)-1],max:sorted.at(-1),samples:a.length};};
const windows:unknown[]=[],begin=performance.now();
// Capture the top 1% as complete frames, rather than adding unrelated category
// percentiles. Diagnostic bookkeeping is outside timed CPU and opt-in only.
const tailSize=Math.max(1,Math.ceil((ticks-200)*.01));
const slowTicks:{tick:number;totalMs:number;simulationMs:number;checksumMs:number;projectionMs:number;encodeMs:number;transferMs:number;decodeMs:number;profile:SimulationTiming[]}[]=[];
for(let i=0;i<ticks;i++){
 const start=performance.now();if(runtime.advance(25,1)!==1)throw Error('Local commit did not advance');const advanced=performance.now();
 // Remote matches hash at this cadence. Local matches do not, so account for
 // it explicitly as a network-readiness cost rather than quietly omitting it.
 if(runtime.world.clock.tickIndex%match.checksumEvery===0)runtime.world.checksum();const hashed=performance.now();
 const frame=runtime.project(),projected=performance.now();
 const encoded=encoder.encode(frame),encodedAt=performance.now();
 const received=structuredClone(encoded.packet,{transfer:encoded.transfer}),transferred=performance.now();
 decoder.decode(received);const decoded=performance.now();
 if(i>=200){
  sample('Accounted non-render CPU',decoded-start);sample('Runtime advance',advanced-start);sample('World tick',runtime.timings.simulation!);
  sample('Lockstep and runtime overhead',Math.max(0,advanced-start-runtime.timings.simulation!));
  sample('Network checksum',hashed-advanced);sample('Projection',projected-hashed);sample('Encode',encodedAt-projected);
  if(runtime.world.clock.tickIndex%match.checksumEvery===0)sample('Network checkpoint (per check)',hashed-advanced);
  sample('Transfer clone proxy',transferred-encodedAt);sample('Decode',decoded-transferred);
  for(const [key,ms] of Object.entries(runtime.world.settlement.timings))sample(`Sim · ${key}`,ms);
  const rows=runtime.world.settlement.context.profile.snapshot();
  for(const row of rows){
   const sum=detail.get(row.path)??{inclusiveMs:0,selfMs:0,calls:0,activeTicks:0,maxMs:0};
   sum.inclusiveMs+=row.inclusiveMs;sum.selfMs+=row.selfMs;sum.calls+=row.calls;sum.activeTicks+=Number(row.calls>0);sum.maxMs=Math.max(sum.maxMs,row.inclusiveMs);detail.set(row.path,sum);
  }
  if(runtime.profiling&&(slowTicks.length<tailSize||decoded-start>slowTicks.at(-1)!.totalMs)){
   slowTicks.push({tick:runtime.world.clock.tickIndex,totalMs:decoded-start,simulationMs:runtime.timings.simulation!,checksumMs:hashed-advanced,projectionMs:projected-hashed,encodeMs:encodedAt-projected,transferMs:transferred-encodedAt,decodeMs:decoded-transferred,profile:rows.filter(row=>row.calls>0)});
   slowTicks.sort((a,b)=>b.totalMs-a.totalMs);if(slowTicks.length>tailSize)slowTicks.pop();
  }
 }
 if((i+1)%1200===0){const row={tick:runtime.world.clock.tickIndex,units:runtime.world.settlement.context.liveUnits().length,total:stats(series.get('Accounted non-render CPU')!.slice(-1200))};windows.push(row);console.log(JSON.stringify(row));}
}
const n=ticks-200,profile=[...detail].map(([path,row])=>({path,inclusiveMean:row.inclusiveMs/n,selfMean:row.selfMs/n,callsPerTick:row.calls/n,activeTicks:row.activeTicks,maxMs:row.maxMs})).sort((a,b)=>b.selfMean-a.selfMean);
const tailCosts=new Map<string,{selfMs:number;inclusiveMs:number}>();
for(const tick of slowTicks)for(const row of tick.profile){const cost=tailCosts.get(row.path)??{selfMs:0,inclusiveMs:0};cost.selfMs+=row.selfMs;cost.inclusiveMs+=row.inclusiveMs;tailCosts.set(row.path,cost);}
const tailProfile=[...tailCosts].map(([path,row])=>({path,selfMean:row.selfMs/slowTicks.length,inclusiveMean:row.inclusiveMs/slowTicks.length})).sort((a,b)=>b.selfMean-a.selfMean);
const report={map:mapId,mapFingerprint:fingerprint(map),contentFingerprint:runtime.world.settlement.registry.fingerprint,slots:runtime.match.slots,
 workload:'Human slot idle; three real AI controllers. Startup baseline, not a four-army human battle acceptance test.',
 coverage:'Runtime + periodic network checksum + production projection/encode/decode + in-process transfer clone. Excludes browser IPC, main-thread UI/input and rendering. Inclusive parents overlap children; sum self times only.',
 details:runtime.profiling,startTick,endTick:runtime.world.clock.tickIndex,ticks,warmupTicks:200,budgetMs:3,budgetPercentile:99,checkpointBudgetMs:.1,wallMs:performance.now()-begin,
 runtime:{node:process.version,platform:process.platform,arch:process.arch},timings:Object.fromEntries([...series].map(([k,a])=>[k,stats(a)])),profile,tailProfile,slowTicks,windows,
 checksum:runtime.world.checksum(),fullAuditChecksum:runtime.world.checksum('full'),outcome:runtime.world.settlement.state.outcome,entities:runtime.world.settlement.state.entities.length,units:runtime.world.settlement.context.liveUnits().length,ai:runtime.world.aiSummary(),routing:runtime.world.settlement.spatial.routing};
const save=option('--save','');if(save)writeFileSync(save,JSON.stringify(runtime.snapshotLocal()));
runtime.destroy();const path=option('--output','/tmp/match-budget.json');writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify({path,total:report.timings['Accounted non-render CPU']}));
