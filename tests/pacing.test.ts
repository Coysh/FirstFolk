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
      // The town keeps growing late on, too.
      expect(r.populationByMinute.at(-1)!).toBeGreaterThan(r.populationByMinute[10]);
      expect(r.timeline.some((l) => l.includes('✦ deed'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('arrives'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('sawpit unlocked'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('RANK UP: Hamlet'))).toBe(true);
      expect(r.timeline.some((l) => l.includes('house choice'))).toBe(true);
    });
  }
});

/**
 * The long game: the endgame is a fight for the Kingstone, not a wait for points. At 20 minutes
 * there is already something to defend and something to take, and the closing minutes are the
 * busiest of the game (the opposite of waiting for Renown to add up).
 */
describe('the long game (headless playtests)', () => {
  const seeds = [21, 22, 23, 24, 25, 26];
  const runs = seeds.map((s) => playtest(s, 40));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

  it('the Crown cannot be won before it is earned: no victory in the first 19 minutes', () => {
    for (const r of runs) expect(r.victorySec < 0 || r.victorySec > 19 * 60).toBe(true);
  });

  it('a star falls by 15:40, and the valley is being fought over in every game', () => {
    for (const r of runs) {
      const fall = r.timeline.find((l) => l.includes('a star falls'));
      expect(fall, `seed ${r.seed}`).toBeDefined();
      const [m, s] = fall!.slice(0, 5).split(':').map(Number);
      expect(m * 60 + s).toBeLessThanOrEqual(15 * 60 + 40);
      // Someone is fighting for the valley: the stone, or the steadings.
      expect(r.timeline.some((l) => l.includes('Kingstone') || l.includes('swears') || l.includes('a Want')), `seed ${r.seed}`).toBe(true);
    }
  });

  it('at 15 to 20 minutes there is always something to do, and the finish is busier than the start', () => {
    const mid = runs.map((r) => mean(r.actionByMinute.slice(15, 20)));
    for (const m of mid) expect(m).toBeGreaterThanOrEqual(1);
    expect(mean(mid)).toBeGreaterThanOrEqual(2.5);
    const early = mean(runs.map((r) => mean(r.actionByMinute.slice(0, 10))));
    const late = mean(runs.map((r) => mean(r.actionByMinute.slice(-11, -1))));
    expect(late).toBeGreaterThan(early * 1.5);
    expect(late).toBeGreaterThanOrEqual(3.5);
  });

  it('the folk of the valley matter: Wants are posted and won, steadings change sides, carts are sent', () => {
    for (const r of runs) {
      expect(r.timeline.some((l) => l.includes('a steading wants')), `seed ${r.seed}`).toBe(true);
      expect(r.wantsWon[0] + r.wantsWon[1], `seed ${r.seed}`).toBeGreaterThanOrEqual(3);
      expect(r.caravans[0] + r.caravans[1], `seed ${r.seed}`).toBeGreaterThanOrEqual(3);
    }
    expect(mean(runs.map((r) => r.allegianceFlips))).toBeGreaterThanOrEqual(2);
  });

  it('there are choices all game long: the player decides something every minute', () => {
    for (const r of runs) expect(r.longestBoredMinutes, `seed ${r.seed}`).toBeLessThanOrEqual(2);
    expect(mean(runs.map((r) => mean(r.decisionsByMinute.slice(5, 15))))).toBeGreaterThanOrEqual(2.2);
  });

  it('the clash is a fight, not a die roll: battles happen, and they take time', () => {
    for (const r of runs) expect(r.battles, `seed ${r.seed}`).toBeGreaterThanOrEqual(1);
    expect(mean(runs.map((r) => r.battles))).toBeGreaterThanOrEqual(5);
  });
});
