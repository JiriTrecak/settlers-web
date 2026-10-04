import type {FixedPoint} from './motion';

type Corridor = {key:string;from:FixedPoint;target:FixedPoint;route:number[]};
const distance=(a:FixedPoint,b:FixedPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Short-lived, deterministic group-route reuse. Instantiate for one synchronous
 * planning pass only: previous ticks/saves must never influence route selection.
 * Every segment is swept for the requesting body against current occupancy.
 */
export class RouteCorridors {
 private readonly corridors:Corridor[]=[];
 remember(key:string,from:FixedPoint,target:FixedPoint,route:readonly number[]){
  if(this.corridors.length<16&&route.length>0&&route.length<=64)
   this.corridors.push({key,from:{...from},target:{...target},route:[...route]});
 }
 find(key:string,from:FixedPoint,target:FixedPoint,goal:number,
  point:(cell:number)=>FixedPoint,clear:(a:FixedPoint,b:FixedPoint)=>boolean):number[]|null {
  const directDistance=distance(from,target);
  if(directDistance<16000)return null;
  for(const candidate of this.corridors){
   if(candidate.key!==key||distance(from,candidate.from)>16000||distance(target,candidate.target)>8000)continue;
   const route=candidate.route.slice(),last=route.length-1;
   if(last>0&&clear(point(route[last-1]),target))route[last]=goal;
   else if(route[last]!==goal)route.push(goal);
   let length=0,anchor=from;
   for(const cell of route){const next=point(cell);length+=distance(anchor,next);anchor=next;}
   // Bound detours independently of the original A* path. Difficult corridors
   // fall back to a fresh search rather than propagating a leader's long detour.
   if(length>directDistance*1.2)continue;
   anchor=from;let valid=true;
   for(const cell of route){const next=point(cell);if(!clear(anchor,next)){valid=false;break;}anchor=next;}
   if(valid)return route;
  }
  return null;
 }
}
