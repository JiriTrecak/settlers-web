import type {Point} from './state';
import type {SimulationProfiler} from '../profiling';

export type ApproachPosition={point:Point;clear?:boolean};
type Ranked={entry:ApproachPosition;index:number;point:Point;score:number};
const compare=(a:Ranked,b:Ranked)=>a.score-b.score||a.point.y-b.point.y||a.point.x-b.point.x||a.index-b.index;

/** Exact existing score/tie order, but sort distance bands only as consumed.
 * The integer band is merely a sorting partition, never a rounded score or
 * search limit. Cache validity is snapshotted before iteration, as with filter.
 */
export function rankApproachPositions(positions:readonly ApproachPosition[],origin:Point,reserved:(point:Point)=>boolean,profile?:SimulationProfiler):Iterable<Ranked>{
 const bands=new Map<number,Ranked[]>();let index=0;
 for(const entry of positions){
  if(entry.clear===false)continue;
  const point=entry.point,score=Math.hypot(point.x-origin.x,point.y-origin.y)+(reserved(point)?4:0);
  const band=Math.floor(score),row={entry,index:index++,point,score};
  const rows=bands.get(band);if(rows)rows.push(row);else bands.set(band,[row]);
 }
 profile?.count('Approach ranking entries',index);
 const keys=[...bands.keys()].sort((a,b)=>a-b);
 return (function*(){
  for(const key of keys){
   const rows=bands.get(key)!;
   profile?.count('Approach entries ordered',rows.length);
   if(profile)profile.measure('Approach bucket ordering',()=>rows.sort(compare));else rows.sort(compare);
   yield* rows;
  }
 })();
}
