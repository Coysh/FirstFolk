import { describe, expect, it } from 'vitest';
import { secs } from '../src/sim/balance';
import { newWorld, place, runSeconds, wagon } from './helpers';

/**
 * A famine must never sit beside a full basket (found in a headless playtest: 100+ berries piled at
 * the gatherers' huts for ten minutes while the town starved, because every adult had a job and
 * nobody was free to carry).
 */
describe('the larder', () => {
  function emptyStores(w: ReturnType<typeof newWorld>) {
    for (const g of ['berries', 'fish'] as const) wagon(w).stock[g] = 0;
  }

  it('counts food piled at gatherers, not just food in stores', () => {
    const w = newWorld();
    const f = place(w, 'forager');
    runSeconds(w, 30);
    emptyStores(w);
    f.stock.berries = 6;
    f.reserved.berries = 0;
    expect(w.food(0)).toBe(0);
    expect(w.waiting(0, 'berries')).toBe(6);
    expect(w.larder(0)).toBe(6);
    f.reserved.berries = 2; // already promised to a carrier
    expect(w.larder(0)).toBe(4);
  });

  it('feeds the town from a gatherer\'s basket when the stores are empty', () => {
    const w = newWorld();
    const f = place(w, 'forager');
    runSeconds(w, 30);
    emptyStores(w);
    w.players[0].hungry = true;
    f.stock.berries = 40;
    f.alert = 'full';
    const before = f.stock.berries;
    w.players[0].mealAccum = 0;
    runSeconds(w, 120);
    // They ate from the basket, so it never read as an empty larder and hunger lifted.
    expect(f.stock.berries).toBeLessThan(before);
    expect(w.players[0].hungry).toBe(false);
  });

  it('does not slow a food gatherer on the job when the town is hungry', () => {
    // Same walk, same seed: only a gatherer (a forager's worker) keeps full speed.
    const distance = (hungry: boolean, building: 'forager' | 'woodcutter') => {
      const w = newWorld(5);
      place(w, building);
      runSeconds(w, 25);
      const worker = [...w.settlers.values()].find((s) => s.job.kind === 'work' && !s.child);
      expect(worker).toBeDefined();
      let travelled = 0;
      let last = { x: worker!.x, y: worker!.y };
      for (let i = 0; i < secs(40); i++) {
        w.players[0].hungry = hungry;
        w.players[0].mealAccum = 0;
        w.step();
        if (worker!.x !== last.x || worker!.y !== last.y) travelled++;
        last = { x: worker!.x, y: worker!.y };
      }
      return travelled;
    };
    // The forager's walk is unaffected by hunger; the woodcutter's is slowed.
    expect(distance(true, 'forager')).toBeGreaterThanOrEqual(distance(false, 'forager') - 2);
    expect(distance(true, 'woodcutter')).toBeLessThan(distance(false, 'woodcutter'));
  });
});
