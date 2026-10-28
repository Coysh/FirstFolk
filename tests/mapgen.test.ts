import { describe, expect, it } from 'vitest';
import { generateMap, Terrain } from '../src/sim/mapgen';
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
