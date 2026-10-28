import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { DEEDS, council, deedCost, deedOf } from '../src/sim/deeds';
import { BUILDINGS, DISCOVERIES } from '../src/sim/defs';
import { FAIR_LOT, FAIR_VALUE, fairPrice } from '../src/sim/market';
import { recomputeTerritory } from '../src/sim/territory';
import { TIER_XP } from '../src/sim/trades';
import { evaluateScenario, LANDFALL } from '../src/sim/scenario';
import { World, lifespan } from '../src/sim/world';
import { newWorld, wagon } from './helpers';

const tiles = (w: World, o: number) => w.territory.reduce((n, t) => n + (t === o ? 1 : 0), 0);

describe('living borders', () => {
  it('stronger influence pushes a border back, but never takes a building’s own ground', () => {
    const w = new World({ seed: 2 });
    const home = wagon(w);
    const before = tiles(w, 0);
    // A rival tower right at our border: its influence beats ours on the near side.
    const tower = w.addBuilding('watchtower', 1, home.x + 12, home.y, true);
    recomputeTerritory(w);
    expect(tiles(w, 0)).toBeLessThan(before);
    expect(w.territory[w.idx(tower.x, tower.y)]).toBe(1);
    // Our hall's own footprint and entrance stay ours whatever the pressure.
    for (let i = 0; i < 4; i++) w.addBuilding('watchtower', 1, home.x - 4 + i * 3, home.y - 4, true);
    recomputeTerritory(w);
    expect(w.territory[w.idx(home.x, home.y)]).toBe(0);
    expect(w.territory[w.entranceIdx(home)]).toBe(0);
  });

  it('landmarks change hands with the border, and taking one is worth renown', () => {
    const w = new World({ seed: 2 });
    const site = w.sites.find((s) => DISCOVERIES[s.kind].renown && !DISCOVERIES[s.kind].aura)!;
    w.addBuilding('watchtower', 0, site.x - 6, site.y - 1, true);
    recomputeTerritory(w);
    expect(site.heldBy).toBe(0);
    const renown0 = w.players[1].renown;
    for (let i = 0; i < 3; i++) w.addBuilding('watchtower', 1, site.x + 3 + (i - 1) * 3, site.y + 3, true);
    recomputeTerritory(w);
    expect(site.heldBy).toBe(1);
    expect(w.players[1].taken).toBe(1);
    expect(w.players[1].renown).toBeGreaterThanOrEqual(renown0 + BALANCE.renown.seized);
  });

  it('held landmarks pay renown every minute', () => {
    const w = newWorld(2);
    const site = w.sites.find((s) => DISCOVERIES[s.kind].renown)!;
    w.addBuilding('watchtower', 0, site.x - 1, site.y - 1, true);
    recomputeTerritory(w);
    const before = w.players[0].renownBy.landmarks ?? 0;
    w.run(secs(60));
    expect((w.players[0].renownBy.landmarks ?? 0) - before).toBe(DISCOVERIES[site.kind].renown);
  });

  it('each frontier tower makes the next dearer', () => {
    const w = newWorld();
    const first = w.buildCost(0, 'lookout').logs!;
    w.addBuilding('lookout', 0, wagon(w).x + 4, wagon(w).y + 4, true);
    expect(w.buildCost(0, 'lookout').logs!).toBeGreaterThan(first);
  });
});

describe('family deeds', () => {
  const seat = (w: World, skill: 'stonework' | 'woodcraft' | 'husbandry') => {
    const fam = [...w.families.values()].find((f) => f.owner === 0)!;
    fam.boons = [];
    fam.mods = {};
    fam.skills[skill] = TIER_XP[1];
    fam.deedReady = 0;
    return fam;
  };

  it('a family with a Journeyman lends the council its craft’s deed; each deed sits once', () => {
    const w = newWorld();
    const fam = seat(w, 'stonework');
    expect(deedOf(fam)).toBe('raise');
    expect(council(w, 0)).toContain(fam);
    const ids = council(w, 0).map((f) => deedOf(f));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Raise finishes a construction site at once', () => {
    const w = newWorld();
    const fam = seat(w, 'stonework');
    const site = w.addBuilding('hut', 0, wagon(w).x + 5, wagon(w).y + 5);
    w.enqueue({ type: 'deed', owner: 0, familyId: fam.id, x: site.x, y: site.y });
    w.step();
    expect(site.done).toBe(true);
    expect(fam.deedReady).toBeGreaterThan(w.tick);
    // On cooldown: a second use does nothing.
    const site2 = w.addBuilding('hut', 0, wagon(w).x - 6, wagon(w).y + 5);
    w.enqueue({ type: 'deed', owner: 0, familyId: fam.id, x: site2.x, y: site2.y });
    w.step();
    expect(site2.done).toBe(false);
  });

  it('a Festival surges influence for a minute, then fades', () => {
    const w = newWorld();
    const fam = seat(w, 'husbandry');
    fam.boons = ['bigHearts'];
    expect(deedOf(fam)).toBe('festival');
    w.players[0].rank = 1;
    const store = wagon(w);
    store.stock.berries = 50;
    const before = tiles(w, 0);
    w.enqueue({ type: 'deed', owner: 0, familyId: fam.id, x: store.x + 10, y: store.y });
    w.step();
    expect(tiles(w, 0)).toBeGreaterThan(before);
    expect(w.players[0].boosts.length).toBe(1);
    w.run(secs(61));
    expect(w.players[0].boosts.every((b) => b.until <= w.tick)).toBe(true);
  });

  it('an Expedition raises an outpost beyond the border, and the next costs more', () => {
    const w = newWorld();
    const fam = seat(w, 'husbandry');
    fam.boons = ['wanderlust'];
    const store = wagon(w);
    store.stock.logs = 80;
    store.stock.berries = 40;
    const cost = deedCost(w, 0, 'expedition').logs!;
    w.enqueue({ type: 'deed', owner: 0, familyId: fam.id, x: store.x + 20, y: store.y });
    w.step();
    expect(w.countBuildings(0, 'outpost')).toBe(1);
    expect(deedCost(w, 0, 'expedition').logs!).toBeGreaterThan(cost);
    expect(DEEDS.expedition.target).toBe(true);
  });
});

describe('great works', () => {
  it('only the first to finish wins it; the other site is abandoned with half its goods returned', async () => {
    const { onBuildingComplete } = await import('../src/sim/territory');
    const w = new World({ seed: 2 });
    for (const p of w.players) p.rank = 2;
    const mine = w.addBuilding('henge', 0, wagon(w).x + 5, wagon(w).y + 3);
    const hall1 = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'wagon')!;
    const theirs = w.addBuilding('henge', 1, hall1.x + 5, hall1.y + 3);
    mine.delivered.stone = 40;
    const stoneBefore = w.stored(0, 'stone');
    theirs.done = true;
    onBuildingComplete(w, theirs);
    expect(w.buildings.has(mine.id)).toBe(false);
    expect(w.stored(0, 'stone')).toBeGreaterThanOrEqual(stoneBefore + 20);
    expect(w.players[1].renownBy.works).toBe(BUILDINGS.henge.great!.renown);
    expect(w.drainEvents().some((e) => e.type === 'workLost' && e.owner === 0)).toBe(true);
  });

  it('a finished work blocks anyone else from beginning it', async () => {
    const { canPlace } = await import('../src/sim/commands');
    const w = newWorld();
    w.players[0].rank = 2;
    w.addBuilding('meadhall', 0, wagon(w).x + 5, wagon(w).y + 3, true);
    expect(canPlace(w, 0, 'meadhall', wagon(w).x - 8, wagon(w).y).reason).toBe('Already yours');
    expect(BUILDINGS.meadhall.great).toBeDefined();
  });
});

describe('Market Day', () => {
  it('sells a lot for renown, and each sale gluts the price', () => {
    const w = newWorld();
    w.players[0].rank = 1;
    wagon(w).stock.logs = 100;
    const price = fairPrice(w, 0, 'logs');
    expect(price).toBe(FAIR_VALUE.logs);
    w.enqueue({ type: 'sell', owner: 0, good: 'logs' });
    w.step();
    expect(w.stored(0, 'logs')).toBe(100 - FAIR_LOT);
    expect(w.players[0].renownBy.trade).toBe(price);
    expect(fairPrice(w, 0, 'logs')).toBeLessThanOrEqual(price);
    expect(w.players[0].glut.logs).toBeGreaterThan(0);
  });

  it('a standing order sells whatever is above the reserve, a lot at a time', () => {
    const w = newWorld();
    w.players[0].rank = 1;
    wagon(w).stock.stone = 120;
    w.enqueue({ type: 'setTrade', owner: 0, good: 'stone', keep: 60 });
    w.run(secs(90));
    expect(w.stored(0, 'stone')).toBeLessThanOrEqual(80);
    expect(w.stored(0, 'stone')).toBeGreaterThanOrEqual(60);
    expect(w.players[0].renownBy.trade ?? 0).toBeGreaterThan(0);
    w.enqueue({ type: 'setTrade', owner: 0, good: 'stone', keep: null });
    w.step();
    expect(w.players[0].routes.stone).toBeUndefined();
  });

  it('is closed to a mere camp', () => {
    const w = newWorld();
    wagon(w).stock.logs = 100;
    w.enqueue({ type: 'sell', owner: 0, good: 'logs' });
    w.step();
    expect(w.stored(0, 'logs')).toBe(100);
  });
});

describe('lineage', () => {
  it('elders stop working and teach; a Master who dies becomes a legend', () => {
    const w = newWorld();
    const s = [...w.settlers.values()].find((x) => x.owner === 0 && !x.child)!;
    s.skills.stonework = TIER_XP[2];
    s.age = Math.round(BALANCE.elderYears * BALANCE.yearTicks) - 5;
    w.run(20);
    expect(s.elder).toBe(true);
    expect(s.job.kind).toBe('idle');
    s.age = lifespan(s);
    w.run(20);
    expect(w.settlers.has(s.id)).toBe(false);
    expect(w.players[0].legends.map((l) => l.skill)).toContain('stonework');
    expect(w.players[0].renownBy.legends).toBe(BALANCE.renown.legend);
  });
});

describe('the renown race', () => {
  it('when the clock runs out, the most renowned settlement wins', () => {
    const w = new World({ seed: 3 });
    w.players[0].renown = 400;
    w.players[1].renown = 650;
    w.tick = LANDFALL.timeLimit!;
    evaluateScenario(w);
    expect(w.scenarioState.winner).toBe(1);
    expect(w.drainEvents().some((e) => e.type === 'victory' && e.byTime)).toBe(true);
  });
});
