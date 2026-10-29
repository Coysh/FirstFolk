import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/sim/balance';
import { rankUp } from '../src/sim/scenario';
import { isWinter, seasonOf } from '../src/sim/seasons';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

describe('seasons and settlement ranks', () => {
  it('the year runs spring → winter, and spring counts a winter survived', () => {
    const w = new World({ scenario: 'peaceful', seed: 1 });
    expect(seasonOf(0)).toBe(0);
    w.run(BALANCE.yearTicks * 0.75 + 1);
    expect(isWinter(w)).toBe(true);
    w.run(BALANCE.yearTicks * 0.25);
    expect(seasonOf(w.tick)).toBe(0);
    expect(w.players[0].winters).toBe(1);
  });

  it('berry bushes do not regrow in winter', () => {
    const w = new World({ scenario: 'peaceful', seed: 1 });
    w.run(BALANCE.yearTicks * 0.75 + 5);
    const bush = [...w.nodes.values()].find((n) => n.kind === 'bush')!;
    bush.amount = 0;
    bush.regrow = 10;
    w.run(BALANCE.berryRegrowTicks * 3);
    expect(bush.amount).toBe(0);
  });

  it('ranking up transforms the wagon, widens the border and unlocks buildings', () => {
    const w = new World({ scenario: 'peaceful', seed: 1 });
    const land = w.territory.filter((t) => t === 0).length;
    expect(w.isUnlocked(0, 'watchtower')).toBe(false);
    // The founders' letter (a classic start): settle it, so Hamlet's seat can be offered.
    expect(w.players[0].houseOffer?.choices.length).toBe(3);
    w.enqueue({ type: 'chooseHouse', owner: 0, offerId: w.players[0].houseOffer!.id, choice: 1 });
    w.step();
    expect(w.players[0].seats.length).toBe(1);
    rankUp(w, 0, 1);
    expect(w.players[0].rank).toBe(1);
    expect(wagon(w).tier).toBe(1);
    expect(w.isUnlocked(0, 'watchtower')).toBe(true);
    expect(w.territory.filter((t) => t === 0).length).toBeGreaterThan(land);
    // A second seat is offered, and one of the war houses is always among the choices.
    expect(w.players[0].houseOffer?.choices.some((h) => h === 'spear' || h === 'shield')).toBe(true);
  });
});

describe('winter ice', () => {
  it('freezes the water a little into winter and thaws it before spring, and only the long road uses it', async () => {
    const { iceAt, seasonTicks } = await import('../src/sim/seasons');
    const { World } = await import('../src/sim/world');
    const w = new World({ seed: 7 });
    w.ais = [];
    const winter = seasonTicks() * 3;
    expect(iceAt(winter + 5)).toBe(false);
    expect(iceAt(winter + 150)).toBe(true);
    expect(iceAt(winter + seasonTicks() - 5)).toBe(false);
    expect(iceAt(seasonTicks() * 2)).toBe(false);
    w.tick = winter + 150;
    w.run(2);
    expect(w.frozen).toBe(true);
    // Find a water tile: settlers never stand on it, but a cart's route may cross it.
    const water = w.map.terrain.findIndex((t) => t === 0);
    expect(w.walkableGround(water)).toBe(false);
    const a = w.entranceIdx([...w.buildings.values()].find((b) => b.type === 'wagon')!);
    expect(w.routeOpen(a, water)).toBe(true);
    w.tick = winter + seasonTicks() - 50;
    w.run(100);
    expect(w.frozen).toBe(false);
  });
});
