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
/** Smallest integer center separation along either axis that preserves the service lane. */
export function resourceCenterSeparation(building:Footprint,resource:Footprint,clearance:number,buildingRotation=0,resourceRotation=0):Point {
 const a=footprintHalfExtents(building,buildingRotation),b=footprintHalfExtents(resource,resourceRotation);
 return {x:a.x+b.x+clearance+1,y:a.y+b.y+clearance+1};
}
