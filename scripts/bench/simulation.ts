/** Deterministic map-scale CPU benchmark. No browser/GPU timing is implied. */
import {readFileSync,writeFileSync} from 'node:fs';
import {World} from '../../src/sim/world/world';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {fingerprint} from '../../src/content/registry';
import {Session} from 'node:inspector';
import {PerformanceObserver} from 'node:perf_hooks';
const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const mapId=option('--map','threewater-forest'),ticks=Number(option('--ticks','12000'));
// Optional headless real-time cadence: permits event-loop/GC idle work between
// ticks. This still measures no rendering, browser scheduling or network latency.
const paceMs=Number(option('--pace-ms','0'));
if(!Number.isFinite(paceMs)||paceMs<0||paceMs>1000)throw Error('--pace-ms must be between 0 and 1000');
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`,'utf8')))!;
if(!map||!Number.isSafeInteger(ticks)||ticks<400)throw Error('Choose a valid map and at least 400 ticks');
const gcEvents:{startTime:number;duration:number;kind:number}[]=[];
const gcObserver=args.includes('--gc-report')?new PerformanceObserver(list=>{
 for(const entry of list.getEntries())gcEvents.push({startTime:entry.startTime,duration:entry.duration,kind:(entry as unknown as {detail:{kind:number}}).detail.kind});
}):undefined;
gcObserver?.observe({entryTypes:['gc']});
const start=performance.now(),cpuStart=process.cpuUsage();
const resume=option('--resume',''),saved=resume?JSON.parse(readFileSync(resume,'utf8')):null;
const world=new World({map,slots:saved?.slots??map.playerStarts.map((_,i)=>({player:i,kind:'ai',team:i})),seed:731942});
if(saved)world.restore(saved);
// Profile one known expensive tick without collecting minutes of unrelated samples.
const profileTick=Number(option('--profile-tick','-1'));
const profileOutput=option('--profile-output','/tmp/simulation-tick.cpuprofile');
let profiler:Session|undefined;
if(profileTick!==-1){
 if(!Number.isSafeInteger(profileTick)||profileTick<=world.clock.tickIndex||profileTick>world.clock.tickIndex+ticks)throw Error('--profile-tick must fall inside this run');
 profiler=new Session();profiler.connect();
 await new Promise<void>((resolve,reject)=>profiler!.post('Profiler.enable',error=>error?reject(error):resolve()));
}
const sightOutput=option('--trace-sight',''),sightQueries:number[][]=[],sightStart=world.clock.tickIndex+200;
if(sightOutput){
 const terrain=world.settlement.spatial.tactical,visible=terrain.visible.bind(terrain);
 terrain.visible=(a,b)=>{const result=visible(a,b);
  if(world.clock.tickIndex>=sightStart&&sightQueries.length<200000)sightQueries.push([a.x,a.y,a.elevation??0,b.x,b.y,b.elevation??0,+result]);
  return result;
 };
}
const checkpoint=Number(option('--checkpoint','-1'));
const checkpointOutput=option('--checkpoint-output','/tmp/simulation-checkpoint.json');
let navCalls=0,navMs=0;
const traceTick=Number(option('--trace-tick','-1'));
if(args.includes('--trace-navigation')||args.includes('--trace-routes')) {
 // Real matches use body-specific navigation and layered routes through findPath.
 // Instrumenting the default Navigation alone silently missed those searches.
 const spatial=world.settlement.spatial, path=spatial.findPath.bind(spatial);
 spatial.findPath=(...parameters:Parameters<typeof path>)=>{
  const expanded=spatial.routing.expanded,start=performance.now(),result=path(...parameters),ms=performance.now()-start;
  navCalls++; navMs+=ms;
  if(ms>20||world.clock.tickIndex===traceTick)console.log(JSON.stringify({navigationMs:ms,tick:world.clock.tickIndex,start:parameters[0],goal:parameters[1],blocked:parameters[2]?.size??0,maxCost:parameters[3],found:result!==null,expanded:spatial.routing.expanded-expanded}));
  return result;
 };
}
const routeStats=new Map<number,{calls:number;failed:number;ms:number;navigationMs:number;from:unknown;goal:unknown}>();
if(args.includes('--trace-routes')){
 const spatial=world.settlement.spatial,route=spatial.route.bind(spatial);
 spatial.route=(...parameters:Parameters<typeof route>)=>{
  const [entity,destination]=parameters,begin=performance.now(),navigationBefore=navMs,result=route(...parameters),ms=performance.now()-begin;
  const row=routeStats.get(entity.id)??{calls:0,failed:0,ms:0,navigationMs:0,from:entity.unit?.position??{x:entity.x,y:entity.y},goal:destination};
  row.calls++;row.failed+=result?0:1;row.ms+=ms;row.navigationMs+=navMs-navigationBefore;routeStats.set(entity.id,row);return result;
 };
}
const initialize=performance.now()-start,samples:Record<string,number[]>={},windows:unknown[]=[];
// Sample allocations, including objects already collected, rather than just
// retained heap. This diagnostic has overhead: use a separate unprofiled run
// for performance comparisons. Session.connect is local, with no inspector port.
const allocationOutput=option('--allocation-profile','');
const allocationProfiler=allocationOutput?new Session():undefined;
allocationProfiler?.connect();
const sample=(key:string,ms:number)=>(samples[key]??=[]).push(ms);
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};};
let measuredStart=Infinity,measuredEnd=0,nextTickAt=performance.now();
for(let i=0;i<ticks;i++){
 if(paceMs){const delay=nextTickAt-performance.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));}
 if(i===200&&allocationProfiler){
  const parameters={samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true};
  await new Promise<void>((resolve,reject)=>allocationProfiler.post('HeapProfiler.startSampling',parameters,error=>error?reject(error):resolve()));
 }
 navCalls=0;navMs=0;routeStats.clear();
 if(world.clock.tickIndex===checkpoint)writeFileSync(checkpointOutput,JSON.stringify(world.snapshot()));
 if(world.clock.tickIndex+1===profileTick)await new Promise<void>((resolve,reject)=>profiler!.post('Profiler.start',error=>error?reject(error):resolve()));
 const begin=performance.now();world.tick();const simulated=performance.now();
 if(paceMs){if(i>=200)sample('tickStartLateness',Math.max(0,begin-nextTickAt));nextTickAt+=paceMs;}
 world.view();const observed=performance.now();
 if(i===200)measuredStart=begin;
 measuredEnd=observed;
 if(world.clock.tickIndex===profileTick){
  await new Promise<void>((resolve,reject)=>profiler!.post('Profiler.stop',(error,result)=>{if(error){reject(error);return;}writeFileSync(profileOutput,JSON.stringify(result.profile));resolve();}));
  profiler!.disconnect();
 }
 if(args.includes('--trace-navigation') && world.settlement.timings['Work assignment']!>40)
   console.log(JSON.stringify({tick:world.clock.tickIndex,assignmentMs:world.settlement.timings['Work assignment'],navCalls,navMs,jobs:world.settlement.state.jobs.length}));
 if(args.includes('--trace-routes'))for(const [entity,row] of routeStats)if(row.ms>10||world.clock.tickIndex===traceTick)console.log(JSON.stringify({tick:world.clock.tickIndex,entity,...row}));
 if(args.includes('--trace-slow')&&simulated-begin>12)console.log(JSON.stringify({slowTick:world.clock.tickIndex,processMs:begin,ms:simulated-begin,scopes:world.settlement.timings,ai:world.aiTimings}));
 if(i>=200){sample('simulation',simulated-begin);sample('observerView',observed-simulated);for(const [name,ms] of Object.entries(world.settlement.timings))sample(name,ms);for(const [name,ms] of Object.entries(world.aiTimings))sample(name,ms);}
 if((i+1)%1200===0){const entry={tick:world.clock.tickIndex,elapsedTicks:i+1,units:world.settlement.context.liveUnits().length,sim:stats(samples.simulation.slice(-1200)),view:stats(samples.observerView.slice(-1200))};windows.push(entry);console.log(JSON.stringify(entry));}
}
const cpu=process.cpuUsage(cpuStart);
if(allocationProfiler){
 await new Promise<void>((resolve,reject)=>allocationProfiler.post('HeapProfiler.stopSampling',(error,result)=>{
  if(error){reject(error);return;}writeFileSync(allocationOutput,JSON.stringify(result.profile));resolve();
 }));
 allocationProfiler.disconnect();
}
if(gcObserver){
 // GC entries arrive asynchronously; drain after the synchronous tick loop.
 await new Promise<void>(resolve=>setImmediate(resolve));
 await new Promise<void>(resolve=>setImmediate(resolve));
 gcObserver.disconnect();
}
const measuredGC=gcEvents.filter(e=>e.startTime>=measuredStart&&e.startTime<measuredEnd);
const gc=gcObserver?{scope:'After 200 warmup ticks; includes observer projection and inter-tick idle time when paced. GC durations overlap simulation timings, do not add them.',events:measuredGC.length,totalMs:measuredGC.reduce((n,e)=>n+e.duration,0),maxMs:measuredGC.reduce((n,e)=>Math.max(n,e.duration),0),pauses:measuredGC.map(e=>({...e,elapsedMs:e.startTime-measuredStart}))}:undefined;
const report={map:mapId,mapFingerprint:fingerprint(map),contentFingerprint:world.settlement.registry.fingerprint,ticks,paceMs,startTick:saved?.tick??0,seed:saved?null:731942,resumed:!!saved,initialize,wallMs:performance.now()-start,processCpuMs:{user:cpu.user/1000,system:cpu.system/1000},runtime:{node:process.version,platform:process.platform,arch:process.arch},allocationProfile:allocationOutput?{path:allocationOutput,samplingInterval:65536,includesCollected:true,scope:'After 200 warmup ticks; profiling adds overhead, do not use these timings as a performance baseline.'}:undefined,checksum:world.checksum(),timings:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,stats(v)])),gc,windows,routing:world.settlement.spatial.routing,ai:world.aiSummary()};
if(sightOutput)writeFileSync(sightOutput,JSON.stringify({size:world.settlement.spatial.size,heights:Array.from(world.settlement.spatial.heights),queries:sightQueries}));
const path=option('--output','/tmp/simulation-benchmark.json');writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path,simulation:report.timings.simulation,observer:report.timings.observerView,wallMs:report.wallMs}));
