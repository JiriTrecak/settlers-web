/** One human + three AIs through the production runtime and snapshot codecs.
 * Headless CPU accounting, not browser FPS or IPC latency. In-process transferable
 * structuredClone approximates transport CPU; actual browser delivery/UI still
 * requires a separate trace before claiming the complete non-render budget. */
import {readFileSync,writeFileSync} from 'node:fs';
import {Session} from 'node:inspector/promises';
import {PerformanceObserver} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {localMatch} from '../../src/shared/match/match';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {fingerprint} from '../../src/content/registry';
import type {SimulationTiming,SimulationWork} from '../../src/sim/profiling';
import type {Entity} from '../../src/sim/game/state';
import {stageHumanArmy} from './match-workload';
import {benchmarkContent} from './content-fixture';
const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const mapId=option('--map','heartroot-glade'),ticks=Number(option('--ticks','6000'));
const paceMs=Number(option('--pace-ms','0'));
if(!Number.isFinite(paceMs)||paceMs<0||paceMs>1000)throw Error('--pace-ms must be between 0 and 1000');
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`,'utf8')));
if(!map||map.playerStarts.length!==4||!Number.isSafeInteger(ticks)||ticks<400)throw Error('Requires a four-player map and >=400 ticks');
const match=localMatch({mapId,mapRevision:fingerprint(map),seed:731942,slotCount:4,me:0});
const contentInput=option('--content',''),{fixture:contentFixture}=benchmarkContent(contentInput,option('--save-content',''));
const runtimeOptions={map,match,player:0,remote:false,...(contentInput?{content:contentFixture}:{})};
const runtime=new SimulationRuntime(runtimeOptions);
runtime.reveal=false;runtime.profiling=args.includes('--details');
const captureTicks=new Set(option('--capture-ticks','').split(',').filter(Boolean).map(Number));
if([...captureTicks].some(t=>!Number.isSafeInteger(t)||t<0)||captureTicks.size>64)throw Error('--capture-ticks requires at most 64 nonnegative integer tick IDs');
const verifyProjection=args.includes('--verify-projection'),verifyRestore=args.includes('--verify-restore');
let restored:SimulationRuntime|undefined;const restoreChecks:{tick:number;fullAuditChecksum:number}[]=[];
const resume=option('--resume','');if(resume)runtime.restoreLocal(JSON.parse(readFileSync(resume,'utf8')));
const humanCount=Number(option('--human-army','0')),assault=humanCount?stageHumanArmy(runtime,humanCount):undefined;
const attackStarts=new Map<number,number>(),attackers=new Set<number>(),attacksByOwner:Record<string,number>={};
let combatTicks=0,humanOrderMs=0;
// Bounded query evidence for pathological routes. Opt-in: never part of the
// unprofiled budget measurement, and never changes search limits or decisions.
const pathQueries:{tick:number;ms:number;actor?:number;definition?:string;order?:string;start:number;goal:number;startPoint:unknown;goalPoint:unknown;blocked:number;maxCost:number|null;result:number|null;expanded:number;fallbacks:number;meshSearches:number;meshExpanded:number;meshRebuiltTiles:number}[]=[];
const actorRoutes=new Map<number,{actor:number;calls:number;failed:number;repeatedUnchanged:number;maxStalledTicks:number;startX:number;startY:number;goalX:number;goalY:number;revision:number}>();
const routeDemand={queries:0,failed:0,expanded:0,untrackedQueries:0};
// Diagnostic shadow solver: compare the mesh with live traffic against the
// exact same requests, but always return the production route to the simulation.
// Timing includes duplicate work and must never be used as budget evidence.
const trafficMeshProbe=args.includes('--probe-traffic-mesh')?{queries:0,meshAccepted:0,gridAccepted:0,meshOnly:0,differentRoutes:0,gridMs:0,meshMs:0,acceptedGridMs:0,acceptedMeshMs:0,gridExpanded:0,maxStretch:0}:undefined;
if(trafficMeshProbe){
 const spatial=runtime.world.settlement.spatial,find=spatial.findPath.bind(spatial);
 // Deliberately benchmark-only access: no alternate routing switch in the game.
 const mesh=(spatial as unknown as {meshPath:typeof spatial.findPath}).meshPath.bind(spatial);
 spatial.findPath=(start,goal,blocked,maxCost=Infinity,actor)=>{
  const eligible=blocked?.size&&!spatial.layers&&!spatial.airborne(actor)&&spatial.unitRadius<=16000&&
   Math.round(spatial.dimensions(actor).radius*1000)===spatial.unitRadius&&spatial.validNode(start)&&spatial.validNode(goal)&&
   Math.max(Math.abs(start%spatial.size-goal%spatial.size),Math.abs(Math.floor(start/spatial.size)-Math.floor(goal/spatial.size)))>=16;
  if(!eligible)return find(start,goal,blocked,maxCost,actor);
  let candidate:number[]|null=null,meshMs=0;
  const shadow=()=>{
   const counters={...spatial.routing},began=performance.now();
   try{candidate=mesh(start,goal,blocked,maxCost,actor);}finally{meshMs=performance.now()-began;Object.assign(spatial.routing,counters);}
  };
  // Alternate order to expose warm-cache bias. Both calls see identical world
  // state; only disposable navigation caches and diagnostic counters can change.
  if(trafficMeshProbe.queries%2===0)shadow();
  const expanded=spatial.routing.expanded,began=performance.now(),route=find(start,goal,blocked,maxCost,actor),gridMs=performance.now()-began;
  if(trafficMeshProbe.queries%2!==0)shadow();
  trafficMeshProbe.queries++;trafficMeshProbe.gridMs+=gridMs;trafficMeshProbe.meshMs+=meshMs;trafficMeshProbe.gridExpanded+=spatial.routing.expanded-expanded;
  if(route)trafficMeshProbe.gridAccepted++;
  if(candidate){
   const alternative=candidate as number[];
   trafficMeshProbe.meshAccepted++;trafficMeshProbe.acceptedGridMs+=gridMs;trafficMeshProbe.acceptedMeshMs+=meshMs;
   if(!route)trafficMeshProbe.meshOnly++;
   else {
    if(route.length!==alternative.length||route.some((cell,i)=>cell!==alternative[i]))trafficMeshProbe.differentRoutes++;
    const cost=(path:number[])=>{let total=0,previous=start;for(const cell of path){total+=cell%spatial.size!==previous%spatial.size&&Math.floor(cell/spatial.size)!==Math.floor(previous/spatial.size)?1414:1000;previous=cell;}return total;};
    trafficMeshProbe.maxStretch=Math.max(trafficMeshProbe.maxStretch,cost(alternative)/cost(route));
   }
  }
  return route;
 };
}
const destinationDemand=new Map<number,{queries:number;failed:number;expanded:number;ms:number;starts:Set<number>;actors:Set<number>;revisions:Set<number>;distinctCountsCapped:boolean}>();
if(args.includes('--trace-routes')){
 const spatial=runtime.world.settlement.spatial,find=spatial.findPath.bind(spatial),route=spatial.route.bind(spatial);
 spatial.route=(actor,destination,avoid,maxCost)=>{
  const x=actor.unit?.position?.x??actor.x*1000,y=actor.unit?.position?.y??actor.y*1000,old=actorRoutes.get(actor.id);
  if(old||actorRoutes.size<2048){
   const row=old??{actor:actor.id,calls:0,failed:0,repeatedUnchanged:0,maxStalledTicks:0,startX:x,startY:y,goalX:destination.x,goalY:destination.y,revision:spatial.revision};
   if(old&&old.startX===x&&old.startY===y&&old.goalX===destination.x&&old.goalY===destination.y&&old.revision===spatial.revision)row.repeatedUnchanged++;
   row.calls++;row.startX=x;row.startY=y;row.goalX=destination.x;row.goalY=destination.y;row.revision=spatial.revision;
   row.maxStalledTicks=Math.max(row.maxStalledTicks,actor.unit?.lastMovedTick===undefined?0:runtime.world.clock.tickIndex-actor.unit.lastMovedTick);
   actorRoutes.set(actor.id,row);const result=route(actor,destination,avoid,maxCost);if(!result)row.failed++;return result;
  }
  return route(actor,destination,avoid,maxCost);
 };
 spatial.findPath=(start,goal,blocked,maxCost=Infinity,actor)=>{
  const before=spatial.routing.expanded,fallbacks=spatial.routing.fallbacks,meshSearches=spatial.routing.meshSearches,meshExpanded=spatial.routing.meshExpanded,meshRebuiltTiles=spatial.routing.meshRebuiltTiles,began=performance.now();
  const result=find(start,goal,blocked,maxCost,actor),ms=performance.now()-began;
  if(blocked?.size){
   const expanded=spatial.routing.expanded-before;
   routeDemand.queries++;routeDemand.failed+=Number(result===null);routeDemand.expanded+=expanded;
   let demand=destinationDemand.get(goal);
   if(!demand&&destinationDemand.size<2048){demand={queries:0,failed:0,expanded:0,ms:0,starts:new Set(),actors:new Set(),revisions:new Set(),distinctCountsCapped:false};destinationDemand.set(goal,demand);}
   if(demand){
    demand.queries++;demand.failed+=Number(result===null);demand.expanded+=expanded;demand.ms+=ms;
    const remember=(set:Set<number>,value:number)=>{if(set.has(value))return;if(set.size<256)set.add(value);else demand!.distinctCountsCapped=true;};
    remember(demand.starts,start);remember(demand.revisions,spatial.revision);
    if(actor&&'id' in actor)remember(demand.actors,(actor as Entity).id);
   }else routeDemand.untrackedQueries++;
  }
  if(pathQueries.length<32||ms>pathQueries.at(-1)!.ms){
   const entity=actor&&'id' in actor?actor as Entity:undefined;
   pathQueries.push({tick:runtime.world.clock.tickIndex,ms,actor:entity?.id,definition:actor&&'definition' in actor?actor.definition:undefined,order:entity?.unit?.order?.type,start,goal,startPoint:spatial.point(start),goalPoint:spatial.point(goal),blocked:blocked?.size??0,maxCost:Number.isFinite(maxCost)?maxCost:null,result:result?.length??null,expanded:spatial.routing.expanded-before,fallbacks:spatial.routing.fallbacks-fallbacks,meshSearches:spatial.routing.meshSearches-meshSearches,meshExpanded:spatial.routing.meshExpanded-meshExpanded,meshRebuiltTiles:spatial.routing.meshRebuiltTiles-meshRebuiltTiles});
   pathQueries.sort((a,b)=>b.ms-a.ms);if(pathQueries.length>32)pathQueries.pop();
  }
  return result;
 };
}
const startTick=runtime.world.clock.tickIndex,encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
if([...captureTicks].some(t=>t<=startTick+200||t>startTick+ticks))throw Error('--capture-ticks must fall inside the measured window, after the 200-tick warm-up');
const series=new Map<string,number[]>(),detail=new Map<string,{inclusiveMs:number;selfMs:number;calls:number;activeTicks:number;maxMs:number}>();
const sample=(key:string,ms:number)=>{let a=series.get(key);if(!a){a=[];series.set(key,a);}a.push(ms);};
const stats=(a:number[])=>{const sorted=[...a].sort((a,b)=>a-b);return {mean:a.reduce((n,v)=>n+v,0)/a.length,p95:sorted[Math.ceil(a.length*.95)-1],p99:sorted[Math.ceil(a.length*.99)-1],max:sorted.at(-1),samples:a.length};};
const workTotals=new Map<string,{total:number;maxPerTick:number;activeTicks:number}>();
const windows:unknown[]=[],begin=performance.now();
// Capture the top 1% as complete frames, rather than adding unrelated category
// percentiles. Diagnostic bookkeeping is outside timed CPU and opt-in only.
const tailSize=Math.max(1,Math.ceil((ticks-200)*.01));
const budgetTail=args.includes('--budget-tail'),threadCpu=args.includes('--thread-cpu');
if(threadCpu&&typeof process.threadCpuUsage!=='function')throw Error('--thread-cpu requires Node with threadCpuUsage');
const slowTicks:{tick:number;totalMs:number;simulationMs:number;checksumMs:number;projectionMs:number;encodeMs:number;transferMs:number;decodeMs:number;threadCpuMs?:number;offCpuMs?:number;profile:SimulationTiming[];work:SimulationWork[];stages?:Record<string,number>;ai?:Record<string,number>}[]=[];
const capturedTicks:typeof slowTicks=[];
// Optional sampling starts after map compilation/restore so startup cannot hide
// the live costs. Its timing run is diagnostic, never budget acceptance evidence.
const cpuProfile=option('--cpu-profile',''),allocationProfile=option('--allocation-profile','');
const inspector=cpuProfile||allocationProfile?new Session():undefined;
if(inspector)inspector.connect();
if(cpuProfile){await inspector!.post('Profiler.enable');await inspector!.post('Profiler.start');}
const gcEvents:{startTime:number;duration:number;kind:number}[]=[];
const gcObserver=args.includes('--gc-report')?new PerformanceObserver(list=>{
 for(const e of list.getEntries())gcEvents.push({startTime:e.startTime,duration:e.duration,kind:(e as unknown as {detail:{kind:number}}).detail.kind});
}):undefined;
gcObserver?.observe({entryTypes:['gc']});
type StageSpan={path:string;start:number;end:number};
let stageSpans:StageSpan[]=[];
// Disjoint coarse stages only. Never store every tiny scope or count the same
// pause in both a parent and child. Scope time includes an interrupted GC pause.
if(gcObserver&&(runtime.profiling||captureTicks.size))runtime.world.settlement.context.profile.onSpan=(path,start,end)=>{
 if(/^World \/ Settlement \/ (Orders \/ navigation \/ Orders · (movement|combat planning)|Observation|Combat|Ability lifecycle)$/.test(path)||/^World \/ AI player \d+$/.test(path))stageSpans.push({path,start,end});
};
const gcTicks:{tick:number;start:number;end:number;stages:StageSpan[]}[]=[];
let measuredStart=Infinity,measuredEnd=0;
for(let i=0;i<ticks;i++){
 runtime.profiling=args.includes('--details')||captureTicks.has(runtime.world.clock.tickIndex+1);
 stageSpans=[];
 if(i===200&&allocationProfile)await inspector!.post('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 const cpuStart=threadCpu?process.threadCpuUsage():undefined;
 const start=performance.now();
 // Intent construction/delivery is counted in CPU. One real attack-move order
 // persists; periodically reissuing it would keep interrupting combat.
 if(i===200&&assault){assault.issue();humanOrderMs=performance.now()-start;}
 if(runtime.advance(25,1)!==1)throw Error('Local commit did not advance');const advanced=performance.now();
 // Remote matches hash at this cadence. Local matches do not, so account for
 // it explicitly as a network-readiness cost rather than quietly omitting it.
 if(runtime.world.clock.tickIndex%match.checksumEvery===0)runtime.world.checksum();const hashed=performance.now();
 const frame=runtime.project(),projected=performance.now();
 const encoded=encoder.encode(frame),encodedAt=performance.now();
 const received=structuredClone(encoded.packet,{transfer:encoded.transfer}),transferred=performance.now();
 const decodedFrame=decoder.decode(received);const decoded=performance.now();
 if(i===200)measuredStart=start;measuredEnd=decoded;
 if(gcObserver&&i>=200)gcTicks.push({tick:runtime.world.clock.tickIndex,start,end:decoded,stages:[...stageSpans,{path:'Projection',start:hashed,end:projected},{path:'Snapshot exchange',start:projected,end:decoded}]});
 const usedCpu=cpuStart?process.threadCpuUsage(cpuStart):undefined;
 const threadCpuMs=usedCpu?(usedCpu.user+usedCpu.system)/1000:undefined;
 // Correctness-only mode: full comparison is outside measured CPU but can
 // perturb allocations/GC. Never use this run as budget acceptance evidence.
 if(verifyProjection&&!isDeepStrictEqual(decodedFrame,frame))throw Error(`Snapshot projection mismatch at tick ${runtime.world.clock.tickIndex}`);
 // Correctness-only cold reconstruction: preserve the pending lockstep pipeline
 // and compare a warm runtime with an independently restored one. Like projection
 // verification, this perturbs later CPU samples and is not budget acceptance.
 if(verifyRestore){
  if(restored){if(restored.advance(25,1)!==1)throw Error('Restored match did not advance');}
  else if(i+1===Math.floor(ticks/2)){
   const save=runtime.snapshotLocal();
   restored=new SimulationRuntime({...runtimeOptions,match:save.match,player:save.player});restored.restoreLocal(save);
  }
  if(restored&&((i+1)%200===0||i===ticks-1)){
   const checksum=runtime.world.checksum('full');
   if(restored.world.clock.tickIndex!==runtime.world.clock.tickIndex||restored.world.checksum('full')!==checksum)
    throw Error(`Warm/restored simulation mismatch at tick ${runtime.world.clock.tickIndex}`);
   restoreChecks.push({tick:runtime.world.clock.tickIndex,fullAuditChecksum:checksum});
   if(i===ticks-1&&!isDeepStrictEqual(restored.world.snapshot(),runtime.world.snapshot()))throw Error('Warm/restored snapshots differ');
  }
 }
 // Evidence of engagement, outside timed code. Do not call a marching fixture
 // an active battle merely because it contains many units.
 let fighting=false;
 for(const e of runtime.world.settlement.context.indexedUnits()){
  const attack=e.unit!.attack;if(!attack)continue;fighting=true;
  if(attackStarts.get(e.id)===attack.started)continue;
  attackStarts.set(e.id,attack.started);attackers.add(e.id);attacksByOwner[e.owner]=(attacksByOwner[e.owner]??0)+1;
 }
 if(fighting)combatTicks++;
 if(i>=200){
  if(threadCpuMs!==undefined){sample('Accounted thread CPU (diagnostic)',threadCpuMs);sample('Off-thread time (diagnostic)',Math.max(0,decoded-start-threadCpuMs));}
  sample('Accounted non-render CPU',decoded-start);sample('Runtime advance',advanced-start);sample('World tick',runtime.timings.simulation!);
  sample('Lockstep and runtime overhead',Math.max(0,advanced-start-runtime.timings.simulation!));
  sample('Network checksum',hashed-advanced);sample('Projection',projected-hashed);sample('Encode',encodedAt-projected);
  if(runtime.world.clock.tickIndex%match.checksumEvery===0)sample('Network checkpoint (per check)',hashed-advanced);
  sample('Transfer clone proxy',transferred-encodedAt);sample('Decode',decoded-transferred);
  sample('Snapshot exchange',decoded-projected);
  for(const [key,ms] of Object.entries(runtime.world.settlement.timings))sample(`Sim · ${key}`,ms);
  const rows=runtime.profiling?runtime.world.settlement.context.profile.snapshot():[],work=runtime.profiling?runtime.world.settlement.context.profile.workSnapshot():[];
  for(const row of work){const sum=workTotals.get(row.path)??{total:0,maxPerTick:0,activeTicks:0};sum.total+=row.value;sum.maxPerTick=Math.max(sum.maxPerTick,row.value);sum.activeTicks+=Number(row.value>0);workTotals.set(row.path,sum);}
  for(const row of rows){
   const sum=detail.get(row.path)??{inclusiveMs:0,selfMs:0,calls:0,activeTicks:0,maxMs:0};
   sum.inclusiveMs+=row.inclusiveMs;sum.selfMs+=row.selfMs;sum.calls+=row.calls;sum.activeTicks+=Number(row.calls>0);sum.maxMs=Math.max(sum.maxMs,row.inclusiveMs);detail.set(row.path,sum);
  }
  const capture=captureTicks.has(runtime.world.clock.tickIndex);
  const retainTail=(runtime.profiling||budgetTail)&&(slowTicks.length<tailSize||decoded-start>slowTicks.at(-1)!.totalMs);
  if(capture||retainTail){
   // Core stage timers already exist in ordinary play. Copy only retained tail
   // candidates, outside measured CPU; no hierarchical instrumentation needed.
   const row={tick:runtime.world.clock.tickIndex,totalMs:decoded-start,simulationMs:runtime.timings.simulation!,checksumMs:hashed-advanced,projectionMs:projected-hashed,encodeMs:encodedAt-projected,transferMs:transferred-encodedAt,decodeMs:decoded-transferred,...(threadCpuMs!==undefined?{threadCpuMs,offCpuMs:Math.max(0,decoded-start-threadCpuMs)}:{}),profile:rows.filter(row=>row.calls>0),work:work.filter(row=>row.value>0),...((budgetTail||capture)?{stages:{...runtime.world.settlement.timings},ai:{...runtime.world.aiTimings}}:{})};
   if(capture)capturedTicks.push(row);
   if(retainTail){slowTicks.push(row);slowTicks.sort((a,b)=>b.totalMs-a.totalMs);if(slowTicks.length>tailSize)slowTicks.pop();}
  }
 }
 if((i+1)%1200===0){const row={tick:runtime.world.clock.tickIndex,units:runtime.world.settlement.context.liveUnits().length,total:stats(series.get('Accounted non-render CPU')!.slice(-1200))};windows.push(row);console.log(JSON.stringify(row));}
 // Optional real-time cadence gives the JS engine idle time between fixed ticks.
 // Sleep and profiler delivery are outside CPU accounting; tick rules/order stay
 // identical. This is still Node, not browser-worker/UI acceptance evidence.
 if(paceMs)await new Promise<void>(resolve=>setTimeout(resolve,Math.max(0,paceMs-(performance.now()-start))));
}
if(cpuProfile){const {profile}=await inspector!.post('Profiler.stop');writeFileSync(cpuProfile,JSON.stringify(profile));}
if(allocationProfile){const {profile}=await inspector!.post('HeapProfiler.stopSampling');writeFileSync(allocationProfile,JSON.stringify(profile));}
inspector?.disconnect();
if(gcObserver){
 // Performance entries are delivered after the synchronous simulation loop.
 await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));gcObserver.disconnect();
}
const measuredGc=gcEvents.filter(e=>e.startTime>=measuredStart&&e.startTime<measuredEnd).sort((a,b)=>a.startTime-b.startTime);
let gcAt=0;
const gcStages=new Map<string,{elapsedMs:number;gcOverlapMs:number;calls:number}>();
const gcOverlaps=gcTicks.map(t=>{
 while(gcAt<measuredGc.length&&measuredGc[gcAt]!.startTime+measuredGc[gcAt]!.duration<=t.start)gcAt++;
 let ms=0;for(let i=gcAt;i<measuredGc.length&&measuredGc[i]!.startTime<t.end;i++){
  const e=measuredGc[i]!;ms+=Math.max(0,Math.min(t.end,e.startTime+e.duration)-Math.max(t.start,e.startTime));
 }
 const stages=t.stages.map(span=>{
  let overlap=0;for(let i=gcAt;i<measuredGc.length&&measuredGc[i]!.startTime<span.end;i++){
   const e=measuredGc[i]!;overlap+=Math.max(0,Math.min(span.end,e.startTime+e.duration)-Math.max(span.start,e.startTime));
  }
  const elapsed=span.end-span.start,row=gcStages.get(span.path)??{elapsedMs:0,gcOverlapMs:0,calls:0};
  row.elapsedMs+=elapsed;row.gcOverlapMs+=overlap;row.calls++;gcStages.set(span.path,row);
  return {path:span.path,elapsedMs:elapsed,gcOverlapMs:overlap};
 });
 return {tick:t.tick,totalMs:t.end-t.start,gcMs:ms,stages};
});
const gc=gcObserver?{scope:'GC events throughout the measured window, including gaps. overlapMs counts only measured non-render intervals and already overlaps CPU; never add it. Diagnostic collection can perturb timings.',events:measuredGc.length,withoutObservedPauses:{scope:'Diagnostic lower bound with observed GC pauses subtracted; not a shippable budget result.',...stats(gcOverlaps.map(t=>Math.max(0,t.totalMs-t.gcMs)))},totalPauseMs:measuredGc.reduce((n,e)=>n+e.duration,0),overlapMs:gcOverlaps.reduce((n,e)=>n+e.gcMs,0),ticksWithPause:gcOverlaps.filter(e=>e.gcMs>0).length,stages:[...gcStages].map(([path,row])=>({path,...row})),slowTicks:gcOverlaps.sort((a,b)=>b.totalMs-a.totalMs).slice(0,tailSize),pauses:measuredGc.map(e=>({...e,elapsedMs:e.startTime-measuredStart}))}:undefined;
const n=ticks-200,profile=[...detail].map(([path,row])=>({path,inclusiveMean:row.inclusiveMs/n,selfMean:row.selfMs/n,callsPerTick:row.calls/n,activeTicks:row.activeTicks,maxMs:row.maxMs})).sort((a,b)=>b.selfMean-a.selfMean);
const tailCosts=new Map<string,{selfMs:number;inclusiveMs:number}>();
for(const tick of slowTicks)for(const row of tick.profile){const cost=tailCosts.get(row.path)??{selfMs:0,inclusiveMs:0};cost.selfMs+=row.selfMs;cost.inclusiveMs+=row.inclusiveMs;tailCosts.set(row.path,cost);}
const tailProfile=[...tailCosts].map(([path,row])=>({path,selfMean:row.selfMs/slowTicks.length,inclusiveMean:row.inclusiveMs/slowTicks.length})).sort((a,b)=>b.selfMean-a.selfMean);
const work=[...workTotals].map(([path,row])=>({path,...row,meanPerTick:row.total/n}));
const report={work,...(args.includes('--trace-routes')?{actorRouteDemand:{scope:'Entire run including warm-up; same actor position, destination and static revision. Moving blockers may still differ; repetition does not prove redundancy.',actors:[...actorRoutes.values()].sort((a,b)=>b.repeatedUnchanged-a.repeatedUnchanged),capped:actorRoutes.size>=2048}}:{}),map:mapId,mapFingerprint:fingerprint(map),contentFingerprint:runtime.world.settlement.registry.fingerprint,slots:runtime.match.slots,
 ...(args.includes('--trace-routes')?{routeDemand:{...routeDemand,destinationCount:destinationDemand.size,
  destinations:[...destinationDemand].map(([goal,d])=>({goal,point:runtime.world.settlement.spatial.point(goal),queries:d.queries,failed:d.failed,expanded:d.expanded,ms:d.ms,
   distinctStarts:d.starts.size,distinctActors:d.actors.size,staticRevisions:d.revisions.size,distinctCountsCapped:d.distinctCountsCapped})).sort((a,b)=>b.expanded-a.expanded||a.goal-b.goal).slice(0,32)}}:{}),
 workload:assault?'Staged mixed human army attacks nearest enemy hall through production input; three real AI controllers.':'Human slot idle; three real AI controllers. Startup baseline, not a four-army human battle acceptance test.',
 engagement:{humanArmy:humanCount,humanOrderMs,humanSurvivors:assault?.units.filter(id=>(runtime.world.settlement.context.get(id)?.hp??0)>0).length,combatTicks,attackers:attackers.size,attacksByOwner},
 coverage:'Runtime + periodic network checksum + production projection/encode/decode + in-process transfer clone. Excludes browser IPC, main-thread UI/input and rendering. Inclusive parents overlap children; sum self times only.',
 verifyProjection,verifyRestore,restoreChecks,details:args.includes('--details'),budgetTail,threadCpu,paceMs,cpuProfile:cpuProfile||undefined,allocationProfile:allocationProfile?{path:allocationProfile,samplingInterval:65536,includesCollected:true,scope:'After warm-up; includes timed runtime and benchmark bookkeeping. Diagnostic overhead is not acceptance timing.'}:undefined,gc,traceRoutes:args.includes('--trace-routes'),pathQueries,startTick,endTick:runtime.world.clock.tickIndex,ticks,warmupTicks:200,budgetMs:3,budgetPercentile:99,checkpointBudgetMs:.1,wallMs:performance.now()-begin,
 runtime:{node:process.version,platform:process.platform,arch:process.arch},timings:Object.fromEntries([...series].map(([k,a])=>[k,stats(a)])),profile,tailProfile,slowTicks,capturedTicks,profileScope:captureTicks.size&&!args.includes('--details')?'Only explicitly captured ticks; profile means are diluted across the run. See capturedTicks for event costs.':'Entire run when --details is enabled',windows,
 trafficMeshProbe:trafficMeshProbe?{...trafficMeshProbe,scope:'Shadow mesh and production grid on identical live traffic requests; duplicate diagnostic work, not budget evidence. Production routes always used.'}:undefined,
 checksum:runtime.world.checksum(),fullAuditChecksum:runtime.world.checksum('full'),outcome:runtime.world.settlement.state.outcome,entities:runtime.world.settlement.state.entities.length,units:runtime.world.settlement.context.liveUnits().length,ai:runtime.world.aiSummary(),routing:runtime.world.settlement.spatial.routing};
const save=option('--save','');if(save)writeFileSync(save,JSON.stringify(runtime.snapshotLocal()));
runtime.destroy();restored?.destroy();const path=option('--output','/tmp/match-budget.json');writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify({path,total:report.timings['Accounted non-render CPU']}));
