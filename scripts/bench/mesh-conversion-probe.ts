import type {Spatial} from '../../src/sim/game/spatial';
import type {GroundNavigation} from '../../src/sim/game/groundNavigation';
import {fixed,type FixedPoint} from '../../src/sim/game/motion';

/** Capture the actual mesh corridor and collision input on one diagnostic tick.
 * Production routing still supplies every answer. Export enables small isolated
 * reproductions instead of repeatedly profiling a whole match. */
export function captureMeshConversion(spatial:Spatial,tick:()=>number,at:number){
 const internal=spatial as unknown as {groundNavigation(radius:number):GroundNavigation};
 const find=spatial.findPath.bind(spatial);
 const data:{size:number;queries:{tick:number;start:number;goal:number;radius:number;blocked:number[];points:FixedPoint[];walkable:number[];heights:number[];result:number[]|null;rasterRejected:number}[]}={size:spatial.size,queries:[]};
 spatial.findPath=(start,goal,blocked,maxCost,actor)=>{
  if(tick()!==at||spatial.layers||spatial.airborne(actor)||data.queries.length>=16)return find(start,goal,blocked,maxCost,actor);
  const radius=spatial.dimensions(actor).radius,mesh=internal.groundNavigation(radius),query=mesh.query;
  const compute=query.computePathWithEndpointPadding.bind(query),points:FixedPoint[]=[];
  query.computePathWithEndpointPadding=(...args)=>{
   const result=compute(...args);
   if(result.success)points.push(fixed(spatial.point(start)),...result.path.slice(1).map(p=>({x:Math.round(p.x*1000),y:Math.round(p.z*1000)})));
   return result;
  };
  const before=spatial.routing.meshRasterRejected;
  try{
   const result=find(start,goal,blocked,maxCost,actor);
   if(points.length)data.queries.push({tick:at,start,goal,radius,blocked:[...blocked??[]],points,
    walkable:Array.from(spatial.terrain,(_,cell)=>+spatial.walkable(cell)),heights:Array.from(spatial.heights),
    result,rasterRejected:spatial.routing.meshRasterRejected-before});
   return result;
  }finally{query.computePathWithEndpointPadding=compute;}
 };
 return {data,dispose:()=>{spatial.findPath=find;}};
}
