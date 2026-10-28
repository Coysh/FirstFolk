import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/sim/balance';
import { VALLEY_EVENTS, resolveEvent } from '../src/sim/events';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

const until = (w: World, f: () => boolean, max = 6000) => {
  for (let i = 0; i < max && !f(); i++) w.step();
};

describe('valley events', () => {
  it('the first event arrives after the opening', () => {
    const w = new World({ scenario: 'peaceful', seed: 3 });
    w.run(BALANCE.firstEvent - 20);
    expect(w.players[0].event).toBeNull();
    until(w, () => !!w.players[0].event, 50);
    expect(w.players[0].event).not.toBeNull();
  });

  it('a chosen option pays its cost and applies its effect', () => {
    const w = new World({ scenario: 'peaceful', seed: 3 });
    const p = w.players[0];
    p.event = { id: 999, def: 'trader', expires: w.tick + 100, data: [] };
    wagon(w).stock.logs = 20;
    const planks = wagon(w).stock.planks;
    resolveEvent(w, 0, 999, 0);
    expect(wagon(w).stock.logs).toBe(10);
    expect(wagon(w).stock.planks).toBe(planks + 6);
    expect(p.event).toBeNull();
    expect(p.nextEventAt).toBeGreaterThan(w.tick);
  });

  it('an unaffordable choice falls back to the free option', () => {
    const w = new World({ scenario: 'peaceful', seed: 3 });
    w.players[0].event = { id: 5, def: 'trader', expires: w.tick + 100, data: [] };
    wagon(w).stock.logs = 2;
    resolveEvent(w, 0, 5, 0);
    expect(wagon(w).stock.logs).toBe(2);
  });

  it('ignored events resolve themselves', () => {
    const w = new World({ scenario: 'peaceful', seed: 3 });
    until(w, () => !!w.players[0].event);
    const id = w.players[0].event!.id;
    w.run(BALANCE.eventTimeout + 20);
    expect(w.players[0].event?.id).not.toBe(id);
  });

  it('every event has a free last option so ignoring is always safe', () => {
    for (const d of VALLEY_EVENTS) expect(d.options.at(-1)!.cost).toBeUndefined();
  });
});
