import type {Spatial} from '../../src/sim/game/spatial';
import {TerrainClearance} from '../../src/sim/game/terrainClearance';
import {clearSweep,type FixedPoint} from '../../src/sim/game/motion';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';

/** Shadow every successful proof, including restored-world instances. The
 * original footprint rays must agree. This duplicates work on purpose. */
export function verifySweepClearance(){
 const original=TerrainClearance.prototype.provesClear;
 const data={checked:0,scope:'All successful clearance proofs during the run after setup checked against original footprint rays; diagnostic overhead, not acceptance timing.'};
 TerrainClearance.prototype.provesClear=function(this:TerrainClearance,from:FixedPoint,to:FixedPoint,radius:number){
  const result=original.call(this,from,to,radius);
  if(result){
   const terrain=this as unknown as {size:number;heights:Int16Array;walkable:(cell:number)=>boolean};
   data.checked++;
   if(!clearSweep(from,to,(a,b)=>terrain.walkable(b)&&Math.abs(terrain.heights[a]!-terrain.heights[b]!)<=MAX_GROUND_STEP_CM,terrain.size,radius))
    throw Error(`Clearance proof disagrees with exact rays: ${JSON.stringify({from,to,radius})}`);
  }
  return result;
 };
 return {data,dispose:()=>{TerrainClearance.prototype.provesClear=original;}};
}

/** Export exact sweep inputs at a troublesome tick for isolated clearance
 * experiments. Production still decides every result. Never acceptance timing. */
export function captureSweepClearance(spatial:Spatial,tick:()=>number,at:number){
 const internal=spatial as unknown as {
  clearGroundSweep(from:FixedPoint,to:FixedPoint,step:(a:number,b:number)=>boolean,radius:number):boolean;
  groundSweepRevision:number;groundSweepResults:Map<string,boolean>;shortGroundSweepResults:Map<string,boolean>;
  terrainClearance?:TerrainClearance;
 };
 const original=internal.clearGroundSweep.bind(spatial);
 const data:{size:number;limit:number;omitted:number;scenes:{revision:number;heights:number[];walkable:number[]}[];
  queries:{scene:number;from:FixedPoint;to:FixedPoint;radius:number;result:boolean;certified:boolean;ms:number}[]}
  ={size:spatial.size,limit:512,omitted:0,scenes:[],queries:[]};
 internal.clearGroundSweep=(from,to,step,radius)=>{
  if(tick()!==at)return original(from,to,step,radius);
  const span=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));
  const cache=span>=16000?internal.groundSweepResults:internal.shortGroundSweepResults;
  if(span<2000||internal.groundSweepRevision===spatial.revision&&cache.has(`${radius}/${from.x}/${from.y}/${to.x}/${to.y}`))return original(from,to,step,radius);
  if(data.queries.length>=data.limit){data.omitted++;return original(from,to,step,radius);}
  if(data.scenes.at(-1)?.revision!==spatial.revision)data.scenes.push({revision:spatial.revision,heights:Array.from(spatial.heights),walkable:Array.from(spatial.terrain,(_,cell)=>+spatial.walkable(cell))});
  const start=performance.now(),result=original(from,to,step,radius),ms=performance.now()-start;
  data.queries.push({scene:data.scenes.length-1,from:{...from},to:{...to},radius,result,certified:internal.terrainClearance?.provesClear(from,to,radius)??false,ms});
  return result;
 };
 return {data,dispose:()=>{internal.clearGroundSweep=original;}};
}
