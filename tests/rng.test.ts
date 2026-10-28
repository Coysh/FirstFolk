import { describe, expect, it } from 'vitest';
import { Rng, hash2 } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.nextU32());
    const seqB = Array.from({ length: 20 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
    expect(new Rng(43).nextU32()).not.toBe(seqA[0]);
  });

  it('produces values in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.range(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('round-trips state', () => {
    const r = new Rng(7);
    r.nextU32();
    const s = r.getState();
    const v = r.nextU32();
    r.setState(s);
    expect(r.nextU32()).toBe(v);
  });

  it('hash2 is stable', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
  });
});
