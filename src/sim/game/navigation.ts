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
  constructor(
    readonly size: number,
    private readonly canStep: (from: number, to: number) => boolean,
  ) {
    const n = size * size;
    this.prev = new Int32Array(n);
    this.cost = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }
  path(start: number, goal: number, blocked?: ReadonlySet<number>, maxCost = Infinity): number[] | null {
    if (!Number.isInteger(start) || !Number.isInteger(goal) || start < 0 || goal < 0 || start >= this.size ** 2 || goal >= this.size ** 2) return null;
    if (start === goal) return [];
    if (++this.epoch >= 0xffffffff) { this.seen.fill(0); this.closed.fill(0); this.epoch = 1; }
    const {prev, cost, seen, closed, epoch} = this;
    const step = (a: number, b: number) => !blocked?.has(b) && this.canStep(a, b);
    // An occupied or completely enclosed destination cannot be reached. Reject
    // it before flooding the whole map, without changing successful A* ties.
    if (blocked?.has(goal)) return null;
    const goalX = goal % this.size, goalY = Math.floor(goal / this.size);
    if (!DIRECTIONS.some(([dx, dy]) => {
      const x = goalX + dx, y = goalY + dy;
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
      const from = y * this.size + x;
      return (from === start || !blocked?.has(from)) && canTraverse(this.size, from, goal, step);
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
            !canTraverse(this.size, from, to, step)) continue;
        if (from === start) { connected = true; break; }
        reverseSeen.add(from); reverse.push(from);
      }
      if (connected) break;
    }
    if (!connected && cursor === reverse.length) return null;
    type Node = { id: number; g: number; h: number };
    const heap: Node[] = [];
    const better = (a: Node, b: Node) =>
      a.g + a.h < b.g + b.h ||
      (a.g + a.h === b.g + b.h && (a.h < b.h || (a.h === b.h && a.id < b.id)));
    const push = (item: Node) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (!better(item, heap[p]!)) break;
        heap[i] = heap[p]!;
        i = p;
      }
      heap[i] = item;
    };
    const pop = () => {
      const top = heap[0]!,
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && better(heap[c + 1]!, heap[c]!)) c++;
          if (!better(heap[c]!, last)) break;
          heap[i] = heap[c]!;
          i = c;
        }
        heap[i] = last;
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
    push({ id: start, g: 0, h: heuristic(start) });
    while (heap.length) {
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
      closed[id] = epoch;
      const x = id % this.size,
        z = Math.floor(id / this.size);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx, ny = z + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        const next = ny * this.size + nx;
        if (closed[next] === epoch || !canTraverse(this.size, id, next, step)) continue;
        const g = cur.g + (dx && dy ? DIAGONAL_COST : CARDINAL_COST);
        if(g+heuristic(next)>maxCost)continue;
        if (seen[next] === epoch && g >= cost[next]!) continue;
        seen[next] = epoch;
        cost[next] = g;
        prev[next] = id;
        push({ id: next, g, h: heuristic(next) });
      }
    }
    return null;
  }
}
