const TILE=16,MAX_TILES=256;
type Tile={known:Uint16Array;clear:Uint16Array};

/** Exact directed adjacent terrain checks, including stationary footprint tests.
 * Sparse, bounded storage; live reservations must be checked outside this cache.
 * The caller supplies the full footprint halo for local invalidation.
 */
export class TerrainStepCache {
 private readonly tiles=new Map<number,Tile>();
 private readonly width:number;
 constructor(private readonly size:number,private readonly padding:number,
  private readonly step:(from:number,to:number)=>boolean){this.width=Math.ceil(size/TILE);}
 clear(from:number,to:number):boolean {
  if(from<0||to<0||from>=this.size*this.size||to>=this.size*this.size)return this.step(from,to);
  const x=from%this.size,y=Math.floor(from/this.size),dx=to%this.size-x,dy=Math.floor(to/this.size)-y;
  if(Math.abs(dx)>1||Math.abs(dy)>1)return this.step(from,to);
  const key=Math.floor(y/TILE)*this.width+Math.floor(x/TILE);
  let tile=this.tiles.get(key);
  if(!tile){
   if(this.tiles.size===MAX_TILES)this.tiles.delete(this.tiles.keys().next().value!);
   tile={known:new Uint16Array(TILE*TILE),clear:new Uint16Array(TILE*TILE)};this.tiles.set(key,tile);
  }
  const id=y%TILE*TILE+x%TILE,bit=1<<((dy+1)*3+dx+1);
  if(!(tile.known[id]!&bit)){
   if(this.step(from,to))tile.clear[id]!|=bit;
   tile.known[id]!|=bit;
  }
  return !!(tile.clear[id]!&bit);
 }
 invalidate(cells?:readonly number[]):void {
  if(!cells){this.tiles.clear();return;}
  const invalidated=new Set<number>();
  for(const cell of cells){
   const x=cell%this.size,y=Math.floor(cell/this.size),p=this.padding;
   for(let ty=Math.max(0,Math.floor((y-p)/TILE));ty<=Math.min(this.width-1,Math.floor((y+p)/TILE));ty++)
    for(let tx=Math.max(0,Math.floor((x-p)/TILE));tx<=Math.min(this.width-1,Math.floor((x+p)/TILE));tx++){
     const tile=ty*this.width+tx;if(invalidated.has(tile))continue;invalidated.add(tile);this.tiles.delete(tile);
    }
  }
 }
}
