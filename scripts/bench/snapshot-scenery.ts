/** Main-thread resource projection from real encoded/decoded snapshot deltas.
 * Projection timings exclude encoding, cloning and decoding. */
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {ResourceScenery} from '../../src/presentation/scenery';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import type {EntityView} from '../../src/sim/game/observation';
const runtime=new SimulationRuntime({map:emptyUtcMap(),match:localMatch({mapId:'bench',mapRevision:'bench',seed:1,slotCount:2,me:0}),player:0,remote:false});
const template=runtime.project();runtime.destroy();
const trees:EntityView[]=Array.from({length:14000},(_,i)=>({id:i+1,definition:'resource.forest.tree',owner:'none',x:i%120*4,y:Math.floor(i/120)*4,rotation:0,hp:null,resource:{amount:500,growingUntil:null}}));
const actors:EntityView[]=Array.from({length:240},(_,i)=>({id:20000+i,definition:'unit.ants.warrior',owner:'player.1',x:i,y:40,rotation:0,hp:100}));
let oracle:string|undefined;
for(const hints of [false,true,true,false]){
 const encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder(),scenery=new ResourceScenery(),times:number[]=[];
 let remaining=trees,stamps:ReturnType<ResourceScenery['project']>=[];
 for(let tick=0;tick<241;tick++){
  if(tick&&tick%40===0)remaining=remaining.slice(1);
  remaining=remaining.map((e,i)=>i===remaining.length-1?{...e,resource:{...e.resource!,amount:e.resource!.amount-1}}:e);
  const entities=[...remaining,...actors.map(e=>({...e,y:e.y+tick*.01}))];
  const view={...template.visual,settlement:{...template.visual.settlement,entities}};
  const {packet,transfer}=encoder.encode({...template,visual:view,selection:view});
  const decoded=decoder.decode(structuredClone(packet,{transfer})).visual.settlement.entities;
  // A shallow array copy strips derived hints but keeps identical immutable
  // records. Its allocation is outside the timed projection, like decoding.
  const input=hints?decoded:[...decoded],begin=performance.now();stamps=scenery.project(input);
  if(tick>20)times.push(performance.now()-begin);
 }
 const signature=JSON.stringify(stamps);oracle??=signature;if(signature!==oracle)throw Error('Scenery differs');
 const sorted=[...times].sort((a,b)=>a-b);
 console.log(JSON.stringify({hints,frames:times.length,remaining:stamps.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)}));
}
