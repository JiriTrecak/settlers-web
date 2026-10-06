import {clearRay,clearSweep,type FixedPoint} from './motion';
import type {WalkSurfaces} from '../../shared/map/walkSurfaces';

/** One body/portal clearance contract for live movement and observed AI routes. */
export function clearLayeredSweep(graph:WalkSurfaces,from:FixedPoint,to:FixedPoint,height:number,radius:number,
 walkable:(id:number)=>boolean,blocked?:{has:(id:number)=>boolean}):boolean {
  const layerPoint=(p:FixedPoint)=>({x:Math.floor((p.x+500)/1000),y:Math.floor((p.y+500)/1000),...(p.surface?{surface:p.surface}:{})});
  const start=graph.node(layerPoint(from)),goal=graph.node(layerPoint(to));
  if(start===undefined||goal===undefined)return false;
  const blockedNode=(n:import('../../shared/map/walkSurfaces').SurfaceNode)=>!walkable(n.id)||!graph.walkable(n.id,Math.round(height*100))||!!blocked?.has(n.id);
  const node=(cell:number,surface:string|undefined)=>graph.node({x:cell%graph.size,y:Math.floor(cell/graph.size),surface});
  const step=(a:number,b:number)=>{
    const na=node(a,from.surface),nb=node(b,from.surface);if(na===undefined||nb===undefined)return false;
    return graph.step(na,nb,blockedNode);
  };
  if(from.surface!==to.surface){
    // Never smooth past a portal. The crossing is a single cardinal edge.
    if(!graph.step(start,goal,blockedNode))return false;
  }else if(!clearRay(from,to,step,graph.size))return false;
  // Sweep the same physical footprint used on ordinary terrain. At a
  // portal its leading/trailing corners can already touch the other floor
  // before the center changes surface. Only an adjacent legal portal edge
  // permits that fallback; side rails and unrelated overlapping floors do not.
  const candidates=(cell:number)=>{
    const result:number[]=[];
    for(const id of [node(cell,from.surface),node(cell,to.surface)])
      if(id!==undefined&&walkable(id)&&graph.walkable(id,Math.round(height*100))&&!result.includes(id))result.push(id);
    if(!result.length){
      for(const id of graph.at(cell%graph.size,Math.floor(cell/graph.size)))
        if((graph.step(start,id)||graph.step(goal,id))&&walkable(id))result.push(id);
    }
    return result;
  };
  return clearSweep(from,to,(a,b)=>candidates(a).some(na=>candidates(b).some(nb=>graph.step(na,nb,blockedNode))),graph.size,radius);

}
