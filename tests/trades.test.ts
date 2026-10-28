import { describe, expect, it } from 'vitest';
import { canPlace } from '../src/sim/commands';
import { TIER_XP, tierOf } from '../src/sim/trades';
import { craftXp } from '../src/sim/settlers';
import { BALANCE } from '../src/sim/balance';
import { newWorld, place, runSeconds, wagon } from './helpers';

describe('trades and specialisation', () => {
  it('the Sawpit is locked until a Journeyman Carpenter exists', () => {
    const w = newWorld();
    const wg = wagon(w);
    const check = canPlace(w, 0, 'sawpit', wg.x + 3, wg.y - 2);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Woodcraft ★/);
  });

  it('woodcutting fills the town’s woodcraft, which upgrades every woodcutter at once and unlocks the Sawpit', () => {
    const w = newWorld();
    const wc = place(w, 'woodcutter');
    const wc2 = place(w, 'woodcutter');
    runSeconds(w, 20);
    w.players[0].crafts.woodcraft = TIER_XP[1] - 10; // one more log to go
    const events: string[] = [];
    for (let i = 0; i < 600 && wc.tier === 0; i++) {
      w.step();
      for (const e of w.drainEvents()) events.push(e.type);
    }
    expect(wc.tier).toBe(1);
    expect(wc2.tier).toBe(1);
    expect(events).toContain('craftUp');
    expect(events).toContain('unlocked');
    expect(w.isUnlocked(0, 'sawpit')).toBe(true);
  });

  it('a Sawpit turns logs into planks but leaves a reserve for building', () => {
    const w = newWorld();
    w.players[0].unlocked.push('sawpit');
    wagon(w).stock.logs = 30;
    wagon(w).stock.stone = 10;
    const pit = place(w, 'sawpit');
    runSeconds(w, 90);
    expect(pit.done).toBe(true);
    expect(w.players[0].produced.planks).toBeGreaterThan(3);
    // With logs scarce the sawpit stops drawing them.
    wagon(w).stock.logs = 5;
    const before = w.players[0].produced.planks;
    runSeconds(w, 40);
    expect(w.players[0].produced.planks - before).toBeLessThanOrEqual(3); // only what it already held
    expect(pit.status).toMatch(/Saving logs|Waiting|full/);
  });

  it('a town Master of a craft is famous, and folk never grow old', () => {
    const w = newWorld();
    craftXp(w, 0, 'stonework', TIER_XP[2]);
    expect(tierOf(w.players[0].crafts.stonework)).toBe(2);
    expect(w.players[0].renownBy.masters).toBe(BALANCE.renown.skilled + BALANCE.renown.master);
    const pop = w.population(0);
    runSeconds(w, 600);
    expect(w.population(0)).toBeGreaterThanOrEqual(pop);
  });

  it('a full workplace with no free carriers is emptied by its own worker', () => {
    const w = newWorld();
    const wc = place(w, 'woodcutter');
    runSeconds(w, 20);
    // Occupy every other settler so nobody can haul.
    for (const s of w.settlers.values())
      if (s.id !== wc.workerId) {
        s.job = { kind: 'arrive' };
        s.busy = 1_000_000;
      }
    wc.stock.logs = 6;
    const logs0 = wagon(w).stock.logs;
    runSeconds(w, 40);
    expect(wagon(w).stock.logs).toBeGreaterThan(logs0);
  });
});
