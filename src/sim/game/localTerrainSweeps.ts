import {clearSweep,type FixedPoint} from './motion';

const SPACING=250,TILE=32,MAX_TILES=128;
type Tile={known:Uint16Array;clear:Uint16Array};

/** Exact terrain-only quarter-cell edges used by local steering. Sparse tiles
 * avoid map-sized fields. Bodies/reservations never enter this derived cache. */
export class LocalTerrainSweeps {
 private readonly tiles=new Map<number,Tile>();
 private readonly width:number;
 constructor(private readonly size:number,private readonly radius:number,
  private readonly step:(a:number,b:number)=>boolean){this.width=Math.ceil(size*4/TILE);}

 clear(from:FixedPoint,to:FixedPoint):boolean {
  const x=from.x/SPACING,y=from.y/SPACING,dx=(to.x-from.x)/SPACING,dy=(to.y-from.y)/SPACING;
  if(from.surface||to.surface||!Number.isInteger(x)||!Number.isInteger(y)||
   !Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)>1||Math.abs(dy)>1||
   x<0||y<0||x>=this.size*4||y>=this.size*4)
   return clearSweep(from,to,this.step,this.size,this.radius);
  const key=Math.floor(y/TILE)*this.width+Math.floor(x/TILE);
  let tile=this.tiles.get(key);
  if(!tile){
   if(this.tiles.size===MAX_TILES)this.tiles.delete(this.tiles.keys().next().value!);
   tile={known:new Uint16Array(TILE*TILE),clear:new Uint16Array(TILE*TILE)};this.tiles.set(key,tile);
  }
  const id=(y%TILE)*TILE+x%TILE,bit=1<<((dy+1)*3+dx+1);
  if(!(tile.known[id]!&bit)){
   if(clearSweep(from,to,this.step,this.size,this.radius))tile.clear[id]!|=bit;
   tile.known[id]!|=bit;
  }
  return !!(tile.clear[id]!&bit);
 }

 invalidate(cells?:readonly number[]):void {
  if(!cells){this.tiles.clear();return;}
  // A changed cell can affect any ray offset of an adjacent quarter-step,
  // including bilinear/diagonal side checks and a body crossing a tile edge.
  const padding=Math.ceil(this.radius/1000)+1;
  for(const cell of cells){
   const x=cell%this.size,y=Math.floor(cell/this.size);
   for(let ty=Math.max(0,Math.floor((y-padding)*4/TILE));ty<=Math.min(this.width-1,Math.floor((y+padding)*4/TILE));ty++)
    for(let tx=Math.max(0,Math.floor((x-padding)*4/TILE));tx<=Math.min(this.width-1,Math.floor((x+padding)*4/TILE));tx++)this.tiles.delete(ty*this.width+tx);
  }
 }
}
