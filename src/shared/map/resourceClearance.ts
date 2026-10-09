import {footprintCellBounds, rotatedFootprint, type Footprint, type SpatialPoint as Point} from '../spatial/footprint.ts';
/** Extents between outer cell centers, not physical edges. */
export function footprintHalfExtents(footprint:Footprint={width:1,depth:1},rotation=0):Point {
 const {width,depth}=rotatedFootprint(footprint,rotation);
 return {x:(width-1)/2,y:(depth-1)/2};
}
export function resourceBlocksCell(cell:Point,position:Point,footprint:Footprint|undefined,clearance:number,rotation=0):boolean {
 const b=footprintCellBounds(position,footprint,rotation);
 return cell.x>=b.minX-clearance&&cell.x<=b.maxX+clearance&&cell.y>=b.minY-clearance&&cell.y<=b.maxY+clearance;
}
/** Cells a standing resource blocks for movement: its footprint, widened to a disc of
 * `collisionRadius × scale` when declared. Forest spacing is ~3.7 cells, so a radius of 2
 * makes neighbouring trees merge into a wall that units must chop through, as in WC3/AoE. */
export function resourceCollisionCells(position:Point,footprint:Footprint|undefined,collisionRadius:number|undefined,scale=1,rotation=0):Point[] {
 const b=footprintCellBounds(position,footprint,rotation),r=(collisionRadius??0)*scale,out:Point[]=[];
 for(let y=Math.min(b.minY,Math.ceil(position.y-r));y<=Math.max(b.maxY,Math.floor(position.y+r));y++)
  for(let x=Math.min(b.minX,Math.ceil(position.x-r));x<=Math.max(b.maxX,Math.floor(position.x+r));x++)
   if((x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY)||(x-position.x)**2+(y-position.y)**2<=r*r)out.push({x,y});
 return out;
}
/** Center separation that preserves the physical service lane (including half-cell centers). */
export function resourceCenterSeparation(building:Footprint,resource:Footprint,clearance:number,buildingRotation=0,resourceRotation=0):Point {
 const a=footprintHalfExtents(building,buildingRotation),b=footprintHalfExtents(resource,resourceRotation);
 return {x:a.x+b.x+clearance+1,y:a.y+b.y+clearance+1};
}
