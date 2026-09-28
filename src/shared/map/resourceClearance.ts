/** Inclusive cell envelopes, shared by construction, AI and map-start validation. */
type Footprint = {width:number;depth:number};
type Point = {x:number;y:number};
export function footprintHalfExtents(footprint:Footprint={width:1,depth:1},rotation=0):Point {
 const swap=Math.round(rotation/90)%2!==0;
 return {x:Math.floor((swap?footprint.depth:footprint.width)/2),y:Math.floor((swap?footprint.width:footprint.depth)/2)};
}
export function resourceBlocksCell(cell:Point,position:Point,footprint:Footprint|undefined,clearance:number,rotation=0):boolean {
 const half=footprintHalfExtents(footprint,rotation);
 return Math.abs(cell.x-position.x)<=half.x+clearance&&Math.abs(cell.y-position.y)<=half.y+clearance;
}
/** Cells a standing resource blocks for movement: its footprint, widened to a disc of
 * `collisionRadius × scale` when declared. Forest spacing is ~3.7 cells, so a radius of 2
 * makes neighbouring trees merge into a wall that units must chop through, as in WC3/AoE. */
export function resourceCollisionCells(position:Point,footprint:Footprint|undefined,collisionRadius:number|undefined,scale=1,rotation=0):Point[] {
 const half=footprintHalfExtents(footprint,rotation),r=(collisionRadius??0)*scale,reach=Math.max(half.x,half.y,Math.floor(r)),out:Point[]=[];
 for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++)
  if((Math.abs(dx)<=half.x&&Math.abs(dy)<=half.y)||dx*dx+dy*dy<=r*r)out.push({x:position.x+dx,y:position.y+dy});
 return out;
}
/** Smallest integer center separation along either axis that preserves the service lane. */
export function resourceCenterSeparation(building:Footprint,resource:Footprint,clearance:number,buildingRotation=0,resourceRotation=0):Point {
 const a=footprintHalfExtents(building,buildingRotation),b=footprintHalfExtents(resource,resourceRotation);
 return {x:a.x+b.x+clearance+1,y:a.y+b.y+clearance+1};
}
