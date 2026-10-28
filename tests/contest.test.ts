import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { DEEDS, deedCost, deedProblem } from '../src/sim/deeds';
import { HOUSES, playerMod, seatHouse, type HouseId } from '../src/sim/houses';
import { defenceOf, raidStrength } from '../src/sim/warfare';
import { BUILDINGS, DISCOVERIES } from '../src/sim/defs';
import { FAIR_LOT, FAIR_VALUE, fairPrice } from '../src/sim/market';
import { recomputeTerritory } from '../src/sim/territory';
import { evaluateScenario, LANDFALL } from '../src/sim/scenario';
import { World } from '../src/sim/world';
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
    // Escalation is shared: a Watchtower counts against the next Lookout too.
    const second = w.buildCost(0, 'lookout').logs!;
    w.addBuilding('watchtower', 0, wagon(w).x - 6, wagon(w).y + 4, true);
    expect(w.buildCost(0, 'lookout').logs!).toBeGreaterThan(second);
  });
});

describe('house powers', () => {
  /** Seat one house for player 0 (in a peaceful valley), its power ready. */
  const seated = (w: World, house: HouseId) => {
    w.players[0].seats = [];
    seatHouse(w, 0, house);
    w.players[0].seats[0].ready = 0;
    return 0;
  };

  it('each house lends exactly one power, and seats hold distinct houses', () => {
    const w = newWorld();
    seatHouse(w, 0, 'hammer');
    seatHouse(w, 0, 'hammer');
    expect(w.players[0].seats.length).toBe(1);
    expect(HOUSES[w.players[0].seats[0].house].power).toBe('raise');
    expect(playerMod(w, 0, 'build')).toBe(40);
  });

  it('Raise finishes a construction site at once', () => {
    const w = newWorld();
    const k = seated(w, 'hammer');
    const site = w.addBuilding('hut', 0, wagon(w).x + 5, wagon(w).y + 5);
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: site.x, y: site.y });
    w.step();
    expect(site.done).toBe(true);
    expect(w.players[0].seats[k].ready).toBeGreaterThan(w.tick);
    // On cooldown: a second use does nothing.
    const site2 = w.addBuilding('hut', 0, wagon(w).x - 6, wagon(w).y + 5);
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: site2.x, y: site2.y });
    w.step();
    expect(site2.done).toBe(false);
    expect(deedProblem(w, 0, k)).toMatch(/Ready in/);
  });

  it('a Festival surges influence for a minute, then fades', () => {
    const w = newWorld();
    const k = seated(w, 'hearth');
    w.players[0].rank = 1;
    const store = wagon(w);
    store.stock.berries = 50;
    const before = tiles(w, 0);
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: store.x + 10, y: store.y });
    w.step();
    expect(tiles(w, 0)).toBeGreaterThan(before);
    expect(w.players[0].boosts.length).toBe(1);
    w.run(secs(61));
    expect(w.players[0].boosts.every((b) => b.until <= w.tick)).toBe(true);
  });

  it('an Expedition raises an outpost beyond the border, and the next costs more', () => {
    const w = newWorld();
    const k = seated(w, 'horn');
    const store = wagon(w);
    store.stock.logs = 80;
    store.stock.berries = 40;
    const cost = deedCost(w, 0, 'expedition').logs!;
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: store.x + 20, y: store.y });
    w.step();
    expect(w.countBuildings(0, 'outpost')).toBe(1);
    expect(deedCost(w, 0, 'expedition').logs!).toBeGreaterThan(cost);
    expect(DEEDS.expedition.target).toBe(true);
  });

  it('the Shield Wall adds its defence near where it is raised, for a minute', () => {
    const w = newWorld();
    const k = seated(w, 'shield');
    const home = wagon(w);
    // Far from the hall (so its own defence doesn't count), on ground that can take a post.
    const far = [[30, 30], [-30, 30], [30, -30], [-30, -30], [34, 0], [0, 34], [-34, 0], [0, -34]]
      .map(([dx, dy]) => ({ x: home.x + dx, y: home.y + dy }))
      .find((p) => w.inBounds(p.x, p.y) && w.inBounds(p.x + 2, p.y + 2) && [0, 1].every((o) => w.walkable(w.idx(p.x + o, p.y + o))))!;
    const post = w.addBuilding('lookout', 0, far.x, far.y, true);
    w.territory[w.idx(post.x, post.y)] = 0;
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: post.x, y: post.y });
    w.step();
    post.guarded = 0;
    expect(defenceOf(w, post)).toBe(BALANCE.shieldWall[1]);
    w.run(secs(61));
    post.guarded = 0;
    expect(defenceOf(w, post)).toBe(0);
  });

  it('the War-Horn readies the huscarls and strengthens the next raid', () => {
    const w = newWorld();
    const k = seated(w, 'spear');
    expect(deedProblem(w, 0, k)).toMatch(/Mustering Hall/);
    w.addBuilding('musterhall', 0, wagon(w).x + 4, wagon(w).y - 5, true);
    const plain = raidStrength(w, 0, 4);
    expect(plain).toBe(4 * (BALANCE.guardStrength + 5));
    w.enqueue({ type: 'deed', owner: 0, seat: k, x: 0, y: 0 });
    w.step();
    expect(raidStrength(w, 0, 4)).toBe(Math.floor((plain * 3) / 2));
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

describe('influence previews', () => {
  it('a preview reports the land and landmarks a tower would win, without changing anything', async () => {
    const { previewInfluence } = await import('../src/sim/territory');
    const w = new World({ seed: 2 });
    const site = w.sites.find((s) => DISCOVERIES[s.kind].renown && !DISCOVERIES[s.kind].aura)!;
    const before = Int8Array.from(w.territory);
    const p = previewInfluence(w, { owner: 0, x: site.x - 2, y: site.y, r: 12, p: 100 });
    expect(p.gained).toBeGreaterThan(50);
    expect(p.sites.map((s) => s.id)).toContain(site.id);
    expect(Array.from(w.territory)).toEqual(Array.from(before));
    // And the real thing matches the preview.
    w.addBuilding('watchtower', 0, site.x - 3, site.y - 1, true);
    recomputeTerritory(w);
    expect(site.heldBy).toBe(0);
  });
});
