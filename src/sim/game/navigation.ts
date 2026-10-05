import {SimulationProfiler} from '../profiling';
import {NavigationQueue} from './navigationQueue';
import {MonotonicNavigationQueue} from './monotonicNavigationQueue';
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
  private blockedNodes:Uint32Array|undefined;
  lastExpanded=0;
  private readonly edges: Uint8Array;
  private readonly knownEdges: Uint8Array;
  private readonly queue=new MonotonicNavigationQueue();
  private readonly weightedQueue=new NavigationQueue();
  constructor(
    readonly size: number,
    private readonly canStep: (from: number, to: number) => boolean,
    private readonly connected?: (start:number,goal:number) => boolean,
    private readonly cacheTerrain = false,
    private readonly profile=new SimulationProfiler(),
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
  invalidate(cells?:Iterable<number>,padding=1):void {
    if(!this.cacheTerrain)return;
    if(!cells){this.knownEdges.fill(0);return;}
    for(const cell of cells){
      const x=cell%this.size,y=Math.floor(cell/this.size);
      for(let dy=-padding;dy<=padding;dy++)for(let dx=-padding;dx<=padding;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&ny>=0&&nx<this.size&&ny<this.size)this.knownEdges[ny*this.size+nx]=0;
      }
    }
  }
  private edge(from:number,to:number,bit:number):boolean {
    // Reverse pocket probes often need only one outgoing edge per cell.
    // Cache requested directions rather than sweeping all eight body paths.
    if(!(this.knownEdges[from]!&bit)){
      // A diagonal checks four cardinal side corridors. Those are the same
      // directed edges requested by neighboring searches, so share their cache
      // instead of repeating full body sweeps for every diagonal. Cardinal
      // calls already have valid adjacent coordinates from the caller.
      const clear=bit<16?this.canStep(from,to):canTraverse(this.size,from,to,(a,b)=>{
        if(a===from&&b===to)return this.canStep(a,b);
        const delta=b-a,side=delta===-this.size?1:delta===-1?2:delta===1?4:8;
        return this.edge(a,b,side);
      });
      if(clear)this.edges[from]!|=bit;
      else this.edges[from]!&=~bit;
      this.knownEdges[from]!|=bit;
    }
    return !!(this.edges[from]!&bit);
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
  path(start: number, goal: number, blocked?: ReadonlySet<number>, maxCost = Infinity, corridor?:Uint8Array,heuristicPermille=1000): number[] | null {
    this.lastExpanded=0;
    const sectorWidth=Math.ceil(this.size/SECTOR_SIZE);
    if (!Number.isInteger(start) || !Number.isInteger(goal) || start < 0 || goal < 0 || start >= this.size ** 2 || goal >= this.size ** 2) return null;
    if (start === goal) return [];
    if (this.connected && !this.connected(start,goal)) return null;
    if (++this.epoch >= 0xffffffff) { this.seen.fill(0); this.closed.fill(0); this.blockedNodes?.fill(0); this.epoch = 1; }
    const {prev, cost, seen, closed, epoch} = this;
    if (blocked?.has(goal)) return null;
    // Mark the small set once, then use integer array reads in the hot loop.
    // Epochs avoid clearing a map-sized mask on each changing traffic query.
    const obstacles=blocked?.size?(this.blockedNodes??=new Uint32Array(this.size*this.size)):undefined;
    if(obstacles)for(const cell of blocked!)obstacles[cell]=epoch;
    const step = (a: number, b: number) => obstacles?.[b]!==epoch && this.canStep(a, b);
    // Callers already checked neighbor bounds and know the direction. Avoid
    // rediscovering it with divisions for every edge of a large search.
    const directionBits=[16,1,32,2,0,4,64,8,128];
    const traverse=this.cacheTerrain
      ? (a:number,b:number,dx:number,dy:number)=>this.edge(a,b,directionBits[(dy+1)*3+dx+1]!)&&
        (!obstacles||(obstacles[b]!==epoch&&(!(dx&&dy)||(obstacles[a+dx]!==epoch&&obstacles[a+dy*this.size]!==epoch))))
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
      return (from === start || obstacles?.[from]!==epoch) && traverse(from, goal, -dx, -dy);
    })) return null;
    // Small goal-side pockets are common in crowded bases. A bounded reverse
    // reachability check proves failure cheaply; larger regions fall through
    // to the unchanged forward A* and retain its deterministic route choice.
    const reachable=this.profile.measure('Destination reachability',()=>{
    const reverse = [goal], reverseSeen = new Set<number>(reverse);
    let connected = false, cursor = 0;
    for (; cursor < reverse.length && reverse.length < 128; cursor++) {
      const to = reverse[cursor]!, x = to % this.size, y = Math.floor(to / this.size);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        const from = ny * this.size + nx;
        if (reverseSeen.has(from) || (from !== start && obstacles?.[from]===epoch) ||
            !traverse(from, to, -dx, -dy)) continue;
        if (from === start) { connected = true; break; }
        reverseSeen.add(from); reverse.push(from);
      }
      if (connected) break;
    }
    return connected || cursor < reverse.length;
    });
    if(!reachable)return null;
    return this.profile.measure('A-star expansion',()=>{
    // Inflated heuristics are not consistent: their priorities may decrease,
    // so they require the binary frontier and reopening improved closed cells.
    // The exact octile lower bound still enforces maxCost and reachability.
    const weighted=heuristicPermille>1000;
    const queue=weighted?this.weightedQueue:this.queue;
    if(weighted)this.weightedQueue.length=0;else this.queue.reset();
    const priority=(h:number)=>weighted?Math.floor(h*heuristicPermille/1000):h;
    const gx = goal % this.size,
      gz = Math.floor(goal / this.size);
    const heuristic = (id: number) => {
      const dx = Math.abs(id % this.size - gx), dy = Math.abs(Math.floor(id / this.size) - gz);
      return CARDINAL_COST * Math.max(dx, dy) + (DIAGONAL_COST - CARDINAL_COST) * Math.min(dx, dy);
    };
    if(heuristic(start)>maxCost)return null;
    seen[start] = epoch;
    cost[start] = 0;
    queue.push(start, 0, priority(heuristic(start)));
    while (queue.length) {
      const cur = queue.pop(),
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
      // Known impassable edges cannot contribute a successor. Reject them
      // before coordinate/heuristic work; unknown edges still take the full test.
      const candidates=this.cacheTerrain?(this.edges[id]!|(~this.knownEdges[id]!&255)):255;
      for (let direction=0;direction<DIRECTIONS.length;direction++) {
        if(!(candidates&(1<<direction)))continue;
        const dx=DIRECTIONS[direction]![0],dy=DIRECTIONS[direction]![1];
        const nx = x + dx, ny = z + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        if(corridor&&!corridor[Math.floor(ny/SECTOR_SIZE)*sectorWidth+Math.floor(nx/SECTOR_SIZE)])continue;
        const next = ny * this.size + nx;
        if (!weighted && closed[next] === epoch) continue;
        const g = cur.g + (dx && dy ? DIAGONAL_COST : CARDINAL_COST);
        if (seen[next] === epoch && g >= cost[next]!) continue;
        const hx=Math.abs(nx-gx),hy=Math.abs(ny-gz);
        const h=CARDINAL_COST*Math.max(hx,hy)+(DIAGONAL_COST-CARDINAL_COST)*Math.min(hx,hy);
        if(g+h>maxCost)continue;
        // A dominated candidate cannot affect the route. Reject it before
        // consulting terrain edges or dynamic body occupancy.
        // Most expanded edges already have a terrain verdict. Read that mask
        // directly and reject live reservations before a cold terrain sweep.
        // The direction order is the bit order used by edge(); diagonal body
        // reservations must still cover both cardinal side cells.
        if(obstacles&&(obstacles[next]===epoch||(dx&&dy&&(obstacles[id+dx]===epoch||obstacles[id+dy*this.size]===epoch))))continue;
        if(this.cacheTerrain){
          const bit=1<<direction;
          if(this.knownEdges[id]!&bit){if(!(this.edges[id]!&bit))continue;}
          else if(!this.edge(id,next,bit))continue;
        }else if(!traverse(id,next,dx,dy))continue;
        if(weighted)closed[next]=0;
        seen[next] = epoch;
        cost[next] = g;
        prev[next] = id;
        queue.push(next, g, priority(h));
      }
    }
    return null;
    });
  }
}
