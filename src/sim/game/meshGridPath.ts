import {appendRayCellsFromEnd,type FixedPoint} from './motion';
import type {SimulationProfiler} from '../profiling';

/** Mesh corners can be a fraction short of a collision boundary. Rounding that
 * corner onto the boundary invalidates an otherwise clear corridor. Retry on
 * nearby legal cell centers; every resulting edge still uses the normal body
 * sweep. Failure leaves the caller's general grid search available.
 */
export function snappedMeshGridPath(points:readonly FixedPoint[],step:(a:number,b:number)=>boolean,size:number,profile?:SimulationProfiler):number[]|null {
 if(points.length<2)return [];
 const measure=<T>(name:string,work:()=>T):T=>profile?.enabled?profile.measure(name,work):work();
 const nearby=(p:FixedPoint)=>{
  const x=Math.round(p.x/1000),y=Math.round(p.y/1000),candidates:FixedPoint[]=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const nx=x+dx,ny=y+dy,cell=ny*size+nx;
   if(nx>=0&&ny>=0&&nx<size&&ny<size&&step(cell,cell))candidates.push({x:nx*1000,y:ny*1000});
  }
  return candidates.sort((a,b)=>((a.x-p.x)**2+(a.y-p.y)**2)-((b.x-p.x)**2+(b.y-p.y)**2)||a.y-b.y||a.x-b.x);
 };
 const choices=measure('Corner candidates',()=>points.map((p,i)=>i===0||i===points.length-1?[p]:nearby(p)));
 const original=measure('Corner connection',()=>connect(choices,step,size,profile));
 if(original!==null)return original;
 // A legal endpoint may require a cardinal approach around a shoreline or
 // building corner. Intermediate-corner snapping cannot fix that last edge.
 // Add checked neighboring joins, retaining the exact start and destination.
 const joined=measure('Endpoint connection',()=>connect([[points[0]!],nearby(points[0]!),...choices.slice(1,-1),
  nearby(points.at(-1)!),[points.at(-1)!]],step,size,profile));
 if(joined!==null)return joined;
 // A clear continuous segment may skim an obstacle halfway between corners.
 // Its rounded grid centres can cut that obstacle even when both corners are
 // legal. Allow nearby joins along the same corridor before searching the map.
 // Nine choices per join retain connect's linear (not exponential) bound;
 // every accepted edge still runs the exact directed footprint predicate.
 const samples:FixedPoint[][]=[[points[0]!],nearby(points[0]!)];
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!,count=Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))/8000);
  for(let j=1;j<count;j++)samples.push(nearby({x:Math.round(a.x+(b.x-a.x)*j/count),y:Math.round(a.y+(b.y-a.y)*j/count)}));
  samples.push(i===points.length-1?nearby(b):choices[i]!);
 }
 samples.push([points.at(-1)!]);
 return measure('Corridor connection',()=>connect(samples,step,size,profile));
}

function connect(choices:readonly (readonly FixedPoint[])[],step:(a:number,b:number)=>boolean,size:number,profile?:SimulationProfiler):number[]|null {
 // Usually the nearest choices connect immediately. Backtrack only when they
 // do not, remembering dead ends so the bound is nine-by-nine per mesh segment,
 // rather than exponential in the number of corners. No recursive stack.
 const failed=choices.map(c=>new Uint8Array(c.length));
 const stack:{index:number;next:number;segment:number[]}[]=[{index:0,next:0,segment:[]}];
 while(stack.length){
  const depth=stack.length-1,current=stack[depth]!;
  if(depth===choices.length-1)return stack.flatMap(s=>s.segment);
  const candidates=choices[depth+1]!;
  let advanced=false;
  while(current.next<candidates.length){
   const index=current.next++;
   if(failed[depth+1]![index])continue;
   const segment:number[]=[];
   const clear=appendRayCellsFromEnd(choices[depth]![current.index]!,candidates[index]!,step,size,segment);
   if(profile?.enabled){
    profile.count('Candidate rays');profile.count('Candidate cells emitted',segment.length);
    if(!clear)profile.count('Rejected candidate rays');
   }
   if(clear){
    stack.push({index,next:0,segment});advanced=true;break;
   }
  }
  if(!advanced){failed[depth]![current.index]=1;stack.pop();}
 }
 return null;
}
