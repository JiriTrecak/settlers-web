/** Integer A*: stable tie order, no clocks/randomness, no diagonal corner cutting. */
export class Navigation {
  constructor(
    readonly size: number,
    private readonly canStep: (from: number, to: number) => boolean,
  ) {}
  path(start: number, goal: number): number[] | null {
    if (start === goal) return [];
    const n = this.size * this.size,
      prev = new Int32Array(n).fill(-1),
      cost = new Int32Array(n).fill(2147483647),
      closed = new Uint8Array(n);
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
    const heuristic = (id: number) =>
      Math.abs((id % this.size) - gx) +
      Math.abs(Math.floor(id / this.size) - gz);
    cost[start] = 0;
    push({ id: start, g: 0, h: heuristic(start) });
    while (heap.length) {
      const cur = pop(),
        id = cur.id;
      if (closed[id]) continue;
      if (id === goal) {
        const out: number[] = [];
        let at = goal;
        while (at !== start) {
          out.push(at);
          at = prev[at]!;
        }
        return out.reverse();
      }
      closed[id] = 1;
      const x = id % this.size,
        z = Math.floor(id / this.size);
      for (const next of [
        z > 0 ? id - this.size : -1,
        x > 0 ? id - 1 : -1,
        x + 1 < this.size ? id + 1 : -1,
        z + 1 < this.size ? id + this.size : -1,
      ]) {
        if (next < 0 || closed[next] || !this.canStep(id, next)) continue;
        const g = cur.g + 1;
        if (g >= cost[next]!) continue;
        cost[next] = g;
        prev[next] = id;
        push({ id: next, g, h: heuristic(next) });
      }
    }
    return null;
  }
}
