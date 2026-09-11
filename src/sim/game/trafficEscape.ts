import {fixed} from './motion';
import {localPath} from './localPath';
import type {Entity} from './state';
import type {GameContext} from './context';

/** Read-only feasibility check, shared by cycle negotiation and actual movement. */
export function trafficEscape(c:GameContext,e:Entity,parent:Entity,occupied:ReadonlySet<number>){
 const from=e.unit!.position??fixed(e),other=parent.unit!.position??fixed(parent);
 const dx=from.x-other.x,dy=from.y-other.y,length=Math.hypot(dx,dy);
 if(!length||e.unit!.goal===null)return null;
 const candidates:{x:number;y:number}[]=[];
 for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){
  const p={x:e.x+x,y:e.y+y},qx=p.x*1000-from.x,qy=p.y*1000-from.y;
  if(Math.hypot(qx,qy)>3500||Math.abs(qx*dy-qy*dx)/length<1000||qx*dx+qy*dy<0||!c.spatial.free(p,e.id))continue;
  if(!c.spatial.clearSegment(fixed(p),fixed(p),occupied)||!c.spatial.unitSegmentClear(fixed(p),fixed(p),e.id))continue;
  candidates.push(p);
 }
 candidates.sort((a,b)=>(a.x*1000-from.x)**2+(a.y*1000-from.y)**2-((b.x*1000-from.x)**2+(b.y*1000-from.y)**2)||a.y-b.y||a.x-b.x);
 for(const target of candidates.slice(0,6)){
  const points=localPath(from,fixed(target),(a,b)=>c.spatial.clearSegment(a,b,occupied)&&c.spatial.unitSegmentClear(a,b,e.id));
  if(points)return {waypoint:c.spatial.cell(target),points};
 }
 return null;
}
