import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { BUILDINGS } from '../src/sim/defs';
import { canPlace } from '../src/sim/commands';
import { previewInfluence, recomputeTerritory } from '../src/sim/territory';
import { defenceOf } from '../src/sim/warfare';
import { newWorld, wagon } from './helpers';

const tiles = (w: ReturnType<typeof newWorld>, o: number) => w.territory.reduce((n, t) => n + (t === o ? 1 : 0), 0);

describe('garrisons: every banner needs a spear', () => {
  it('free adults take up the watch at guard posts, but never the town’s last carriers', () => {
    const w = newWorld(3);
    const home = wagon(w);
    const tower = w.addBuilding('watchtower', 0, home.x + 5, home.y + 4, true);
    // Make plenty of free adults.
    for (const s of w.settlers.values()) {
      s.child = false;
      s.age = BALANCE.yearTicks * 2;
    }
    w.run(secs(20));
    const guards = [...w.settlers.values()].filter((s) => s.job.kind === 'guard' && s.job.buildingId === tower.id);
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.length).toBeLessThanOrEqual(BUILDINGS.watchtower.garrison!);
    expect(tower.guarded).toBe(guards.length);
  });

  it('from Hamlet an unmanned post pushes with less power and reach', () => {
    const w = newWorld(3);
    const home = wagon(w);
    w.players[0].rank = 1;
    recomputeTerritory(w);
    const at = { owner: 0, x: home.x + 14, y: home.y + 1, r: BUILDINGS.watchtower.claim!, p: BUILDINGS.watchtower.power! };
    const manned = previewInfluence(w, at).gained;
    const tower = w.addBuilding('watchtower', 0, home.x + 13, home.y, true);
    tower.guarded = 0;
    const before = tiles(w, 0);
    recomputeTerritory(w);
    const unmanned = tiles(w, 0) - before;
    expect(unmanned).toBeLessThan(manned);
    // Guards arriving bring it to full strength at once.
    tower.guarded = 2;
    const b2 = tiles(w, 0);
    recomputeTerritory(w);
    expect(tiles(w, 0)).toBeGreaterThanOrEqual(b2);
  });

  it('a stockade counts against the frontier cap and shields buildings near it', () => {
    const w = newWorld(3);
    const home = wagon(w);
    w.players[0].rank = 1;
    const tower = w.addBuilding('lookout', 0, home.x + 9, home.y + 6, true);
    // Far from the hall's ward, so the stockade's aura shows on its own.
    const far = w.addBuilding('lookout', 0, home.x + 30, home.y + 30, true);
    const before = defenceOf(w, far);
    w.addBuilding('stockade', 0, far.x + 3, far.y, true);
    expect(defenceOf(w, far)).toBe(before + BUILDINGS.stockade.defence![1]);
    expect(defenceOf(w, tower)).toBeGreaterThan(0);
    for (let i = w.frontierCount(0); i < w.frontierCap(0); i++) w.addBuilding('lookout', 0, home.x - 8, home.y - 8 + i * 3, true);
    const site = { x: home.x + 3, y: home.y - 5 };
    expect(canPlace(w, 0, 'stockade', site.x, site.y).reason ?? '').toMatch(/hold/);
  });
});
