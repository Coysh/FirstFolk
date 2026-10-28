/**
 * Grid A* with 8-way movement, integer costs (10 straight / 14 diagonal) and no corner cutting.
 * Buffers are reused between searches; results are deterministic.
 */
const DIRS = [
  [1, 0, 10],
  [-1, 0, 10],
  [0, 1, 10],
  [0, -1, 10],
  [1, 1, 14],
  [-1, 1, 14],
  [1, -1, 14],
  [-1, -1, 14],
] as const;

export class PathFinder {
  private g: Int32Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private run = 0;
  private heap: number[] = [];

  constructor(
    private size: number,
    private walkable: (idx: number) => boolean,
    private maxExpansions = 12000,
  ) {
    const n = size * size;
    this.g = new Int32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Returns tile indices from the step after `start` up to and including `goal`, or null if unreachable. */
  find(start: number, goal: number): number[] | null {
    if (start === goal) return [];
    if (!this.walkable(goal)) return null;
    const N = this.size;
    const run = ++this.run;
    const heap = this.heap;
    heap.length = 0;
    const gx = goal % N;
    const gy = (goal - gx) / N;
    const h = (i: number) => {
      const x = i % N;
      const y = (i - x) / N;
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
    };
    this.g[start] = 0;
    this.stamp[start] = run;
    this.from[start] = -1;
    this.push(h(start) * 1048576 + start);
    let expansions = 0;

    while (heap.length) {
      const top = this.pop();
      const cur = top % 1048576;
      if (this.closed[cur] === run) continue;
      this.closed[cur] = run;
      if (cur === goal) return this.rebuild(goal);
      if (++expansions > this.maxExpansions) return null;
      const cx = cur % N;
      const cy = (cur - cx) / N;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        if (!this.walkable(ni)) continue;
        if (dx !== 0 && dy !== 0 && (!this.walkable(cy * N + nx) || !this.walkable(ny * N + cx))) continue;
        const ng = this.g[cur] + cost;
        if (this.stamp[ni] === run && ng >= this.g[ni]) continue;
        this.stamp[ni] = run;
        this.g[ni] = ng;
        this.from[ni] = cur;
        this.push((ng + h(ni)) * 1048576 + ni);
      }
    }
    return null;
  }

  private rebuild(goal: number): number[] {
    const out: number[] = [];
    for (let i = goal; this.from[i] !== -1; i = this.from[i]) out.push(i);
    return out.reverse();
  }

  private push(v: number) {
    const heap = this.heap;
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= v) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = v;
  }

  private pop(): number {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      const n = heap.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && heap[r] < heap[l] ? r : l;
        if (heap[c] >= last) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return top;
  }
}
