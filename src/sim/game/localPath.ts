import {lengthCeil,type FixedPoint} from './motion';

const SPACING=250, RADIUS=16, WIDTH=RADIUS*2+1, MAX_VISITS=256;
const offsets=[[-1,0],[0,-1],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const;

/** Bounded local escape using actual swept clearance, not occupied cells.
 * The caller supplies terrain, moving reservations and stationary body checks.
 * This is local navigation only: it cannot replace the map-wide corridor.
 */
export function localPath(from:FixedPoint,to:FixedPoint,clear:(a:FixedPoint,b:FixedPoint)=>boolean):FixedPoint[]|null {
 if(Math.hypot(to.x-from.x,to.y-from.y)>4000)return null;
 if(clear(from,to))return [{...to}];
 const position=(id:number)=>({x:from.x+(id%WIDTH-RADIUS)*SPACING,y:from.y+(Math.floor(id/WIDTH)-RADIUS)*SPACING});
 const start=RADIUS*WIDTH+RADIUS;
 const cost=new Map<number,number>([[start,0]]),previous=new Map<number,number>();
 const open=[{id:start,g:0,h:lengthCeil(to.x-from.x,to.y-from.y)}],closed=new Set<number>();
 for(let visits=0;open.length&&visits<MAX_VISITS;){
  let best=0;
  for(let i=1;i<open.length;i++)if(open[i].g+open[i].h<open[best].g+open[best].h||
   (open[i].g+open[i].h===open[best].g+open[best].h&&(open[i].h<open[best].h||open[i].h===open[best].h&&open[i].id<open[best].id)))best=i;
  const current=open.splice(best,1)[0];
  if(closed.has(current.id)||cost.get(current.id)!==current.g)continue;
  closed.add(current.id);visits++;
  const p=position(current.id);
  if(current.id!==start&&clear(p,to)){
   const path:FixedPoint[]=[{...to}];
   for(let at=current.id;at!==start;at=previous.get(at)!)path.push(position(at));
   path.reverse();
   // Straighten only this escape path, never the parent route's yield steps.
   const result:FixedPoint[]=[];let anchor=from;
   for(let i=0;i<path.length;){let far=i;while(far+1<path.length&&clear(anchor,path[far+1]))far++;
    result.push(path[far]);anchor=path[far];i=far+1;}
   return result;
  }
  for(const [dx,dy] of offsets){
   const x=current.id%WIDTH+dx,y=Math.floor(current.id/WIDTH)+dy;
   if(x<0||y<0||x>=WIDTH||y>=WIDTH)continue;
   const id=y*WIDTH+x,g=current.g+(dx&&dy?354:250),q=position(id);
   if(closed.has(id)||g>=(cost.get(id)??Infinity)||!clear(p,q))continue;
   cost.set(id,g);previous.set(id,current.id);
   open.push({id,g,h:lengthCeil(to.x-q.x,to.y-q.y)});
  }
 }
 return null;
}
