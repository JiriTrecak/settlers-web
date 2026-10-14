import type {Spatial} from '../../src/sim/game/spatial';
import {clearSweep,type FixedPoint} from '../../src/sim/game/motion';

/** Shadow endpoint rejection without changing production answers. Cache hits
 * are excluded: the question is how much uncached ray work it could avoid. */
export function probeSweepEndpoints(spatial:Spatial,tick:()=>number){
 const internal=spatial as unknown as {
  clearGroundSweep(from:FixedPoint,to:FixedPoint,step:(a:number,b:number)=>boolean,radius:number):boolean;
  groundSweepRevision:number;groundSweepResults:Map<string,boolean>;
 };
 const original=internal.clearGroundSweep.bind(spatial);
 const rows=new Map<number,{tick:number;queries:number;blocked:number;ms:number;endpointMs:number}>();
 const report={scope:'Shadow endpoint checks; all production sweeps still run. Timings are diagnostic, not budget acceptance.',
  queries:0,blocked:0,mismatches:0,originalMs:0,avoidableMs:0,endpointMs:0,
  get worstTicks(){return [...rows.values()].sort((a,b)=>b.ms-a.ms).slice(0,16);}};
 internal.clearGroundSweep=(from,to,step,radius)=>{
  const key=`${radius}/${from.x}/${from.y}/${to.x}/${to.y}`;
  if(Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))<16000||
   internal.groundSweepRevision===spatial.revision&&internal.groundSweepResults.has(key))return original(from,to,step,radius);
  const start=performance.now(),result=original(from,to,step,radius),ms=performance.now()-start;
  const check=performance.now(),blocked=!clearSweep(to,to,step,spatial.size,radius)||!clearSweep(from,from,step,spatial.size,radius);
  const endpointMs=performance.now()-check;
  report.queries++;report.originalMs+=ms;report.endpointMs+=endpointMs;
  if(blocked){
   report.blocked++;report.avoidableMs+=ms;report.mismatches+=+result;
   const at=tick(),row=rows.get(at)??{tick:at,queries:0,blocked:0,ms:0,endpointMs:0};
   row.queries++;row.blocked++;row.ms+=ms;row.endpointMs+=endpointMs;rows.set(at,row);
  }
  return result;
 };
 return report;
}
