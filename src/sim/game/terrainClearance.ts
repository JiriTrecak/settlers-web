import {MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import type {FixedPoint} from './motion';

/** Positive proof for long ground sweeps. Occupancy and directed incoming
 * height edges are separate: a nearby cliff is relevant only if a ray can
 * cross it in this sweep's direction (including diagonal corner checks).
 * Test the swept square's horizontal spans, not dozens of overlapping rays.
 * An unsafe span is inconclusive: the original exact sweep decides it.
 * Derived only from static terrain/occupancy, never units or reservations.
 */
export class TerrainClearance {
 private readonly width:number;
 private readonly occupied:Uint32Array;
 private readonly slopes:Uint32Array[];
 constructor(private readonly size:number,private readonly heights:Int16Array,
  private readonly walkable:(cell:number)=>boolean){
  this.width=Math.ceil(size/32);this.occupied=new Uint32Array(this.width*size);
  this.slopes=Array.from({length:9},()=>new Uint32Array(this.width*size));this.invalidate();
 }
 invalidate(cells?:readonly number[]):void {
  if(cells){for(const cell of cells)this.refresh(cell);return;}
  // Explicit terrain/height rebuild only. Ordinary building/resource changes
  // refresh the affected occupancy bits without rechecking immutable slopes.
  for(const plane of this.slopes)plane.fill(0);
  for(let y=0;y<this.size;y++)for(let x=0;x<this.size;x++){
   const cell=y*this.size+x,height=this.heights[cell],word=y*this.width+(x>>>5),bit=1<<(x&31);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const px=x-dx,py=y-dy;
    if(px>=0&&py>=0&&px<this.size&&py<this.size&&Math.abs(height-this.heights[py*this.size+px])>MAX_GROUND_STEP_CM)
     this.slopes[(dy+1)*3+dx+1]![word]!|=bit;
   }
   this.refresh(cell);
  }
 }
 private refresh(cell:number):void {
  const y=Math.floor(cell/this.size),x=cell%this.size,word=y*this.width+(x>>>5),mask=1<<(x&31);
  if(!this.walkable(cell))this.occupied[word]|=mask;
  else this.occupied[word]&=~mask;
 }
 provesClear(from:FixedPoint,to:FixedPoint,radius:number):boolean {
  const dx=to.x-from.x,dy=to.y-from.y;
  // All parallel footprint rays share these signs. DDA visits only the two
  // forward cardinal edges and the forward diagonal; it never steps backward.
  const sx=Math.sign(dx),sy=Math.sign(dy);
  const horizontal=this.slopes[4+sx]!,vertical=this.slopes[4+sy*3]!,diagonal=this.slopes[4+sy*3+sx]!;
  const left=Math.min(from.x,to.x)-radius,right=Math.max(from.x,to.x)+radius;
  const top=Math.min(from.y,to.y)-radius,bottom=Math.max(from.y,to.y)+radius;
  // DDA cells are centered on integer coordinates, with half-cell boundaries.
  if(left< -500||top< -500||right>=this.size*1000-500||bottom>=this.size*1000-500)return false;
  const y0=Math.floor((top+500)/1000),y1=Math.floor((bottom+500)/1000);
  for(let y=y0;y<=y1;y++){
   let enter=0,leave=1;
   if(dy){const a=(y*1000-500-radius-from.y)/dy,b=(y*1000+500+radius-from.y)/dy;
    enter=Math.max(0,Math.min(a,b));leave=Math.min(1,Math.max(a,b));}
   // Include both corner-touching cells. A tiny outward margin protects the
   // conservative envelope from floating-point division roundoff.
   const a=from.x+dx*enter,b=from.x+dx*leave;
   const x0=Math.max(0,Math.floor((Math.min(a,b)-radius+500-1e-7)/1000));
   const x1=Math.min(this.size-1,Math.floor((Math.max(a,b)+radius+500+1e-7)/1000));
   const first=x0>>>5,last=x1>>>5,row=y*this.width;
   for(let word=first;word<=last;word++){
    const low=word===first?0xffffffff<<(x0&31):0xffffffff;
    const high=word===last?0xffffffff>>>(31-(x1&31)):0xffffffff;
    const index=row+word;
    if((this.occupied[index]!|horizontal[index]!|vertical[index]!|diagonal[index]!)&low&high)return false;
   }
  }
  return true;
 }
}
