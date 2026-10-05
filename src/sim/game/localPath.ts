import type {SimulationProfiler} from '../profiling';
import {lengthCeil,type FixedPoint} from './motion';
import {NavigationQueue} from './navigationQueue';

const SPACING=250, RADIUS=16, WIDTH=RADIUS*2+1, MAX_VISITS=256;
// Bounded scratch storage avoids allocating Maps/Sets/frontiers for every
// obstructed unit. Borrowing permits a clearance callback to search recursively.
class LocalScratch {
 cost=new Int32Array(WIDTH*WIDTH);
 previous=new Int32Array(WIDTH*WIDTH);
 seen=new Uint32Array(WIDTH*WIDTH);
 closed=new Uint32Array(WIDTH*WIDTH);
 open=new NavigationQueue();
 epoch=0;
 reset(){
  if(this.epoch===0xffffffff){this.seen.fill(0);this.closed.fill(0);this.epoch=0;}
  this.epoch++;this.open.length=0;
 }
}
const pool:LocalScratch[]=[];
const offsets=[[-1,0],[0,-1],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const;

/** Bounded local escape using actual swept clearance, not occupied cells.
 * The caller supplies terrain, moving reservations and stationary body checks.
 * This is local navigation only: it cannot replace the map-wide corridor.
 */
export function localPath(from:FixedPoint,to:FixedPoint,clear:(a:FixedPoint,b:FixedPoint)=>boolean,profile?:SimulationProfiler):FixedPoint[]|null {
 if(Math.hypot(to.x-from.x,to.y-from.y)>4000){profile?.count('Local distance rejected');return null;}
 if(clear(from,to)){profile?.count('Local direct successes');return [{...to}];}
 const start=RADIUS*WIDTH+RADIUS;
 // Anchor the grid to the world, not the interrupted sub-cell position. A
 // translated grid can miss the only clear center between enlarged bodies.
 // Retain the exact start as a special node; never snap the actual unit.
 const originX=Math.round(from.x/SPACING)*SPACING,originY=Math.round(from.y/SPACING)*SPACING;
 const position=(id:number)=>id===start?{...from}:{x:originX+(id%WIDTH-RADIUS)*SPACING,y:originY+(Math.floor(id/WIDTH)-RADIUS)*SPACING,...(from.surface?{surface:from.surface}:{})};
 const scratch=pool.pop()??new LocalScratch();scratch.reset();
 const {cost,previous,seen,closed,open,epoch}=scratch;
 let visits=0;
 try {
  seen[start]=epoch;cost[start]=0;
  open.push(start,0,lengthCeil(to.x-from.x,to.y-from.y));
  for(;open.length&&visits<MAX_VISITS;){
   const current=open.pop();
   if(closed[current.id]===epoch||cost[current.id]!==current.g)continue;
   closed[current.id]=epoch;visits++;
   const p=position(current.id);
   if(current.id!==start&&clear(p,to)){
    const path:FixedPoint[]=[{...to}];
    for(let at=current.id;at!==start;at=previous[at]!)path.push(position(at));
    path.reverse();
    // Straighten only this escape path, never the parent route's yield steps.
    const result:FixedPoint[]=[];let anchor=from;
    for(let i=0;i<path.length;){let far=i;while(far+1<path.length&&clear(anchor,path[far+1]))far++;
     result.push(path[far]);anchor=path[far];i=far+1;}
    profile?.count('Local searched successes');return result;
   }
   for(const [dx,dy] of offsets){
    const x=current.id%WIDTH+dx,y=Math.floor(current.id/WIDTH)+dy;
    if(x<0||y<0||x>=WIDTH||y>=WIDTH)continue;
    const id=y*WIDTH+x;
    if(closed[id]===epoch)continue;
    const qx=id===start?from.x:originX+(x-RADIUS)*SPACING;
    const qy=id===start?from.y:originY+(y-RADIUS)*SPACING;
    const g=current.g+lengthCeil(qx-p.x,qy-p.y);
    if(seen[id]===epoch&&g>=cost[id]!)continue;
    const q=position(id);
    if(!clear(p,q))continue;
    seen[id]=epoch;cost[id]=g;previous[id]=current.id;
    open.push(id,g,lengthCeil(to.x-q.x,to.y-q.y));
   }
  }
  profile?.count(visits>=MAX_VISITS?'Local visit limit failures':'Local exhausted frontier failures');
  return null;
 } finally {profile?.count('Local nodes expanded',visits);if(pool.length<4)pool.push(scratch);}
}
