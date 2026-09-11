import {atPoint,fixed,precise} from '../../src/sim/game/motion';
import {heading,turnDifference} from '../../src/sim/game/facing';
import type {Game} from '../../src/sim/game/game';
import type {Entity} from '../../src/sim/game/state';

/** Read-only diagnosis of the next movement step. Never changes orders or RNG. */
export function inspectTraffic(g:Game,units:readonly Entity[]){
 const bodies=g.context.activeUnits().filter(e=>!g.spatial.ignoresUnits(e));
 const rows=units.map(e=>{
  const u=e.unit!,p=precise(e),position=u.position??fixed(e);
  const waypoint=u.route.find(i=>{const q=g.spatial.point(i);return q.x!==p.x||q.y!==p.y;});
  const local=u.detour?.points.find(q=>q.x!==position.x||q.y!==position.y);
  const next=local?{x:local.x/1000,y:local.y/1000}:waypoint===undefined?null:g.spatial.point(waypoint);
  const base={id:e.id,name:e.placement,position:{x:p.x,y:p.y},goal:u.goal===null?null:g.spatial.point(u.goal),
   cellBlockers:[] as number[],bodyBlockers:[] as number[],remainingWaypoints:u.route.length,localEscape:!!u.detour,order:u.order?.type??null,stalledTicks:g.state.tick-(u.lastMovedTick??0)};
  if(!next){
   const waiting=(u.goal!==null&&!atPoint(e,g.spatial.point(u.goal)))||
    (u.order?.type==='move'&&!atPoint(e,u.order.destination));
   return {...base,reason:waiting?'waiting-route':'arrived',turn:0,blockers:[] as number[]};
  }
  const turn=turnDifference(e.rotation,heading(e,next));
  if(Math.abs(turn)>(g.context.def(e).behaviors.movement?.turnRate??720)/40+1)
   return {...base,reason:'turning',turn,blockers:[] as number[]};
  const length=Math.hypot(next.x-p.x,next.y-p.y);
  const speed=(g.context.def(e).behaviors.movement?.speed??0)*g.context.stats(e).moveSpeedPermille/1000;
  const distance=Math.min(length,speed/40);
  const proposed={x:Math.round(position.x+(next.x-p.x)/length*distance*1000),y:Math.round(position.y+(next.y-p.y)/length*distance*1000)};
  if(!g.spatial.clearSegment(position,proposed))return {...base,reason:'terrain',turn,blockers:[] as number[]};
  // The mover's current cell is removed from coarse occupancy by movement;
  // a body sharing that cell can still block it through physical collision.
  const cellBlockers=bodies.filter(b=>b.id!==e.id&&g.spatial.cell(b)!==g.spatial.cell(e)&&
   !g.spatial.clearSegment(position,proposed,new Set([g.spatial.cell(b)]))).map(b=>b.id).sort((a,b)=>a-b);
  const bodyBlockers:number[]=[];
  g.spatial.unitSegmentClear(position,proposed,e.id,bodyBlockers);bodyBlockers.sort((a,b)=>a-b);
  const blockers=[...new Set([...cellBlockers,...bodyBlockers])].sort((a,b)=>a-b);
  return {...base,reason:cellBlockers.length?'occupied-cell':bodyBlockers.length?'body':'clear',turn,blockers,cellBlockers,bodyBlockers};
 });
 // Strongly connected waiting components distinguish circular blockage from
 // a queue whose leading unit can still travel, or a stationary destination.
 const byId=new Map(rows.map(row=>[row.id,row])),index=new Map<number,number>(),low=new Map<number,number>();
 const stack:number[]=[],active=new Set<number>(),cycles:number[][]=[];
 let sequence=0;
 function visit(id:number){
  index.set(id,sequence);low.set(id,sequence++);stack.push(id);active.add(id);
  for(const next of byId.get(id)?.blockers??[]){
   if(!byId.has(next))continue;
   if(!index.has(next)){visit(next);low.set(id,Math.min(low.get(id)!,low.get(next)!));}
   else if(active.has(next))low.set(id,Math.min(low.get(id)!,index.get(next)!));
  }
  if(low.get(id)!==index.get(id))return;
  const component:number[]=[];
  for(;;){const next=stack.pop()!;active.delete(next);component.push(next);if(next===id)break;}
  if(component.length>1)cycles.push(component.sort((a,b)=>a-b));
 }
 for(const row of rows)if(!index.has(row.id))visit(row.id);
 return {tick:g.state.tick,reasons:rows.reduce<Record<string,number>>((out,row)=>{out[row.reason]=(out[row.reason]??0)+1;return out;},{}),
  cycles:cycles.map(ids=>ids.map(id=>byId.get(id)!.name)),units:rows};
}
