import {SECTOR_SIZE} from '../../shared/spatial/sectors';
export const CARDINAL_COST = 1000;
export const DIAGONAL_COST = 1414;
const DIRECTIONS = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/** Adjacent movement with both side corridors clear, including their slopes. */
export function canTraverse(size: number, from: number, to: number, step: (a: number, b: number) => boolean): boolean {
  if (from < 0 || to < 0 || from >= size * size || to >= size * size) return false;
  const dx = to % size - from % size, dy = Math.floor(to / size) - Math.floor(from / size);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy) || !step(from, to)) return false;
  if (!dx || !dy) return true;
  const sideX = from + dx, sideY = from + dy * size;
  return step(from, sideX) && step(from, sideY) && step(sideX, to) && step(sideY, to);
}

/** Eight-neighbor integer A*: reusable buffers, octile heuristic and stable ties. */
export class Navigation {
  private readonly prev: Int32Array;
  private readonly cost: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private epoch = 0;
  lastExpanded=0;
  private readonly edges: Uint8Array;
  private readonly knownEdges: Uint8Array;
  private heapIds=new Int32Array(256);
  private heapCosts=new Int32Array(256);
  private heapHeuristics=new Int32Array(256);
  constructor(
    readonly size: number,
    private readonly canStep: (from: number, to: number) => boolean,
    private readonly connected?: (start:number,goal:number) => boolean,
    private readonly cacheTerrain = false,
  ) {
    const n = size * size;
    this.edges = new Uint8Array(cacheTerrain ? n : 0);
    this.knownEdges = new Uint8Array(cacheTerrain ? n : 0);
    this.prev = new Int32Array(n);
    this.cost = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }
  /** Terrain changes affect outgoing edges in the surrounding 3×3 cells,
   * including diagonal corner checks. Moving bodies never enter this cache. */
  invalidate(cells?:Iterable<number>):void {
    if(!this.cacheTerrain)return;
    if(!cells){this.knownEdges.fill(0);return;}
    for(const cell of cells){
      const x=cell%this.size,y=Math.floor(cell/this.size);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&ny>=0&&nx<this.size&&ny<this.size)this.knownEdges[ny*this.size+nx]=0;
      }
    }
  }
  private edgeMask(cell:number):number {
    if(this.knownEdges[cell])return this.edges[cell]!;
    const x=cell%this.size,y=Math.floor(cell/this.size);let mask=0;
    for(let i=0;i<DIRECTIONS.length;i++){
      const [dx,dy]=DIRECTIONS[i]!,nx=x+dx,ny=y+dy;
      if(nx>=0&&ny>=0&&nx<this.size&&ny<this.size&&canTraverse(this.size,cell,ny*this.size+nx,this.canStep))mask|=1<<i;
    }
    this.knownEdges[cell]=1;this.edges[cell]=mask;return mask;
  }
  /** A small closed start region can be reused across one worker's candidate
   * probes. Null means the region is larger than the bounded local search. */
  reachablePocket(start:number,blocked:ReadonlySet<number>,limit=128):ReadonlySet<number>|null {
    const seen=new Set<number>([start]),queue=[start];
    const step=(a:number,b:number)=>!blocked.has(b)&&this.canStep(a,b);
    for(let at=0;at<queue.length;at++){
      const id=queue[at]!,x=id%this.size,y=Math.floor(id/this.size);
      for(const [dx,dy] of DIRECTIONS){
        const nx=x+dx,ny=y+dy,next=ny*this.size+nx;
        if(nx<0||ny<0||nx>=this.size||ny>=this.size||seen.has(next)||!canTraverse(this.size,id,next,step))continue;
        seen.add(next);if(seen.size>=limit)return null;queue.push(next);
      }
    }
    return seen;
  }
  path(start: number, goal: number, blocked?: ReadonlySet<number>, maxCost = Infinity, corridor?:Uint8Array): number[] | null {
    this.lastExpanded=0;
    const sectorWidth=Math.ceil(this.size/SECTOR_SIZE);
    if (!Number.isInteger(start) || !Number.isInteger(goal) || start < 0 || goal < 0 || start >= this.size ** 2 || goal >= this.size ** 2) return null;
    if (start === goal) return [];
    if (this.connected && !this.connected(start,goal)) return null;
    if (++this.epoch >= 0xffffffff) { this.seen.fill(0); this.closed.fill(0); this.epoch = 1; }
    const {prev, cost, seen, closed, epoch} = this;
    if (blocked?.has(goal)) return null;
    const obstacles=blocked?.size?blocked:undefined;
    const step = (a: number, b: number) => !obstacles?.has(b) && this.canStep(a, b);
    // Callers already checked neighbor bounds and know the direction. Avoid
    // rediscovering it with divisions for every edge of a large search.
    const directionBits=[16,1,32,2,0,4,64,8,128];
    const traverse=this.cacheTerrain
      ? (a:number,b:number,dx:number,dy:number)=>!!(this.edgeMask(a)&directionBits[(dy+1)*3+dx+1]!)&&
        (!obstacles||(!obstacles.has(b)&&(!(dx&&dy)||(!obstacles.has(a+dx)&&!obstacles.has(a+dy*this.size)))))
      : (a:number,b:number,dx:number,dy:number)=>step(a,b)&&
      (!(dx&&dy)||(step(a,a+dx)&&step(a,a+dy*this.size)&&step(a+dx,b)&&step(a+dy*this.size,b)));
    // A boxed-in unit cannot reach any other goal. Check the cheap local fact
    // before repeating goal-side probes for every candidate.
    const startX=start%this.size,startY=Math.floor(start/this.size);
    if(!DIRECTIONS.some(([dx,dy])=>{
      const x=startX+dx,y=startY+dy;
      return x>=0&&y>=0&&x<this.size&&y<this.size&&traverse(start,y*this.size+x,dx,dy);
    }))return null;
    // Reject an enclosed destination before flooding the map.
    const goalX = goal % this.size, goalY = Math.floor(goal / this.size);
    if (!DIRECTIONS.some(([dx, dy]) => {
      const x = goalX + dx, y = goalY + dy;
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
      const from = y * this.size + x;
      return (from === start || !blocked?.has(from)) && traverse(from, goal, -dx, -dy);
    })) return null;
    // Small goal-side pockets are common in crowded bases. A bounded reverse
    // reachability check proves failure cheaply; larger regions fall through
    // to the unchanged forward A* and retain its deterministic route choice.
    const reverse = [goal], reverseSeen = new Set<number>(reverse);
    let connected = false, cursor = 0;
    for (; cursor < reverse.length && reverse.length < 128; cursor++) {
      const to = reverse[cursor]!, x = to % this.size, y = Math.floor(to / this.size);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        const from = ny * this.size + nx;
        if (reverseSeen.has(from) || (from !== start && blocked?.has(from)) ||
            !traverse(from, to, -dx, -dy)) continue;
        if (from === start) { connected = true; break; }
        reverseSeen.add(from); reverse.push(from);
      }
      if (connected) break;
    }
    if (!connected && cursor === reverse.length) return null;
    let ids=this.heapIds,gs=this.heapCosts,hs=this.heapHeuristics,length=0;
    const better=(g:number,h:number,id:number,b:number)=>g+h<gs[b]!+hs[b]!||
      (g+h===gs[b]!+hs[b]!&&(h<hs[b]!||(h===hs[b]!&&id<ids[b]!)));
    const push=(id:number,g:number,h:number)=>{
      if(length===ids.length){
        const nextIds=new Int32Array(length*2),nextGs=new Int32Array(length*2),nextHs=new Int32Array(length*2);
        nextIds.set(ids);nextGs.set(gs);nextHs.set(hs);
        ids=this.heapIds=nextIds;gs=this.heapCosts=nextGs;hs=this.heapHeuristics=nextHs;
      }
      let i=length++;
      while(i){const parent=(i-1)>>1;if(!better(g,h,id,parent))break;
        ids[i]=ids[parent]!;gs[i]=gs[parent]!;hs[i]=hs[parent]!;i=parent;}
      ids[i]=id;gs[i]=g;hs[i]=h;
    };
    const top={id:0,g:0};
    const pop=()=>{
      top.id=ids[0]!;top.g=gs[0]!;
      const end=--length,id=ids[end]!,g=gs[end]!,h=hs[end]!;
      if(length){let i=0;
        while(i*2+1<length){let child=i*2+1;
          if(child+1<length&&better(gs[child+1]!,hs[child+1]!,ids[child+1]!,child))child++;
          if(!better(gs[child]!,hs[child]!,ids[child]!,end))break;
          ids[i]=ids[child]!;gs[i]=gs[child]!;hs[i]=hs[child]!;i=child;}
        ids[i]=id;gs[i]=g;hs[i]=h;
      }
      return top;
    };
    const gx = goal % this.size,
      gz = Math.floor(goal / this.size);
    const heuristic = (id: number) => {
      const dx = Math.abs(id % this.size - gx), dy = Math.abs(Math.floor(id / this.size) - gz);
      return CARDINAL_COST * Math.max(dx, dy) + (DIAGONAL_COST - CARDINAL_COST) * Math.min(dx, dy);
    };
    if(heuristic(start)>maxCost)return null;
    seen[start] = epoch;
    cost[start] = 0;
    push(start, 0, heuristic(start));
    while (length) {
      const cur = pop(),
        id = cur.id;
      if (closed[id] === epoch || cur.g !== cost[id]) continue;
      if (id === goal) {
        const out: number[] = [];
        let at = goal;
        while (at !== start) {
          out.push(at);
          at = prev[at]!;
        }
        return out.reverse();
      }
      closed[id] = epoch;this.lastExpanded++;
      const x = id % this.size,
        z = Math.floor(id / this.size);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx, ny = z + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        if(corridor&&!corridor[Math.floor(ny/SECTOR_SIZE)*sectorWidth+Math.floor(nx/SECTOR_SIZE)])continue;
        const next = ny * this.size + nx;
        if (closed[next] === epoch || !traverse(id, next, dx, dy)) continue;
        const g = cur.g + (dx && dy ? DIAGONAL_COST : CARDINAL_COST);
        if (seen[next] === epoch && g >= cost[next]!) continue;
        const h=heuristic(next);
        if(g+h>maxCost)continue;
        seen[next] = epoch;
        cost[next] = g;
        prev[next] = id;
        push(next, g, h);
      }
    }
    return null;
  }
}
