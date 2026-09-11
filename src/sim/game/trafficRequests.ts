import {heading,turnDifference} from './facing';
import {trafficEscape} from './trafficEscape';
import {isStunned} from './effects';
import {itemFlag} from './itemModifiers';
import {fixed} from './motion';
import {UnitIndex} from './unitIndex';
import type {Entity} from './state';
import type {GameContext} from './context';

const STALL_TICKS=200;
type Rank={root:number;depth:number};
/** Ephemeral priority inheritance along actual friendly movement dependencies. */
export function trafficRequests(c:GameContext,units:readonly Entity[]) {
 const moving=units.filter(e=>e.unit!.route.length&&!e.unit!.detour&&c.ready(e)&&!e.spellcasting?.pending&&
  !!c.def(e).behaviors.movement?.speed&&!isStunned(e,c.registry)&&
  !(itemFlag(e,c.registry,'rooted')&&!itemFlag(e,c.registry,'controlImmune'))&&!c.spatial.ignoresUnits(e));
 if(!moving.some(e=>e.unit!.lastMovedTick!==undefined&&c.state.tick-e.unit!.lastMovedTick>=STALL_TICKS))return new Map<number,{leader:Entity;parent:Entity}>();
 const index=new UnitIndex(moving,c.spatial.size,c.spatial.ignoresUnits),edges=new Map<number,number[]>();
 for(const e of moving){
  const u=e.unit!,from=u.position??fixed(e);
  const waypoint=u.detour?.points[0]??u.route.map(i=>fixed(c.spatial.point(i))).find(q=>q.x!==from.x||q.y!==from.y);
  if(!waypoint)continue;
  // Match movement: a unit still turning cannot attempt this leg this tick.
  if(Math.abs(turnDifference(e.rotation,heading(e,{x:waypoint.x/1000,y:waypoint.y/1000})))>(c.def(e).behaviors.movement?.turnRate??720)/40+1)continue;
  const dx=waypoint.x-from.x,dy=waypoint.y-from.y,length=Math.hypot(dx,dy),speed=c.def(e).behaviors.movement!.speed;
  const step=Math.min(length,speed*c.stats(e).moveSpeedPermille/40);
  if(!length)continue;
  const to={x:Math.round(from.x+dx/length*step),y:Math.round(from.y+dy/length*step)};
  if(!c.spatial.clearSegment(from,to))continue;
  const blocked:number[]=[];
  for(const b of index.within(from.x-1500,from.y-1500,from.x+1500,from.y+1500)){
   if(b.id===e.id||b.owner!==e.owner)continue;
   if(c.spatial.cell(b)!==c.spatial.cell(e)&&!c.spatial.clearSegment(from,to,new Set([c.spatial.cell(b)])))blocked.push(b.id);
  }
  const physical:number[]=[];c.spatial.unitSegmentClear(from,to,e.id,physical);
  for(const id of physical){const b=index.entities.get(id);if(b&&b.owner===e.owner&&!blocked.includes(id))blocked.push(id);}
  edges.set(e.id,blocked.sort((a,b)=>a-b));
 }
 // Only a genuine directed waiting cycle needs coordinated recovery.
 const incoming=new Map<number,number[]>(),components=new Map<number,number>();
 for(const [from,to] of edges)for(const id of to){const list=incoming.get(id)??[];list.push(from);incoming.set(id,list);}
 const seen=new Map<number,number>(),low=new Map<number,number>(),stack:number[]=[],active=new Set<number>();let sequence=0;
 const visit=(id:number)=>{
  seen.set(id,sequence);low.set(id,sequence++);stack.push(id);active.add(id);
  for(const to of edges.get(id)??[]){if(!seen.has(to)){visit(to);low.set(id,Math.min(low.get(id)!,low.get(to)!));}
   else if(active.has(to))low.set(id,Math.min(low.get(id)!,seen.get(to)!));}
  if(low.get(id)!==seen.get(id))return;
  const members:number[]=[];for(;;){const next=stack.pop()!;active.delete(next);members.push(next);if(next===id)break;}
  if(members.length>1){const component=Math.min(...members);for(const member of members)components.set(member,component);}
 };
 for(const e of moving)if(!seen.has(e.id))visit(e.id);
 const ranks=new Map<number,Rank>(moving.map(e=>[e.id,{root:e.id,depth:0}]));
 for(const e of [...moving].sort((a,b)=>a.id-b.id)){
  if(ranks.get(e.id)!.root<e.id || e.unit!.lastMovedTick===undefined || c.state.tick-e.unit!.lastMovedTick<STALL_TICKS)continue;
  const queue=[e.id];
  for(let cursor=0;cursor<queue.length;cursor++){
   const id=queue[cursor],rank=ranks.get(id)!;
   for(const next of edges.get(id)??[]){
    const old=ranks.get(next)!;
    if(old.root<rank.root||old.root===rank.root&&old.depth<=rank.depth+1)continue;
    ranks.set(next,{root:rank.root,depth:rank.depth+1});queue.push(next);
   }
  }
 }
 const requests=new Map<number,{leader:Entity;parent:Entity}>();
 for(const e of moving){
  const rank=ranks.get(e.id)!;
  if(rank.root===e.id||e.unit!.lastMovedTick===undefined||c.state.tick-e.unit!.lastMovedTick<STALL_TICKS)continue;
  const parents=(incoming.get(e.id)??[]).filter(id=>components.has(e.id)&&components.get(id)===components.get(e.id)&&
    ranks.get(id)!.root===rank.root&&ranks.get(id)!.depth<rank.depth&&
    index.entities.get(id)!.unit!.lastMovedTick!==undefined&&c.state.tick-index.entities.get(id)!.unit!.lastMovedTick!>=STALL_TICKS)
    .sort((a,b)=>ranks.get(a)!.depth-ranks.get(b)!.depth||a-b);
  if(parents.length)requests.set(e.id,{leader:index.entities.get(rank.root)!,parent:index.entities.get(parents[0])!});
 }
 // A priority must not insist that the actor trapped inside a gate yields
 // when another cycle member has a checked pocket outside that gate.
 const occupied=new Set(units.filter(e=>!c.spatial.ignoresUnits(e)).flatMap(e=>e.unit!.detour?.yielding?[c.spatial.cell(e),e.unit!.detour.waypoint]:[c.spatial.cell(e)]));
 const canEscape=(e:Entity,parent:Entity)=>{const claims=new Set(occupied);claims.delete(c.spatial.cell(e));return !!trafficEscape(c,e,parent,claims);};
 for(const component of new Set(components.values())){
  const candidates=[...requests].filter(([id])=>components.get(id)===component);
  // Preserve normal priority in open traffic. Reverse it only at a terrain
  // constriction where neither immediate lateral direction is traversable.
  const constrained=candidates.some(([id,r])=>{
   const e=index.entities.get(id)!,p=e.unit!.position??fixed(e),q=r.parent.unit!.position??fixed(r.parent);
   const dx=p.x-q.x,dy=p.y-q.y,length=Math.hypot(dx,dy);if(!length)return false;
   return [-1,1].every(sign=>!c.spatial.clearSegment(p,{x:p.x+Math.round(-dy/length*1000*sign),y:p.y+Math.round(dx/length*1000*sign)}));
  });
  if(!constrained||candidates.some(([id,r])=>canEscape(index.entities.get(id)!,r.parent)))continue;
  const alternatives=moving.filter(e=>components.get(e.id)===component&&!requests.has(e.id)&&
    e.unit!.lastMovedTick!==undefined&&c.state.tick-e.unit!.lastMovedTick>=STALL_TICKS).sort((a,b)=>a.id-b.id);
  for(const e of alternatives){
   const parent=(edges.get(e.id)??[]).map(id=>index.entities.get(id)!).find(b=>components.get(b.id)===component&&canEscape(e,b));
   if(!parent)continue;
   for(const[id]of candidates)requests.delete(id);
   requests.set(e.id,{leader:parent,parent});break;
  }
 }
 return requests;
}
