/** Engine rules, in centimetres. Model size never changes tactical sight. */
export const SIGHT_HEIGHT_CM = 120;
export const MAX_GROUND_STEP_CM = 90;
export const MAX_FOUNDATION_RELIEF_CM = 50;
export type TerrainPoint = {x:number;y:number;elevation?:number};

/** Immutable match terrain. Shares the movement grid, including bridge decks.
 * Visibility caches are derived, bounded, and deliberately absent from saves. */
export class TacticalTerrain {
  private readonly views = new Map<string, Uint32Array>();
  private cachedCells=0;
  // Bounded by bytes as well as entries: at most 4 MiB of cell IDs.
  private readonly cacheCellBudget=1024*1024;
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
    return this.heightAt(p.x,p.y);
  }
  private heightAt(px:number,py:number):number {
    const x=Math.max(0,Math.min(this.size-1,px)),y=Math.max(0,Math.min(this.size-1,py));
    const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,this.size-1),jy=Math.min(iy+1,this.size-1);
    const u=x-ix,v=y-iy,h=this.heights,n=this.size;
    return (h[iy*n+ix]*(1-u)+h[iy*n+jx]*u)*(1-v)+(h[jy*n+ix]*(1-u)+h[jy*n+jx]*u)*v;
  }
  /** A lower observer cannot reveal a plateau above the common sight offset.
   * The same rule reveals progressively while climbing a ramp. */
  visible(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    const from=this.heightAt(a.x,a.y)+(a.elevation??0)*100+SIGHT_HEIGHT_CM,groundTo=this.heightAt(b.x,b.y)+(b.elevation??0)*100;
    if(groundTo>from)return false;
    return this.corridorClear(a,b,from,groundTo+SIGHT_HEIGHT_CM);
  }
  /** Straight weapon corridor, not a visibility test. Allied scouts can provide
   * vision uphill, but intermediate terrain still intercepts a shot. */
  shotClear(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    const from=this.height(a)+(a.elevation??0)*100+SIGHT_HEIGHT_CM,to=this.height(b)+(b.elevation??0)*100+SIGHT_HEIGHT_CM;
    return this.corridorClear(a,b,from,to);
  }
  private corridorClear(a:TerrainPoint,b:TerrainPoint,from:number,to:number):boolean {
    // Most RTS sight rays cross a level shelf. A conservative block maximum
    // rejects the expensive ray march without admitting any hidden terrain.
    const ax=a.x,ay=a.y,bx=b.x,by=b.y,dx=bx-ax,dy=by-ay;
    const minY=Math.max(0,Math.floor(Math.min(ay,by)/16)),maxY=Math.min(this.blockSize-1,Math.floor((Math.max(ay,by)+1)/16));
    const minX=Math.max(0,Math.floor(Math.min(ax,bx)/16)),maxX=Math.min(this.blockSize-1,Math.floor((Math.max(ax,bx)+1)/16));
    let maximum=-32768;
    for(let y=minY;y<=maxY;y++)
      for(let x=minX;x<=maxX;x++)maximum=Math.max(maximum,this.blocks[y*this.blockSize+x]);
    if(maximum<=Math.min(from,to))return true;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*4));
    for(let i=1;i<steps;i++){
      const t=i/steps;
      if(this.heightAt(ax+dx*t,ay+dy*t)>from+(to-from)*t)return false;
    }
    return true;
  }
  /** Physical reach: no striking through a cliff even with shared vision. */
  meleeClear(a:TerrainPoint,b:TerrainPoint):boolean {
    if(this.flat)return true;
    const from=this.height(a);
    if(Math.abs(from-this.height(b))>MAX_GROUND_STEP_CM)return false;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*4));
    let prev=from;
    const segmentLength=Math.hypot(b.x-a.x,b.y-a.y)/steps;
    for(let i=1;i<=steps;i++){
      const t=i/steps,h=this.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
      if(Math.abs(h-prev)>MAX_GROUND_STEP_CM*segmentLength+1)return false;
      prev=h;
    }
    return true;
  }
  visibleCells(a:TerrainPoint,radius:number):Uint32Array{
    const x=Math.round(a.x),y=Math.round(a.y),r=Math.ceil(radius),key=`${x}:${y}:${radius}:${a.elevation??0}`;
    const cached=this.views.get(key);if(cached){this.views.delete(key);this.views.set(key,cached);return cached;}
    const cells:number[]=[],origin={x,y,elevation:a.elevation},target={x:0,y:0};
    for(let dy=-r;dy<=r;dy++){
      if(y+dy<0||y+dy>=this.size||dy*dy>radius*radius)continue;
      const span=Math.floor(Math.sqrt(radius*radius-dy*dy));
      target.y=y+dy;
      for(let xx=Math.max(0,x-span);xx<=Math.min(this.size-1,x+span);xx++){
        target.x=xx;
        if(this.visible(origin,target))cells.push((y+dy)*this.size+xx);
      }
    }
    const result=Uint32Array.from(cells);
    if(result.length<=this.cacheCellBudget){
      while(this.views.size&&(this.views.size>=4096||this.cachedCells+result.length>this.cacheCellBudget)){
        const oldest=this.views.keys().next().value!;this.cachedCells-=this.views.get(oldest)!.length;this.views.delete(oldest);
      }
      this.views.set(key,result);this.cachedCells+=result.length;
    }
    return result;
  }
}
