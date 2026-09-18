/** Connected components of the static walk grid. Four-neighbor connectivity is
 * sufficient: a legal diagonal already requires its two cardinal corridors.
 * Units are intentionally absent; they can block a route but cannot join islands. */
export class WalkRegions {
  private readonly labels: Int32Array;
  private readonly queue: Int32Array;
  private dirty = true;
  private regionCount=0;
  constructor(private readonly size:number,private readonly walkable:(cell:number)=>boolean,
    private readonly heights:Int16Array,private readonly maxStep:number) {
    this.labels=new Int32Array(size*size);this.queue=new Int32Array(size*size);
  }
  invalidate(){this.dirty=true;}
  /** Ordinary tree removal opens cells into the same surrounding component.
   * Patch those locally. A merge of different regions falls back to the full
   * flood fill, as does inserting any new obstacle through invalidate(). */
  open(cells:Iterable<number>){
    if(this.dirty)return;
    const n=this.size;
    for(const cell of cells){
      if(!this.walkable(cell))continue;
      const x=cell%n,y=Math.floor(cell/n);let label=0;
      for(const other of [x>0?cell-1:-1,x+1<n?cell+1:-1,y>0?cell-n:-1,y+1<n?cell+n:-1]){
        if(other<0||Math.abs(this.heights[cell]!-this.heights[other]!)>this.maxStep)continue;
        const adjacent=this.labels[other]!;if(!adjacent)continue;
        if(label&&adjacent!==label){this.dirty=true;return;}label=adjacent;
      }
      this.labels[cell]=label||++this.regionCount;
    }
  }
  connected(start:number,goal:number):boolean {
    if(this.dirty)this.rebuild();
    const destination=this.labels[goal];if(!destination)return false;
    if(this.labels[start])return this.labels[start]===destination;
    // A unit may leave a cell occupied by a newly placed building. The movement
    // graph checks the destination, not the origin; preserve that escape route.
    const x=start%this.size,y=Math.floor(start/this.size);
    return ((x>0&&this.labels[start-1]===destination&&Math.abs(this.heights[start]!-this.heights[start-1]!)<=this.maxStep)||
      (x+1<this.size&&this.labels[start+1]===destination&&Math.abs(this.heights[start]!-this.heights[start+1]!)<=this.maxStep)||
      (y>0&&this.labels[start-this.size]===destination&&Math.abs(this.heights[start]!-this.heights[start-this.size]!)<=this.maxStep)||
      (y+1<this.size&&this.labels[start+this.size]===destination&&Math.abs(this.heights[start]!-this.heights[start+this.size]!)<=this.maxStep));
  }
  private rebuild(){
    this.dirty=false;this.labels.fill(0);let region=0;
    const n=this.size,total=n*n,labels=this.labels,queue=this.queue,heights=this.heights;
    for(let start=0;start<total;start++){
      if(labels[start]||!this.walkable(start))continue;
      labels[start]=++region;queue[0]=start;let head=0,tail=1;
      while(head<tail){
        const a=queue[head++]!,x=a%n,y=Math.floor(a/n);
        for(let direction=0;direction<4;direction++){
          if(direction===0&&x===0||direction===1&&x===n-1||direction===2&&y===0||direction===3&&y===n-1)continue;
          const b=a+(direction===0?-1:direction===1?1:direction===2?-n:n);
          if(labels[b]||!this.walkable(b)||Math.abs(heights[a]!-heights[b]!)>this.maxStep)continue;
          labels[b]=region;queue[tail++]=b;
        }
      }
    }
    this.regionCount=region;
  }
}
