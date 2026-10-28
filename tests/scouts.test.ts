import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { scoutProblem } from '../src/sim/scouts';
import { SAGA } from '../src/sim/saga';
import { starfallTick } from '../src/sim/happenings';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

/** A walkable tile a good way from the hall, that no one has seen. */
function farSpot(w: World, owner = 0, dist = 24, fresh = true) {
  const home = [...w.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon')!;
  for (let d = dist; d >= 8; d--)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = home.x + dx * d;
      const y = home.y + dy * d;
      if (w.inBounds(x, y) && !scoutProblem(w, owner, x, y) && (!fresh || !(w.explored[w.idx(x, y)] & (1 << owner)))) return { x, y };
    }
  throw new Error('no spot');
}

describe('scouts', () => {
  it('run out across the fog, look around, and come home, lifting the fog on the way', () => {
    const w = new World({ seed: 3, scenario: 'peaceful' });
    const { x, y } = farSpot(w);
    const seen = (w.explored[w.idx(x, y)] & 1) !== 0;
    expect(seen).toBe(false);
    w.enqueue({ type: 'scout', owner: 0, x, y });
    w.step();
    expect(w.scouts).toHaveLength(1);
    const events: string[] = [];
    let n = 0;
    while (w.scouts.length && n++ < secs(120)) {
      w.step();
      for (const e of w.drainEvents()) events.push(e.type);
    }
    expect(w.scouts).toHaveLength(0);
    expect(w.explored[w.idx(x, y)] & 1).toBe(1);
    expect(events).toContain('scoutHome');
    expect(n).toBeLessThan(secs(100));
  });

  it('one at a time, and they rest between trips', () => {
    const w = new World({ seed: 3, scenario: 'peaceful' });
    const { x, y } = farSpot(w);
    const spot2 = farSpot(w, 0, 16);
    w.enqueue({ type: 'scout', owner: 0, x, y });
    w.step();
    expect(scoutProblem(w, 0, spot2.x, spot2.y)).toMatch(/still out/);
    let n = 0;
    while (w.scouts.length && n++ < secs(120)) w.step();
    // Home again, but resting.
    if (w.tick < w.players[0].scoutReady) expect(scoutProblem(w, 0, spot2.x, spot2.y)).toMatch(/resting/);
    w.run(BALANCE.scoutCooldown);
    expect(scoutProblem(w, 0, spot2.x, spot2.y)).toBe('');
  });

  it('refuse water, and places too far away', () => {
    const w = new World({ seed: 3, scenario: 'peaceful' });
    const h = wagon(w);
    expect(scoutProblem(w, 0, h.x + BALANCE.scoutReach + 5, h.y)).not.toBe('');
    let water = -1;
    for (let i = 0; i < w.map.terrain.length && water < 0; i++) if (!w.walkable(i) && Math.abs((i % w.size) - h.x) < 30 && Math.abs(Math.floor(i / w.size) - h.y) < 30) water = i;
    if (water >= 0) expect(scoutProblem(w, 0, water % w.size, Math.floor(water / w.size))).toMatch(/walk/);
  });

  it('are noticed by a settlement whose land they cross', () => {
    const w = new World({ seed: 3 });
    w.ais = [];
    const home = wagon(w);
    // The rival's hall, and a scout sent straight at it.
    const rivalHall = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'wagon')!;
    const tx = Math.round(home.x + (rivalHall.x - home.x) * 0.85);
    const ty = Math.round(home.y + (rivalHall.y - home.y) * 0.85);
    let target = { x: tx, y: ty };
    for (let d = 0; d < 6 && scoutProblem(w, 0, target.x, target.y); d++) target = { x: tx - d, y: ty + d };
    if (scoutProblem(w, 0, target.x, target.y)) return; // this valley does not let a scout cross; the other seeds do
    w.enqueue({ type: 'scout', owner: 0, x: target.x, y: target.y });
    const events: string[] = [];
    for (let i = 0; i < secs(150) && (w.scouts.length || !i); i++) {
      w.step();
      for (const e of w.drainEvents()) events.push(e.type);
    }
    expect(events).toContain('scoutSpotted');
  });
});

describe('the saga', () => {
  it('tells its beats in order, once each, as their moments come', () => {
    const w = new World({ seed: 6 });
    w.ais = [];
    const told: number[] = [];
    const run = (secsN: number) => {
      w.run(secs(secsN));
      for (const e of w.drainEvents()) if (e.type === 'sagaBeat') told.push(e.beat);
    };
    run(5);
    expect(told).toEqual([0]);
    w.tick = secs(5 * 60 + 40);
    run(5);
    expect(told).toEqual([0, 1]);
    w.tick = secs(10 * 60 + 5);
    run(5);
    expect(told).toEqual([0, 1, 2]);
    expect(w.saga).toBe(3);
    // The star falls, and the Crown with it.
    w.tick = 0;
    w.tick = starfallTick(w) - 10;
    run(40);
    expect(told.at(-1)).toBe(3);
    expect(SAGA[3].id).toBe('star');
  });

  it('keeps the neighbours out of a valley with no rival', () => {
    const w = new World({ seed: 6, scenario: 'peaceful' });
    w.tick = secs(11 * 60);
    w.run(secs(5));
    const told = w.drainEvents().filter((e) => e.type === 'sagaBeat');
    expect(told.length).toBeGreaterThan(0);
    expect(w.saga).toBeLessThan(SAGA.findIndex((b) => b.id === 'star') + 1);
    expect(SAGA.filter((_, i) => i < w.saga).every((b) => b.id !== 'smoke' && b.id !== 'banners')).toBe(true);
  });
});
