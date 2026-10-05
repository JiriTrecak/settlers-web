/** Engine rules, in centimetres. Model size never changes tactical sight. */
export const SIGHT_HEIGHT_CM = 120;
export const MAX_GROUND_STEP_CM = 90;
export const MAX_FOUNDATION_RELIEF_CM = 50;
/** Sorted non-overlapping half-open intervals of visible cell IDs. Immutable. */
export type VisibilityFootprint={readonly spans:Uint32Array;readonly cellCount:number};
type SightWork={rays:number;coarseClear:number;groups:number;groupsClear:number;samples:number;blocked:number};
export type TerrainPoint = {x:number;y:number;elevation?:number};

/** Immutable match terrain. Shares the movement grid, including bridge decks.
 * Visibility caches are derived, bounded, and deliberately absent from saves. */
export class TacticalTerrain {
  /** Optional render-independent work counters; never consulted by sight rules. */
  diagnostics?:{readonly enabled:boolean;count(name:string,value?:number):void};
  private readonly views = new Map<string, VisibilityFootprint>();
  private cachedCells=0;
  private denseViews=new WeakMap<VisibilityFootprint,Uint32Array>();
  // Charge both spans and potential dense materialization against the 4 MiB budget.
  private readonly cacheCellBudget=1024*1024;
  private readonly flat:boolean;
  // Four-cell maxima allow clear portions of an otherwise occluded ray to skip
  // eight original samples at a time. 32 KiB for a 512-square map.
  private readonly fineBlocks:Int16Array;
  private readonly fineSize:number;
  private readonly blocks:Int16Array;
  private readonly blockMinimums:Int16Array;
  private readonly blockSize:number;
  constructor(readonly size:number, readonly heights:Int16Array){
    this.fineSize=Math.ceil(size/4);this.fineBlocks=new Int16Array(this.fineSize**2).fill(-32768);
    this.flat=heights.every(h=>h===heights[0]);
    this.blockSize=Math.ceil(size/16);this.blocks=new Int16Array(this.blockSize**2).fill(-32768);
    this.blockMinimums=new Int16Array(this.blockSize**2).fill(32767);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const f=Math.floor(y/4)*this.fineSize+Math.floor(x/4);this.fineBlocks[f]=Math.max(this.fineBlocks[f],heights[y*size+x]);
      const i=Math.floor(y/16)*this.blockSize+Math.floor(x/16);this.blocks[i]=Math.max(this.blocks[i],heights[y*size+x]);
      this.blockMinimums[i]=Math.min(this.blockMinimums[i],heights[y*size+x]);
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
  private corridorClear(a:TerrainPoint,b:TerrainPoint,from:number,to:number,work?:SightWork):boolean {
    // Most RTS sight rays cross a level shelf. A conservative block maximum
    // rejects the expensive ray march without admitting any hidden terrain.
    if(work)work.rays++;
    const ax=a.x,ay=a.y,bx=b.x,by=b.y,dx=bx-ax,dy=by-ay;
    const minY=Math.max(0,Math.floor(Math.min(ay,by)/16)),maxY=Math.min(this.blockSize-1,Math.floor((Math.max(ay,by)+1)/16));
    const minX=Math.max(0,Math.floor(Math.min(ax,bx)/16)),maxX=Math.min(this.blockSize-1,Math.floor((Math.max(ax,bx)+1)/16));
    let maximum=-32768;
    for(let y=minY;y<=maxY;y++)
      for(let x=minX;x<=maxX;x++)maximum=Math.max(maximum,this.blocks[y*this.blockSize+x]);
    if(maximum<=Math.min(from,to)){if(work)work.coarseClear++;return true;}
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*4));
    // A bilinear surface never exceeds the largest corner height. Bound each
    // sample group, including the extra interpolation row/column; march only
    // groups whose maximum could intersect the sight line. Retain the original
    // sample indices and arithmetic for every unresolved group.
    for(let start=1;start<steps;start+=8){
      if(work)work.groups++;
      const end=Math.min(start+7,steps-1),t0=start/steps,t1=end/steps;
      const x0=Math.max(0,Math.min(this.size-1,ax+dx*t0)),x1=Math.max(0,Math.min(this.size-1,ax+dx*t1));
      const y0=Math.max(0,Math.min(this.size-1,ay+dy*t0)),y1=Math.max(0,Math.min(this.size-1,ay+dy*t1));
      const minX=Math.floor(Math.min(x0,x1)/4),maxX=Math.min(this.fineSize-1,Math.floor((Math.max(x0,x1)+1)/4));
      const minY=Math.floor(Math.min(y0,y1)/4),maxY=Math.min(this.fineSize-1,Math.floor((Math.max(y0,y1)+1)/4));
      let high=-32768;
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)high=Math.max(high,this.fineBlocks[y*this.fineSize+x]);
      // Strict margin also protects the bound from interpolation roundoff.
      if(high<Math.min(from+(to-from)*t0,from+(to-from)*t1)-1e-9){if(work)work.groupsClear++;continue;}
      for(let i=start;i<=end;i++){
        const t=i/steps;
        if(work)work.samples++;
        if(this.heightAt(ax+dx*t,ay+dy*t)>from+(to-from)*t){if(work)work.blocked++;return false;}
      }
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
  visibleCells(a:TerrainPoint,radius:number):Uint32Array {
    const footprint=this.visibleSpans(a,radius),prior=this.denseViews.get(footprint);if(prior)return prior;
    const cells=new Uint32Array(footprint.cellCount);let at=0;
    for(let i=0;i<footprint.spans.length;i+=2)for(let cell=footprint.spans[i]!;cell<footprint.spans[i+1]!;cell++)cells[at++]=cell;
    this.denseViews.set(footprint,cells);return cells;
  }
  /** Fog coverage consumes intervals directly; clear circles never expand to cells. */
  visibleSpans(a:TerrainPoint,radius:number):VisibilityFootprint{
    const x=Math.round(a.x),y=Math.round(a.y),r=Math.ceil(radius),key=`${x}:${y}:${radius}:${a.elevation??0}`;
    const profile=this.diagnostics?.enabled?this.diagnostics:undefined;
    const cached=this.views.get(key);if(cached){profile?.count('Footprint cache hits');this.views.delete(key);this.views.set(key,cached);return cached;}
    profile?.count('Footprint cache misses');
    const work:SightWork|undefined=profile?{rays:0,coarseClear:0,groups:0,groupsClear:0,samples:0,blocked:0}:undefined;
    let candidates=0,tooHigh=0;
    const spans:number[]=[],origin={x,y,elevation:a.elevation},target={x:0,y:0};
    const from=this.heightAt(x,y)+(a.elevation??0)*100+SIGHT_HEIGHT_CM;
    // A gently varying shelf cannot occlude any ray when its highest point is
    // below both the observer and the lowest possible target eye height.
    // Include bilinear interpolation's extra row/column in the conservative box.
    let low=32767,high=-32768;
    for(let by=Math.max(0,Math.floor((y-r)/16));by<=Math.min(this.blockSize-1,Math.floor((y+r+1)/16));by++)
      for(let bx=Math.max(0,Math.floor((x-r)/16));bx<=Math.min(this.blockSize-1,Math.floor((x+r+1)/16));bx++){
        const i=by*this.blockSize+bx;low=Math.min(low,this.blockMinimums[i]);high=Math.max(high,this.blocks[i]);
      }
    const allClear=this.flat||high<=Math.min(from,low+SIGHT_HEIGHT_CM);
    profile?.count(allClear?'Clear shelf footprints':'Ray tested footprints');
    for(let dy=-r;dy<=r;dy++){
      if(y+dy<0||y+dy>=this.size||dy*dy>radius*radius)continue;
      const span=Math.floor(Math.sqrt(radius*radius-dy*dy));
      target.y=y+dy;
      const left=Math.max(0,x-span),right=Math.min(this.size-1,x+span),row=(y+dy)*this.size;
      if(left>right)continue;
      if(profile)candidates+=right-left+1;
      if(allClear){spans.push(row+left,row+right+1);continue;}
      let start=-1;
      for(let xx=left;xx<=right;xx++){
        target.x=xx;const cell=row+xx,ground=this.heights[cell];
        if(profile&&ground>from)tooHigh++;
        const clear=ground<=from&&this.corridorClear(origin,target,from,ground+SIGHT_HEIGHT_CM,work);
        if(clear){if(start===-1)start=cell;}
        else if(start!==-1){spans.push(start,cell);start=-1;}
      }
      if(start!==-1)spans.push(start,row+right+1);
    }
    let cellCount=0;for(let i=0;i<spans.length;i+=2)cellCount+=spans[i+1]!-spans[i]!;
    const result={spans:Uint32Array.from(spans),cellCount};
    if(profile&&work){
      profile.count('Candidate cells',candidates);profile.count('Height rejected cells',tooHigh);
      profile.count('Terrain rays',work.rays);profile.count('Coarse clear rays',work.coarseClear);
      profile.count('Fine ray groups',work.groups);profile.count('Fine groups skipped',work.groupsClear);
      profile.count('Bilinear height samples',work.samples);profile.count('Occluded rays',work.blocked);
      profile.count('Computed visible cells',cellCount);profile.count('Computed spans',spans.length/2);
    }
    const chargedCells=result.cellCount+result.spans.length;
    if(chargedCells<=this.cacheCellBudget){
      while(this.views.size&&(this.views.size>=4096||this.cachedCells+chargedCells>this.cacheCellBudget)){
        profile?.count('Footprint cache evictions');
        const oldest=this.views.keys().next().value!,entry=this.views.get(oldest)!;
        this.cachedCells-=entry.cellCount+entry.spans.length;this.views.delete(oldest);
      }
      this.views.set(key,result);this.cachedCells+=chargedCells;
    }
    return result;
  }
}
