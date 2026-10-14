import {clearSweep,type FixedPoint} from './motion';

const SPACING=250,TILE=32,MAX_TILES=128,MAX_STEP=8;
type Tile={known:Uint16Array;clear:Uint16Array};

/** Exact terrain-only local edges on the quarter-cell lattice.
 * Larger bodies steer in multiples of that spacing; retain the stride in the
 * cache key, rather than treating every scaled search edge as an uncached ray.
 * Sparse tiles avoid map-sized fields. Bodies/reservations never enter this derived cache. */
export class LocalTerrainSweeps {
 private readonly tiles=new Map<number,Tile>();
 private readonly width:number;
 constructor(private readonly size:number,private readonly radius:number,
  private readonly step:(a:number,b:number)=>boolean){this.width=Math.ceil(size*4/TILE);}

 clear(from:FixedPoint,to:FixedPoint):boolean {
  const x=from.x/SPACING,y=from.y/SPACING,dx=(to.x-from.x)/SPACING,dy=(to.y-from.y)/SPACING;
  const stride=Math.max(1,Math.abs(dx),Math.abs(dy));
  if(from.surface||to.surface||!Number.isInteger(x)||!Number.isInteger(y)||
   !Number.isInteger(dx)||!Number.isInteger(dy)||stride>MAX_STEP||
   (dx!==0&&Math.abs(dx)!==stride)||(dy!==0&&Math.abs(dy)!==stride)||
   x<0||y<0||x>=this.size*4||y>=this.size*4)
   return clearSweep(from,to,this.step,this.size,this.radius);
  const key=(Math.floor(y/TILE)*this.width+Math.floor(x/TILE))*MAX_STEP+stride-1;
  let tile=this.tiles.get(key);
  if(!tile){
   if(this.tiles.size===MAX_TILES)this.tiles.delete(this.tiles.keys().next().value!);
   tile={known:new Uint16Array(TILE*TILE),clear:new Uint16Array(TILE*TILE)};this.tiles.set(key,tile);
  }
  const id=(y%TILE)*TILE+x%TILE,bit=1<<((dy/stride+1)*3+dx/stride+1);
  if(!(tile.known[id]!&bit)){
   if(clearSweep(from,to,this.step,this.size,this.radius))tile.clear[id]!|=bit;
   tile.known[id]!|=bit;
  }
  return !!(tile.clear[id]!&bit);
 }

 invalidate(cells?:readonly number[]):void {
  if(!cells){this.tiles.clear();return;}
  // A changed cell can affect any ray offset of the longest cached step,
  // including bilinear/diagonal side checks and a body crossing a tile edge.
  const padding=Math.ceil(this.radius/1000)+Math.ceil(MAX_STEP*SPACING/1000)+1;
  const invalidated=new Set<number>();
  for(const cell of cells){
   const x=cell%this.size,y=Math.floor(cell/this.size);
   for(let ty=Math.max(0,Math.floor((y-padding)*4/TILE));ty<=Math.min(this.width-1,Math.floor((y+padding)*4/TILE));ty++)
    for(let tx=Math.max(0,Math.floor((x-padding)*4/TILE));tx<=Math.min(this.width-1,Math.floor((x+padding)*4/TILE));tx++){
     const tile=ty*this.width+tx;if(invalidated.has(tile))continue;invalidated.add(tile);
     for(let stride=0;stride<MAX_STEP;stride++)this.tiles.delete(tile*MAX_STEP+stride);
    }
  }
 }
}
