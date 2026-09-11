/** Engine rules, in centimetres. Model size never changes tactical sight. */
export const SIGHT_HEIGHT_CM = 120;
export const MAX_GROUND_STEP_CM = 90;
export const MAX_FOUNDATION_RELIEF_CM = 50;
export type TerrainPoint = {x:number;y:number};

/** Immutable match terrain. Shares the movement grid, including bridge decks.
 * Visibility caches are derived, bounded, and deliberately absent from saves. */
export class TacticalTerrain {
  private readonly views = new Map<string, readonly number[]>();
  private readonly flat:boolean;
  private readonly blocks:Int16Array;
  private readonly blockSize:number;
  constructor(readonly size:number, readonly heights:Int16Array){
    this.flat=heights.every(h=>h===heights[0]);
    this.blockSize=Math.ceil(size/16);this.blocks=new Int16Array(this.blockSize**2).fill(-32768);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=Math.floor(y/16)*this.blockSize+Math.floor(x/16);this.blocks[i]=Math.max(this.blocks[i],heights[y*size+x]);
    }
  }
  height(p:TerrainPoint):number {
    const x=Math.max(0,Math.min(this.size-1,p.x)),y=Math.max(0,Math.min(this.size-1,p.y));
    const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,this.size-1),jy=Math.min(iy+1,this.size-1);
    const u=x-ix,v=y-iy,h=this.heights,n=this.size;
    return (h[iy*n+ix]*(1-u)+h[iy*n+jx]*u)*(1-v)+(h[jy*n+ix]*(1-u)+h[jy*n+jx]*u)*v;
  }
  /** A lower observer cannot reveal a plateau above the common sight offset.
   * The same rule reveals progressively while climbing a ramp. */
  visible(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    if(this.height(b)>this.height(a)+SIGHT_HEIGHT_CM)return false;
    return this.shotClear(a,b);
  }
  /** Straight weapon corridor, not a visibility test. Allied scouts can provide
   * vision uphill, but intermediate terrain still intercepts a shot. */
  shotClear(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    const from=this.height(a)+SIGHT_HEIGHT_CM,to=this.height(b)+SIGHT_HEIGHT_CM;
    // Most RTS sight rays cross a level shelf. A conservative block maximum
    // rejects the expensive ray march without admitting any hidden terrain.
    let maximum=-32768;
    for(let y=Math.max(0,Math.floor(Math.min(a.y,b.y)/16));y<=Math.min(this.blockSize-1,Math.floor((Math.max(a.y,b.y)+1)/16));y++)
      for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x)/16));x<=Math.min(this.blockSize-1,Math.floor((Math.max(a.x,b.x)+1)/16));x++)maximum=Math.max(maximum,this.blocks[y*this.blockSize+x]);
    if(maximum<=Math.min(from,to))return true;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*4));
    for(let i=1;i<steps;i++){
      const t=i/steps;
      if(this.height({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})>from+(to-from)*t)return false;
    }
    return true;
  }
  /** Physical reach: no striking through a cliff even with shared vision. */
  meleeClear(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    if(Math.abs(this.height(a)-this.height(b))>MAX_GROUND_STEP_CM)return false;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*4));
    let prev=this.height(a);
    const segmentLength=Math.hypot(b.x-a.x,b.y-a.y)/steps;
    for(let i=1;i<=steps;i++){
      const t=i/steps,h=this.height({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      if(Math.abs(h-prev)>MAX_GROUND_STEP_CM*segmentLength+1)return false;
      prev=h;
    }
    return true;
  }
  visibleCells(a:TerrainPoint,radius:number):readonly number[]{
    const x=Math.round(a.x),y=Math.round(a.y),r=Math.ceil(radius),key=`${x}:${y}:${radius}`;
    const cached=this.views.get(key);if(cached)return cached;
    const cells:number[]=[];
    for(let dy=-r;dy<=r;dy++){
      if(y+dy<0||y+dy>=this.size||dy*dy>radius*radius)continue;
      const span=Math.floor(Math.sqrt(radius*radius-dy*dy));
      for(let xx=Math.max(0,x-span);xx<=Math.min(this.size-1,x+span);xx++)
        if(this.visible({x,y},{x:xx,y:y+dy}))cells.push((y+dy)*this.size+xx);
    }
    if(this.views.size>=256)this.views.delete(this.views.keys().next().value!);
    this.views.set(key,cells);return cells;
  }
}
