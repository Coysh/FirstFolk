import { describe, expect, it } from 'vitest';
import { playtest } from '../src/sim/playtest';

/**
 * The "fun contract" (docs/DESIGN.md §2), checked with the scripted bot.
 * If a balance change breaks these, the game got slower or more frustrating.
 */
describe('pacing (headless playtests)', () => {
  for (const seed of [11, 12, 13]) {
    it(`seed ${seed}`, () => {
      const r = playtest(seed, 16);
      expect(r.firstLogsSec).toBeGreaterThan(0);
      expect(r.firstLogsSec).toBeLessThan(30);
      // Chapter 1 (Landfall) inside 8 minutes, first Journeyman inside 6, chapter 2 (Trades) inside 16.
      expect(r.chapters.Landfall).toBeLessThan(8 * 60);
      expect(r.firstJourneymanSec).toBeGreaterThan(0);
      expect(r.firstJourneymanSec).toBeLessThan(6 * 60);
      expect(r.chapters.Trades).toBeLessThan(16 * 60);
      expect(r.idleAdultPct).toBeLessThan(15);
      expect(r.longestQuietSec).toBeLessThan(20);
      // The frontier: something to head for from the first minute, a major beat at least every
      // 90 s, and the border still moving in the last third of the game.
      expect(r.firstDiscoverySec).toBeGreaterThanOrEqual(0);
      expect(r.firstDiscoverySec).toBeLessThan(60);
      expect(r.claimed).toBeGreaterThanOrEqual(3);
      expect(r.longestMajorGapSec).toBeLessThan(90);
      expect(r.territoryByMinute.at(-1)!).toBeGreaterThan(r.territoryByMinute[10]);
      expect(r.timeline.some((l) => l.includes('arrives'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('sawpit unlocked'))).toBe(true);
    });
  }
});
