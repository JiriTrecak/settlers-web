import {fixed} from './motion';
import {localPath} from './localPath';
import type {Entity,Point} from './state';
import type {GameContext} from './context';

/** Read-only feasibility check, shared by cycle negotiation and actual movement. */
export function trafficEscape(c:GameContext,e:Entity,parent:Entity,occupied:ReadonlySet<number>,accept?:(p:Point)=>boolean){
 const from=e.unit!.position??fixed(e),other=parent.unit!.position??fixed(parent);
 const dx=from.x-other.x,dy=from.y-other.y,length=Math.hypot(dx,dy);
 if(!length)return null;
 const probeStep=Math.max(1,Math.ceil(Math.max(c.spatial.dimensions(e).radius,c.spatial.dimensions(parent).radius)));
 const candidates:import("./state").Point[]=[];
 for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){
  const p={x:e.x+x*probeStep,y:e.y+y*probeStep,...(e.surface?{surface:e.surface}:{})},qx=p.x*1000-from.x,qy=p.y*1000-from.y;
  if(Math.hypot(qx,qy)>3500*probeStep||Math.abs(qx*dy-qy*dx)/length<1000*probeStep||qx*dx+qy*dy<0||!c.spatial.free(p,e.id))continue;
  if(!c.spatial.clearSegment(fixed(p),fixed(p),occupied, e)||!c.spatial.unitSegmentClear(fixed(p),fixed(p),e.id))continue;
  if(accept&&!accept(p))continue;
  candidates.push(p);
 }
 candidates.sort((a,b)=>(a.x*1000-from.x)**2+(a.y*1000-from.y)**2-((b.x*1000-from.x)**2+(b.y*1000-from.y)**2)||a.y-b.y||a.x-b.x);
 for(const target of candidates.slice(0,6)){
  const points=localPath(from,fixed(target),(a,b)=>c.spatial.unitSegmentClear(a,b,e.id)&&c.spatial.clearLocalSegment(a,b,occupied, e),c.profile,250*probeStep);
  if(points)return {waypoint:c.spatial.cell(target),points};
 }
 return null;
}
