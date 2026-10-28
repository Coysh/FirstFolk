import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/sim/balance';
import { rankUp } from '../src/sim/scenario';
import { isWinter, seasonOf } from '../src/sim/seasons';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

describe('seasons and settlement ranks', () => {
  it('the year runs spring → winter, and spring counts a winter survived', () => {
    const w = new World({ seed: 1 });
    expect(seasonOf(0)).toBe(0);
    w.run(BALANCE.yearTicks * 0.75 + 1);
    expect(isWinter(w)).toBe(true);
    w.run(BALANCE.yearTicks * 0.25);
    expect(seasonOf(w.tick)).toBe(0);
    expect(w.players[0].winters).toBe(1);
  });

  it('berry bushes do not regrow in winter', () => {
    const w = new World({ seed: 1 });
    w.run(BALANCE.yearTicks * 0.75 + 5);
    const bush = [...w.nodes.values()].find((n) => n.kind === 'bush')!;
    bush.amount = 0;
    bush.regrow = 10;
    w.run(BALANCE.berryRegrowTicks * 3);
    expect(bush.amount).toBe(0);
  });

  it('ranking up transforms the wagon, widens the border and unlocks buildings', () => {
    const w = new World({ seed: 1 });
    const land = w.territory.filter((t) => t === 0).length;
    expect(w.isUnlocked(0, 'watchtower')).toBe(false);
    rankUp(w, 0, 1);
    expect(w.players[0].rank).toBe(1);
    expect(wagon(w).tier).toBe(1);
    expect(w.isUnlocked(0, 'watchtower')).toBe(true);
    expect(w.territory.filter((t) => t === 0).length).toBeGreaterThan(land);
    expect(w.players[0].offers.length).toBeGreaterThanOrEqual(1);
  });
});
