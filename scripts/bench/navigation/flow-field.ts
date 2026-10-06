/** Feasibility probe, NOT a production solver. Compare cold shared integration
 * fields with independent mesh/grid routes on a frozen Heartroot snapshot.
 * Includes field construction; warm route extraction alone hides the expensive part.
 * npx vite-node --config vitest.config.ts scripts/bench/navigation/flow-field.ts
 *   --checkpoint /tmp/heartroot-3ai-6000-checksum92-save.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {SimulationRuntime} from '../../../src/session/worker/runtime';
import {parseUtcMap} from '../../../src/shared/map/utcmap';
import {localMatch} from '../../../src/shared/match/match';
import {fingerprint} from '../../../src/content/registry';
import {NavigationQueue} from '../../../src/sim/game/navigationQueue';
import {canTraverse} from '../../../src/sim/game/navigation';
import {fixed} from '../../../src/sim/game/motion';
import {SECTOR_SIZE} from '../../../src/shared/spatial/sectors';
import {MAX_GROUND_STEP_CM} from '../../../src/shared/map/tacticalTerrain';

const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/amberwake-basin.utcmap','utf8')))!;
const runtime=new SimulationRuntime({map,match:localMatch({mapId:'amberwake-basin',mapRevision:fingerprint(map),seed:731942,slotCount:map.playerStarts.length,me:0}),player:0,remote:false});
const checkpoint=option('--checkpoint','');if(checkpoint)runtime.restoreLocal(JSON.parse(readFileSync(checkpoint,'utf8')));
const s=runtime.world.settlement.spatial,actor=runtime.world.settlement.context.liveUnits().find(e=>e.definition==='unit.ants.warrior')!;
if(s.layers||s.dimensions(actor).radius>=.5)throw Error('Probe requires the small-body ground-only profile');
const audit=runtime.world.checksum('full'),goalPoint={x:82,y:92},goal=s.cell(goalPoint),starts:number[]=[];
if(!s.unitWalkable(goalPoint,actor))throw Error('Probe goal is blocked');
for(let y=432;y<=450&&starts.length<32;y+=2)for(let x=72;x<=92&&starts.length<32;x+=2)if(s.unitWalkable({x,y},actor))starts.push(s.cell({x,y}));
if(starts.length!==32)throw Error('Need 32 valid nearby starts');
const directions=[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const;
const beginMask=performance.now(),walkable=Uint8Array.from({length:s.size*s.size},(_,i)=>Number(s.walkable(i))),maskMs=performance.now()-beginMask;
const step=(a:number,b:number)=>!!walkable[b]&&Math.abs(s.heights[a]!-s.heights[b]!)<=MAX_GROUND_STEP_CM;
const length=(route:readonly number[],start:number)=>{let cost=0;for(const id of route){const dx=Math.abs(id%s.size-start%s.size),dy=Math.abs(Math.floor(id/s.size)-Math.floor(start/s.size));cost+=Math.max(dx,dy)*1000+Math.min(dx,dy)*414;start=id;}return cost;};
const results:unknown[]=[];
for(let round=0;round<3;round++){
 for(const restricted of [false,true]){
  const begin=performance.now(),width=Math.ceil(s.size/SECTOR_SIZE),allowed=restricted?new Uint8Array(width*width):undefined;
  if(allowed)for(const start of starts){const corridor=s.sectors.corridor(start,goal);if(!corridor)throw Error('Missing corridor');for(let i=0;i<allowed.length;i++)allowed[i]!|=corridor[i]!;}
  const distance=new Int32Array(walkable.length).fill(0x7fffffff),next=new Int32Array(walkable.length).fill(-1),settled=new Uint8Array(walkable.length);
  const queue=new NavigationQueue(),remaining=new Set(starts);distance[goal]=0;queue.push(goal,0,0);let expanded=0;
  while(queue.length&&remaining.size){
   const {id,g}=queue.pop();if(settled[id]||distance[id]!==g)continue;
   settled[id]=1;expanded++;remaining.delete(id);
   const x=id%s.size,y=Math.floor(id/s.size);
   for(const [dx,dy] of directions){
    const nx=x+dx,ny=y+dy,neighbor=ny*s.size+nx;
    if(nx<0||ny<0||nx>=s.size||ny>=s.size||settled[neighbor]||!walkable[neighbor]||allowed&&!allowed[Math.floor(ny/SECTOR_SIZE)*width+Math.floor(nx/SECTOR_SIZE)])continue;
    const cost=g+(dx&&dy?1414:1000);
    if(cost>=distance[neighbor]!||!canTraverse(s.size,neighbor,id,step))continue;
    distance[neighbor]=cost;next[neighbor]=id;queue.push(neighbor,cost,0);
   }
  }
  const built=performance.now(),routes=starts.map(start=>{
   const route:number[]=[];for(let at=start;at!==goal;){at=next[at]!;if(at<0||route.length>=walkable.length)throw Error('Missing or cyclic field route');route.push(at);}return route;
  }),extracted=performance.now();
  // Physical sweeps, not just graph membership; excluded from build/extract timings.
  routes.forEach((route,i)=>{let from=starts[i]!;for(const to of route){if(!s.clearSegment(fixed(s.point(from)),fixed(s.point(to)),undefined,actor))throw Error('Invalid field edge');from=to;}});
  results.push({round,kind:restricted?'corridor-shared-field':'whole-map-shared-field',buildMs:built-begin,extract32Ms:extracted-built,expanded,remaining:remaining.size,costs:routes.map((route,i)=>length(route,starts[i]!))});
 }
 for(const kind of ['grid','mesh'] as const){
  const begin=performance.now(),routes=starts.map(start=>kind==='grid'?s.findGridPath(start,goal,undefined,Infinity,actor):s.findPath(start,goal,undefined,Infinity,actor));
  results.push({round,kind,query32Ms:performance.now()-begin,costs:routes.map((route,i)=>route?length(route,starts[i]!):null)});
 }
}
if(runtime.world.checksum('full')!==audit)throw Error('Probe changed simulation state');
const report={map:map.name,tick:runtime.world.clock.tickIndex,starts:starts.map(i=>s.point(i)),goal:goalPoint,maskMs,results,audit,
 limitations:'Optimistic same exact destination for 32 ground units; no moving blockers, per-unit formation goals, invalidation or steering. Restricted field uses the union of existing coarse corridors. No production integration or budget claim.'};
const output=option('--output','/tmp/flow-field-probe.json');writeFileSync(output,JSON.stringify(report,null,2));runtime.destroy();
console.log(JSON.stringify({output,results:results.map(({costs,...rest}:any)=>rest)}));
