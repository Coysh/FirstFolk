import { describe, expect, it } from 'vitest';
import { generateMap, Terrain, VALLEY_IDS, valleyOf } from '../src/sim/mapgen';
import { PathFinder } from '../src/sim/path';
import { isWalkableTerrain } from '../src/sim/mapgen';

const SEEDS = [1, 2, 3, 42, 1234, 99999];

describe('mapgen', () => {
  it('is deterministic', () => {
    const a = generateMap(7);
    const b = generateMap(7);
    expect(a.heights).toEqual(b.heights);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.nodes).toEqual(b.nodes);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: start has land, nearby resources and a path to the rival`, () => {
      const m = generateMap(seed);
      const N = m.size;
      const s = m.starts[0];
      for (let y = s.y - 3; y <= s.y + 3; y++)
        for (let x = s.x - 3; x <= s.x + 3; x++) expect(isWalkableTerrain(m.terrain[y * N + x])).toBe(true);

      const near = (kind: string, r: number) =>
        m.nodes.filter((n) => n.kind === kind && Math.max(Math.abs(n.x - s.x), Math.abs(n.y - s.y)) <= r).length;
      expect(near('tree', 14)).toBeGreaterThanOrEqual(15);
      expect(near('rock', 14)).toBeGreaterThanOrEqual(4);
      expect(near('bush', 12)).toBeGreaterThanOrEqual(4);

      expect(m.terrain.some((t) => t === Terrain.Water)).toBe(true);
      const pf = new PathFinder(N, (i) => isWalkableTerrain(m.terrain[i]), 40000);
      const r = m.starts[1];
      expect(pf.find(s.y * N + s.x, r.y * N + r.x)).not.toBeNull();
    });
  }
});

describe('valleys', () => {
  const SEEDS_150 = Array.from({ length: 150 }, (_, i) => i + 1);
  const share = (m: ReturnType<typeof generateMap>, t: number) => m.terrain.filter((x) => x === t).length / m.terrain.length;
  const land = (m: ReturnType<typeof generateMap>, from: { x: number; y: number }) => {
    const N = m.size;
    const seen = new Uint8Array(N * N);
    const stack = [from.y * N + from.x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = (i - x) / N + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (!seen[j] && isWalkableTerrain(m.terrain[j])) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    return seen;
  };

  it('a seed always makes the same valley, and the New Game screen can name it first', () => {
    for (const seed of [3, 77, 4242]) expect(generateMap(seed).valley).toBe(valleyOf(seed));
  });

  it('makes all six kinds of valley', () => {
    const seen = new Set(SEEDS_150.map((s) => valleyOf(s)));
    expect([...seen].sort()).toEqual([...VALLEY_IDS].sort());
  });

  it('every valley is playable: both starts are on land, joined by land, with resources in reach', () => {
    let fellBack = 0;
    for (const seed of SEEDS_150) {
      const m = generateMap(seed);
      if (m.valley !== valleyOf(seed)) fellBack++;
      const reach = land(m, m.starts[0]);
      const N = m.size;
      expect(reach[m.starts[1].y * N + m.starts[1].x], `seed ${seed} (${m.valley})`).toBe(1);
      for (const s of m.starts) {
        const near = (kind: string, r: number) => m.nodes.filter((n) => n.kind === kind && Math.max(Math.abs(n.x - s.x), Math.abs(n.y - s.y)) <= r).length;
        expect(near('tree', 16), `seed ${seed} trees`).toBeGreaterThanOrEqual(15);
        expect(near('rock', 16), `seed ${seed} rocks`).toBeGreaterThanOrEqual(4);
        expect(near('bush', 16), `seed ${seed} bushes`).toBeGreaterThanOrEqual(4);
      }
    }
    // A valley that cannot connect its starts is replaced by the Riverlands: that should be rare.
    expect(fellBack / SEEDS_150.length).toBeLessThan(0.03);
  });

  it('the geography really differs: stone, timber and water change by valley', () => {
    const avg = (id: string, f: (m: ReturnType<typeof generateMap>) => number) => {
      const ms = SEEDS_150.filter((s) => valleyOf(s) === id).slice(0, 12).map((s) => generateMap(s));
      return ms.reduce((n, m) => n + f(m), 0) / ms.length;
    };
    const rocks = (m: ReturnType<typeof generateMap>) => m.nodes.filter((n) => n.kind === 'rock').length;
    const trees = (m: ReturnType<typeof generateMap>) => m.nodes.filter((n) => n.kind === 'tree').length;
    expect(avg('highlands', rocks)).toBeGreaterThan(avg('riverlands', rocks) * 1.8);
    expect(avg('highlands', trees)).toBeLessThan(avg('riverlands', trees) * 0.6);
    expect(avg('wildwood', trees)).toBeGreaterThan(avg('riverlands', trees) * 1.25);
    expect(avg('longlake', (m) => share(m, Terrain.Water))).toBeGreaterThan(avg('riverlands', (m) => share(m, Terrain.Water)) * 1.2);
    expect(avg('fens', (m) => m.nodes.filter((n) => n.kind === 'fish').length)).toBeGreaterThan(avg('riverlands', (m) => m.nodes.filter((n) => n.kind === 'fish').length));
  });

  it('the Long Lake keeps a prize island in its narrows that no one can walk to', () => {
    const seed = SEEDS_150.find((s) => valleyOf(s) === 'longlake')!;
    const m = generateMap(seed);
    const star = m.sites.find((s) => s.kind === 'starstone')!;
    expect(star).toBeDefined();
    const reach = land(m, m.starts[0]);
    expect(reach[star.y * m.size + star.x]).toBe(0);
    // ...but it is a short hop from the shore: bridge-able water, never more than a few tiles.
    let nearestLand = Infinity;
    for (let y = 0; y < m.size; y++)
      for (let x = 0; x < m.size; x++) if (reach[y * m.size + x]) nearestLand = Math.min(nearestLand, Math.max(Math.abs(x - star.x), Math.abs(y - star.y)));
    expect(nearestLand).toBeLessThanOrEqual(6);
  });
});
