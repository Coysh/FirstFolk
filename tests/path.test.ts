import { describe, expect, it } from 'vitest';
import { PathFinder } from '../src/sim/path';

function grid(rows: string[]) {
  const size = rows.length;
  const walk = (i: number) => rows[Math.floor(i / size)][i % size] !== '#';
  return { size, pf: new PathFinder(size, walk), idx: (x: number, y: number) => y * size + x };
}

describe('PathFinder', () => {
  it('finds a straight path', () => {
    const { pf, idx } = grid(['.....', '.....', '.....', '.....', '.....']);
    expect(pf.find(idx(0, 0), idx(4, 0))).toEqual([idx(1, 0), idx(2, 0), idx(3, 0), idx(4, 0)]);
  });

  it('routes around walls without cutting corners', () => {
    const rows = ['.....', '.###.', '.#...', '.#.#.', '...#.'];
    const { pf, idx, size } = grid(rows);
    const p = pf.find(idx(0, 0), idx(2, 3))!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toBe(idx(2, 3));
    let prev = idx(0, 0);
    for (const i of p) {
      const [x, y] = [i % size, Math.floor(i / size)];
      expect(rows[y][x]).toBe('.');
      const [px, py] = [prev % size, Math.floor(prev / size)];
      if (x !== px && y !== py) {
        expect(rows[py][x]).toBe('.');
        expect(rows[y][px]).toBe('.');
      }
      prev = i;
    }
  });

  it('returns null when unreachable', () => {
    const { pf, idx } = grid(['..#..', '..#..', '..#..', '..#..', '..#..']);
    expect(pf.find(idx(0, 0), idx(4, 4))).toBeNull();
  });

  it('returns empty path when already there', () => {
    const { pf, idx } = grid(['...', '...', '...']);
    expect(pf.find(idx(1, 1), idx(1, 1))).toEqual([]);
  });
});
