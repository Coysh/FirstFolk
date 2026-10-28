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
      // Age-ups: Hamlet inside 7 minutes, Village inside 16; first Journeyman inside 4.
      expect(r.chapters.Landfall).toBeLessThan(7 * 60);
      expect(r.firstJourneymanSec).toBeGreaterThan(0);
      expect(r.firstJourneymanSec).toBeLessThan(4 * 60);
      expect(r.chapters.Hamlet).toBeLessThan(16 * 60);
      expect(r.idleAdultPct).toBeLessThan(15);
      expect(r.longestQuietSec).toBeLessThan(20);
      // The frontier: something to head for from the first minute, a major beat at least every
      // 90 s, and the border still moving (either way) in the last third of the game.
      expect(r.firstDiscoverySec).toBeGreaterThanOrEqual(0);
      expect(r.firstDiscoverySec).toBeLessThan(60);
      expect(r.claimed).toBeGreaterThanOrEqual(3);
      expect(r.longestMajorGapSec).toBeLessThan(90);
      expect(r.territoryByMinute.at(-1)!).not.toBe(r.territoryByMinute[10]);
      // The renown race: still earning late on, and the houses are using their deeds.
      expect(r.renownByMinute.at(-1)![0]).toBeGreaterThan(r.renownByMinute[10][0] + 100);
      expect(r.timeline.some((l) => l.includes('✦ deed'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('arrives'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('sawpit unlocked'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('RANK UP: Hamlet'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('house choice'))).toBe(true);
    });
  }
});
