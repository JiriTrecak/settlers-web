/** Global-path feasibility experiment, not a whole-match budget acceptance test.
 * Usage: npx vite-node --config vitest.config.ts scripts/bench/global-navigation.ts --checkpoint PATH
 *   --output /tmp/global-navigation.json [--queries 32] [--repeats 10] [--cell-size .25]
 *   [--representation exact --weight 2] uses the direct square-clearance mesh.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {init} from 'recast-navigation';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {localMatch} from '../../src/shared/match/match';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {fingerprint} from '../../src/content/registry';
import {fixed} from '../../src/sim/game/motion';
import {farthestClearWaypoint} from '../../src/sim/game/routeSmoothing';
import {buildGroundMesh} from '../../src/shared/navigation/groundMesh';
import {createGroundMeshQuery} from '../../src/shared/navigation/groundMeshQuery';
import {buildProbe, checkProbePath, disposeProbe, groundGeometry, queryProbe} from './navigation/recast-probe';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i=args.indexOf(name); return i<0?fallback:args[i+1]??fallback; };
const mapId = option('--map', 'heartroot-glade'), count = Number(option('--queries','32')),
  repeats = Number(option('--repeats','10')), cellSize = Number(option('--cell-size','.25')),
  radiusMultiplier = Number(option('--radius-multiplier',String(Math.SQRT2)));
if (!Number.isInteger(count)||count<1||!Number.isInteger(repeats)||repeats<1||![.125,.25,.5,1].includes(cellSize)||!Number.isFinite(radiusMultiplier)||radiusMultiplier<0) throw Error('Invalid benchmark options');
const map = parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`, 'utf8')));
if (!map) throw Error('Invalid map');
const runtime = new SimulationRuntime({map, match:localMatch({mapId,mapRevision:fingerprint(map),seed:731942,slotCount:4,me:0}),player:0,remote:false});
const checkpoint = option('--checkpoint','');
if (checkpoint) runtime.restoreLocal(JSON.parse(readFileSync(checkpoint,'utf8')));
const spatial = runtime.world.settlement.spatial;
const actor = runtime.world.settlement.context.liveUnits().find(e=>e.definition.includes('warrior')) ?? runtime.world.settlement.context.liveUnits()[0];
if (!actor) throw Error('No body profile available');
const body = spatial.dimensions(actor), auditBefore = runtime.world.checksum('full');
const exact=option('--representation','recast')==='exact';
if(!exact)await init();
const geometryStarted = performance.now();
const walkable=Uint8Array.from({length:spatial.size**2},(_,i)=>Number(spatial.walkable(i)));
const geometry = exact?null:groundGeometry({size:spatial.size,walkable:i=>!!walkable[i],height:i=>spatial.heights[i]!/100});
const geometryMs = performance.now()-geometryStarted;
const buildStarted=performance.now();
const data=exact?buildGroundMesh({size:spatial.size,radius:body.radius,walkable,heights:spatial.heights}):null;
const weight=Number(option('--weight','2'));
const direct=data?createGroundMeshQuery(data,weight):undefined;
const probe = data&&direct?{...direct,config:{representation:'direct-clearance-mesh',weight},buildMs:performance.now()-buildStarted,polygons:direct.query.updates.polygons,tiles:data.tiles.length}:buildProbe(geometry!,body.radius,body.height,cellSize,radiusMultiplier);
console.log(JSON.stringify({phase:'built',geometryMs,buildMs:probe.buildMs,polygons:probe.polygons,tiles:probe.tiles,layered:!!spatial.layers}));
type Pair = {start:{x:number;y:number};goal:{x:number;y:number}};
const pairs:Pair[] = [], points:{x:number;y:number}[] = [];
// Previously expensive coordinates are evaluated against THIS frozen world,
// not represented as exact replays of their later-tick source queries.
for (const [x,y,gx,gy] of [[82,101,76,415],[445,388,428,76],[82,101,63,390],[77,389,428,76]]) {
  if (x<spatial.size&&y<spatial.size&&gx<spatial.size&&gy<spatial.size&&spatial.unitWalkable({x,y},actor)&&spatial.unitWalkable({x:gx,y:gy},actor))
    pairs.push({start:{x,y},goal:{x:gx,y:gy}});
}
let seed=731942;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for (let i=0;i<20000&&points.length<256;i++) {
  const p={x:Math.floor(random()*spatial.size),y:Math.floor(random()*spatial.size)};
  if(spatial.unitWalkable(p,actor))points.push(p);
}
for(let i=0;i<points.length&&pairs.length<count;i++) for(let j=i+1;j<points.length;j++)
  if(Math.hypot(points[i]!.x-points[j]!.x,points[i]!.y-points[j]!.y)>spatial.size*.5){pairs.push({start:points[i]!,goal:points[j]!});break;}
pairs.length=Math.min(count,pairs.length);
if(!pairs.length)throw Error('No long-path probes');
const clear=(a:{x:number;z:number},b:{x:number;z:number})=>spatial.clearSegment(fixed({x:a.x,y:a.z}),fixed({x:b.x,y:b.z}),undefined,actor);
const vector=(p:{x:number;y:number})=>({x:p.x,y:spatial.heights[p.y*spatial.size+p.x]!/100,z:p.y});
const candidateQuery=(start:ReturnType<typeof vector>,goal:ReturnType<typeof vector>)=>{
 const result=queryProbe(probe.query,exact?{...start,y:0}:start,exact?{...goal,y:0}:goal);
 if(exact)for(const p of result.path)p.y=spatial.heights[Math.max(0,Math.min(spatial.size-1,Math.round(p.z)))*spatial.size+Math.max(0,Math.min(spatial.size-1,Math.round(p.x)))]!/100;
 return result;
};
const gridTimes:number[]=[],meshTimes:number[]=[],checkedTimes:number[]=[],validGridTimes:number[]=[],validMeshTimes:number[]=[],productionTimes:number[]=[];
const routeRatios:number[]=[],failures:Record<string,number>={};let gridReachable=0,meshValid=0,expectedUnreachable=0,unexpectedFailures=0;
const rows:unknown[]=[];
// Prepare the existing coarse graph explicitly and report that cost. Recast
// topology preparation is included in buildMs, not disguised as query work.
const gridPrepareStart=performance.now();spatial.sectors.prepare();const gridPrepareMs=performance.now()-gridPrepareStart;
for(const pair of pairs){
 const start=vector(pair.start),goal=vector(pair.goal);
 const began=performance.now(),expanded=spatial.routing.expanded;
 const baseline=spatial.findGridPath(spatial.cell(pair.start),spatial.cell(pair.goal),undefined,Infinity,actor);
 const gridColdMs=performance.now()-began,gridExpanded=spatial.routing.expanded-expanded;
 const meshStart=performance.now(),candidate=candidateQuery(start,goal),meshColdMs=performance.now()-meshStart;
 const meshExpanded='lastExpanded' in probe.query?probe.query.lastExpanded:undefined;
 const validity=checkProbePath(candidate.path,start,goal,clear);
 if(baseline!==null)gridReachable++;
 if(validity.valid)meshValid++;else failures[validity.reason]=(failures[validity.reason]??0)+1;
 if(baseline===null&&!candidate.success)expectedUnreachable++;
 if(baseline!==null&&!validity.valid)unexpectedFailures++;
 let gridLength=0,previous=pair.start;
 for(const id of baseline??[]){const p=spatial.point(id);gridLength+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}
 let smoothedGridLength=0,anchor=pair.start;
 for(let i=0;baseline&&i<baseline.length;){
  const j=farthestClearWaypoint(i,baseline.length-1,index=>spatial.clearSegment(fixed(anchor),fixed(spatial.point(baseline[index]!)),undefined,actor));
  const p=spatial.point(baseline[j]!);smoothedGridLength+=Math.hypot(p.x-anchor.x,p.y-anchor.y);anchor=p;i=j+1;
 }
 if(validity.valid&&smoothedGridLength)routeRatios.push(validity.length/smoothedGridLength);
 const production=spatial.findPath(spatial.cell(pair.start),spatial.cell(pair.goal),undefined,Infinity,actor);
 if((production!==null)!==(baseline!==null))throw Error('Integrated routing changed reachability');
 let prior=pair.start;
 for(const id of production??[]){const p=spatial.point(id);if(!spatial.clearSegment(fixed(prior),fixed(p),undefined,actor))throw Error('Integrated route contains an invalid step');prior=p;}
 if(production?.length&&production.at(-1)!==spatial.cell(pair.goal))throw Error('Integrated routing changed destination');
 for(let repeat=0;repeat<repeats;repeat++){
  const g=performance.now();spatial.findGridPath(spatial.cell(pair.start),spatial.cell(pair.goal),undefined,Infinity,actor);const gridMs=performance.now()-g;gridTimes.push(gridMs);
  const m=performance.now(),result=candidateQuery(start,goal);const meshMs=performance.now()-m;meshTimes.push(meshMs);
  checkProbePath(result.path,start,goal,clear);checkedTimes.push(performance.now()-m);
  const live=performance.now();spatial.findPath(spatial.cell(pair.start),spatial.cell(pair.goal),undefined,Infinity,actor);productionTimes.push(performance.now()-live);
  if(validity.valid&&baseline!==null){validGridTimes.push(gridMs);validMeshTimes.push(meshMs);}
 }
 rows.push({...pair,grid:{found:baseline!==null,cells:baseline?.length??0,length:gridLength,smoothedLength:smoothedGridLength,expanded:gridExpanded,coldMs:gridColdMs},
  mesh:{success:candidate.success,error:candidate.error,expanded:meshExpanded,points:candidate.path.length,first:candidate.path[0],last:candidate.path.at(-1),coldMs:meshColdMs,...validity},
  lengthRatioToSmoothedGrid:validity.valid&&smoothedGridLength?validity.length/smoothedGridLength:null});
}
const stats=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return {samples:s.length,mean:s.length?s.reduce((a,b)=>a+b,0)/s.length:null,p99:s[Math.ceil(s.length*.99)-1]??null,max:s.at(-1)??null};};
const auditAfter=runtime.world.checksum('full');
const report={map:mapId,size:spatial.size,tick:runtime.world.clock.tickIndex,body,actor:actor.definition,config:probe.config,
 coverage:'Frozen-world global ground routing only. No crowd changes. Ground-only geometry excludes bridge decks. Invalid/partial routes remain failures; no hidden fallback. Warm microbenchmark is not whole-match p99. Smoothed grid is a practical route-quality comparator, not a Euclidean optimality oracle.',
 groundCells:walkable.reduce((sum,n)=>sum+n,0),deckNodes:spatial.layers?spatial.layers.nodes.length-spatial.size**2:0,
 geometryMs,buildMs:probe.buildMs,gridPrepareMs,polygons:probe.polygons,tiles:probe.tiles,
 quality:{queries:pairs.length,gridReachable,meshValid,expectedUnreachable,unexpectedFailures,failures,lengthRatioToSmoothedGrid:stats(routeRatios)},
 timings:{gridWarm:stats(gridTimes),meshWarm:stats(meshTimes),meshWithValidationWarm:stats(checkedTimes),productionWarm:stats(productionTimes),validPairsGridWarm:stats(validGridTimes),validPairsMeshWarm:stats(validMeshTimes)},routing:{...spatial.routing},rows,auditBefore,auditAfter};
const output=option('--output','/tmp/global-navigation.json');writeFileSync(output,JSON.stringify(report,null,2));
disposeProbe(probe);runtime.destroy();
if(auditBefore!==auditAfter)throw Error('Benchmark mutated authoritative state');
console.log(JSON.stringify({output,timings:report.timings}));
