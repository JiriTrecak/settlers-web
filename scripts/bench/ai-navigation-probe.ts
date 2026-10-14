import {ObservedNavigation,type ObservedMover} from '../../src/sim/ai/observedNavigation';
import type {Point} from '../../src/sim/game/state';
import type {GroundNavigation} from '../../src/sim/game/groundNavigation';
import type {Navigation} from '../../src/sim/game/navigation';
import type {FixedPoint} from '../../src/sim/game/motion';

/** Opt-in failing-query fixture export. Copies authorized AI geography only.
 * Extra work perturbs timing; never enable this for budget acceptance. Kept in
 * the benchmark so ordinary sessions do not expose or retain map-sized traces.
 */
export function captureAiNavigation(tick:()=>number,target:number){
 type Internals={map:{size:number};walkable:Uint8Array;heights:Int16Array;layers?:unknown;blocked:ReadonlySet<number>};
 type Body={grid:Navigation;mesh?:GroundNavigation;clear:(a:FixedPoint,b:FixedPoint)=>boolean};
 const proto=ObservedNavigation.prototype as unknown as {
  findReachable(this:Internals,from:ObservedMover,to:Point,p:Body):boolean;
 };
 const original=proto.findReachable;
 const maps:{size:number;land:number[];heights:number[]}[]=[],ids=new Map<Internals,{id:number;blocked:ReadonlySet<number>}>();
 const queries:{map:number;from:ObservedMover;to:Point;result:boolean;ms:number;expanded:number;searches:number;
  sweeps:{calls:number;repeated:number;uniqueMs:number;repeatedMs:number}}[]=[];
 // One captured tick only. Reset the probe cache on observed blocker changes;
 // timings include per-sweep clocks, so use them to locate work, not as a budget.
 const sweepKeys=new WeakMap<Body,{blocked:ReadonlySet<number>;keys:Set<string>}>();
 proto.findReachable=function(from,to,p){
  if(this.layers||tick()!==target||queries.length>=64)return original.call(this,from,to,p);
  let saved=ids.get(this);
  if(!saved||saved.blocked!==this.blocked){saved={id:maps.length,blocked:this.blocked};ids.set(this,saved);maps.push({size:this.map.size,land:Array.from(this.walkable),heights:Array.from(this.heights)});}
  const id=saved.id;
  const path=p.grid.path;let expanded=0,searches=0;
  p.grid.path=(...args)=>{const result=path.apply(p.grid,args);expanded+=p.grid.lastExpanded;searches++;return result;};
  let cache=sweepKeys.get(p);
  if(!cache||cache.blocked!==this.blocked){cache={blocked:this.blocked,keys:new Set()};sweepKeys.set(p,cache);}
  const sweeps={calls:0,repeated:0,uniqueMs:0,repeatedMs:0},clear=p.clear;
  p.clear=(a,b)=>{
   const key=`${a.x}/${a.y}/${a.surface??''}/${b.x}/${b.y}/${b.surface??''}`,repeated=cache!.keys.has(key);
   const start=performance.now(),result=clear(a,b),elapsed=performance.now()-start;
   sweeps.calls++;if(repeated){sweeps.repeated++;sweeps.repeatedMs+=elapsed;}else{sweeps.uniqueMs+=elapsed;cache!.keys.add(key);}
   return result;
  };
  try{
   const start=performance.now(),result=original.call(this,from,to,p),ms=performance.now()-start;
   queries.push({map:id,from:{x:from.x,y:from.y,surface:from.surface,radius:from.radius,height:from.height,air:from.air},
    to:{...to},result,ms,expanded,searches,sweeps});return result;
  }finally{p.grid.path=path;p.clear=clear;}
 };
 return {data:{tick:target,scope:'Ground-only observed geography; diagnostic copying/queries perturb timing.',maps,queries},dispose:()=>{proto.findReachable=original;}};
}
