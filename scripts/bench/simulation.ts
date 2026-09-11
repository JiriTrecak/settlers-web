/** Deterministic map-scale CPU benchmark. No browser/GPU timing is implied. */
import {readFileSync,writeFileSync} from 'node:fs';
import {World} from '../../src/sim/world/world';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const mapId=option('--map','four-crowns'),ticks=Number(option('--ticks','12000'));
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`,'utf8')))!;
if(!map||!Number.isSafeInteger(ticks)||ticks<400)throw Error('Choose a valid map and at least 400 ticks');
const start=performance.now();
const world=new World({map,slots:map.playerStarts.map((_,i)=>({player:i,kind:'ai',team:i})),seed:731942});
const resume=option('--resume','');if(resume)world.restore(JSON.parse(readFileSync(resume,'utf8')));
const checkpoint=Number(option('--checkpoint','-1'));
let navCalls=0,navMs=0;
if(args.includes('--trace-navigation')) {
 const navigation=world.settlement.spatial.navigation, path=navigation.path.bind(navigation);
 navigation.path=(...parameters:Parameters<typeof path>)=>{
  const start=performance.now(),result=path(...parameters),ms=performance.now()-start;
  navCalls++; navMs+=ms;
  if(ms>20)console.log(JSON.stringify({navigationMs:ms,tick:world.clock.tickIndex,start:parameters[0],goal:parameters[1],blocked:parameters[2]?.size??0,maxCost:parameters[3],found:result!==null}));
  return result;
 };
}
const initialize=performance.now()-start,samples:Record<string,number[]>={},windows:unknown[]=[];
const sample=(key:string,ms:number)=>(samples[key]??=[]).push(ms);
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};};
for(let i=0;i<ticks;i++){
 navCalls=0;navMs=0;
 if(world.clock.tickIndex===checkpoint)writeFileSync('/tmp/simulation-checkpoint.json',JSON.stringify(world.snapshot()));
 const begin=performance.now();world.tick();const simulated=performance.now();
 world.view();const observed=performance.now();
 if(args.includes('--trace-navigation') && world.settlement.timings['Work assignment']!>40)
   console.log(JSON.stringify({tick:world.clock.tickIndex,assignmentMs:world.settlement.timings['Work assignment'],navCalls,navMs,jobs:world.settlement.state.jobs.length}));
 if(i>=200){sample('simulation',simulated-begin);sample('observerView',observed-simulated);for(const [name,ms] of Object.entries(world.settlement.timings))sample(name,ms);for(const [name,ms] of Object.entries(world.aiTimings))sample(name,ms);}
 if((i+1)%1200===0){const entry={tick:i+1,units:world.settlement.context.liveUnits().length,sim:stats(samples.simulation.slice(-1200)),view:stats(samples.observerView.slice(-1200))};windows.push(entry);console.log(JSON.stringify(entry));}
}
const report={map:mapId,ticks,seed:731942,initialize,wallMs:performance.now()-start,checksum:world.checksum(),timings:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,stats(v)])),windows,ai:world.aiSummary()};
const path=option('--output','/tmp/simulation-benchmark.json');writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path,simulation:report.timings.simulation,observer:report.timings.observerView,wallMs:report.wallMs}));
