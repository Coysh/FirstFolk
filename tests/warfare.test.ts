import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { BUILDINGS, DISCOVERIES } from '../src/sim/defs';
import { canPlace } from '../src/sim/commands';
import { previewInfluence, recomputeTerritory, updateHoldings } from '../src/sim/territory';
import { defenceOf, raidProblem, raidStrength, reaversCome, updateReavers } from '../src/sim/warfare';
import { World } from '../src/sim/world';
import { renownRate } from '../src/sim/renown';
import { hashWorld } from '../src/sim/hash';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
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

describe('raids', () => {
  /** A duel world past 10:00 with our Mustering Hall manned by n huscarls and a rival post in sight. */
  function setup(n: number, rivalType: 'lookout' | 'stockade' = 'lookout') {
    const w = new World({ seed: 2 });
    w.tick = BALANCE.raidsFrom;
    const home = wagon(w);
    const hall = w.addBuilding('musterhall', 0, home.x + 3, home.y - 4, true);
    const adults = [...w.settlers.values()].filter((s) => s.owner === 0).slice(0, n);
    for (const s of adults) {
      s.child = false;
      s.job = { kind: 'guard', buildingId: hall.id, phase: 'watch' };
      s.x = hall.x;
      s.y = hall.y + 2;
    }
    const target = w.addBuilding(rivalType, 1, home.x + 16, home.y + 1, true);
    for (let i = 0; i < w.explored.length; i++) w.explored[i] |= 1;
    w.ais = [];
    return { w, hall, target };
  }
  const march = (w: World) => {
    for (let i = 0; i < secs(60) && w.warbands.some((b) => b.phase === 'march'); i++) w.step();
  };

  it('stronger huscarls burn an unguarded post and win spoils', () => {
    const { w, target } = setup(3);
    expect(raidProblem(w, 0, target.id)).toBe('');
    w.enqueue({ type: 'raid', owner: 0, targetId: target.id });
    w.step();
    expect(w.warbands.length).toBe(1);
    const events: string[] = [];
    for (let i = 0; i < secs(60) && w.buildings.has(target.id); i++) {
      w.step();
      for (const e of w.drainEvents()) events.push(e.type);
    }
    expect(w.buildings.has(target.id)).toBe(false);
    expect(events).toContain('razed');
    expect(w.players[0].renownBy.raids ?? 0).toBeGreaterThan(0);
    expect(w.players[0].raidsWon).toBe(1);
    // They come home and stand at the hall again, and must rest before the next raid.
    w.run(secs(60));
    expect(w.warbands.length).toBe(0);
    expect(raidProblem(w, 0, target.id)).not.toBe('');
  });

  it('a post that is stronger holds the line, and its defenders are honoured', () => {
    const { w, target } = setup(2, 'stockade');
    target.guarded = 3;
    expect(defenceOf(w, target)).toBeGreaterThan(raidStrength(w, 0, 2));
    w.enqueue({ type: 'raid', owner: 0, targetId: target.id });
    w.step();
    expect(w.warbands.length).toBe(1);
    march(w);
    expect(w.buildings.has(target.id)).toBe(true);
    expect(w.players[1].repelled).toBe(1);
    expect(w.players[1].renownBy.defence).toBe(BALANCE.repelRenown);
  });

  it('huscarls at home turn out for a post close to their Mustering Hall', () => {
    const { w, target } = setup(2);
    const before = defenceOf(w, target);
    const theirHall = w.addBuilding('musterhall', 1, target.x + 3, target.y + 3, true);
    const s = [...w.settlers.values()].find((x) => x.owner === 1)!;
    s.job = { kind: 'guard', buildingId: theirHall.id, phase: 'watch' };
    expect(defenceOf(w, target)).toBe(before + BALANCE.guardStrength);
  });

  it('a landmark freed by a raid changes hands without paying the seizing prize too', () => {
    const { w, target } = setup(3);
    w.quietSeize = true;
    const site = w.sites.find((x) => DISCOVERIES[x.kind].renown)!;
    site.heldBy = 1;
    site.claimedBy = 1;
    w.territory[w.idx(site.x, site.y)] = 0;
    updateHoldings(w);
    w.quietSeize = false;
    expect(site.heldBy).toBe(0);
    expect(w.players[0].renownBy.landmarks ?? 0).toBe(0);
    void target;
  });

  it('a save in the middle of a march restores to the same game', () => {
    const { w, target } = setup(3);
    w.enqueue({ type: 'raid', owner: 0, targetId: target.id });
    w.run(secs(4));
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    back.ais = [];
    expect(hashWorld(back)).toBe(hashWorld(w));
    w.run(secs(40));
    back.run(secs(40));
    expect(hashWorld(back)).toBe(hashWorld(w));
    expect(back.buildings.has(target.id)).toBe(w.buildings.has(target.id));
  });
});

describe('reavers', () => {
  function spread(posts: number) {
    const w = new World({ seed: 2 });
    w.ais = [];
    const home = wagon(w);
    const built = [];
    for (let i = 0; i < posts; i++) built.push(w.addBuilding('lookout', 0, home.x - 6 + (i % 3) * 3, home.y + 6 + Math.floor(i / 3) * 3, true));
    w.tick = BALANCE.reaversFrom;
    w.nextReaversAt = w.tick;
    return { w, home, built };
  }

  it('leave a settlement with only a few posts alone', () => {
    const { w } = spread(BALANCE.reaverMinPosts - 2);
    updateReavers(w);
    expect(w.warbands.length).toBe(0);
  });

  it('never come to a peaceful valley unless the omen says so', () => {
    const w = newWorld(2);
    expect(reaversCome(w)).toBe(false);
  });

  it('come ashore for the settlement spread widest and march on its furthest post', () => {
    const { w, home, built } = spread(BALANCE.reaverMinPosts + 1);
    updateReavers(w);
    expect(w.warbands.length).toBe(1);
    const band = w.warbands[0];
    expect(band.owner).toBe(-1);
    const far = Math.max(...built.map((b) => Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y))));
    const t = w.buildings.get(band.targetId)!;
    expect(Math.max(Math.abs(t.x - home.x), Math.abs(t.y - home.y))).toBe(far);
  });

  it('a well-guarded far post holds them off, for renown', () => {
    const { w } = spread(BALANCE.reaverMinPosts + 1);
    updateReavers(w);
    const t = w.buildings.get(w.warbands[0].targetId)!;
    w.addBuilding('stockade', 0, t.x + 3, t.y, true).guarded = 3;
    t.guarded = 1;
    for (let i = 0; i < secs(90) && w.warbands.some((b) => b.phase === 'march'); i++) w.step();
    expect(w.buildings.has(t.id)).toBe(true);
    expect(w.players[0].renownBy.defence).toBe(BALANCE.reaverRepel);
  });
});

describe('landmarks need watching', () => {
  it('a landmark pays only while a manned post watches it, and more when a stockade does', () => {
    const w = new World({ seed: 2, scenario: 'peaceful' });
    const site = w.sites.find((s) => DISCOVERIES[s.kind].renown && Math.max(Math.abs(s.x - wagon(w).x), Math.abs(s.y - wagon(w).y)) > 14)!;
    const tower = w.addBuilding('watchtower', 0, site.x - 4, site.y - 1, true);
    recomputeTerritory(w);
    expect(site.heldBy).toBe(0);
    tower.guarded = 0;
    expect(renownRate(w, 0).landmarks).toBe(0);
    tower.guarded = 1;
    expect(renownRate(w, 0).landmarks).toBe(DISCOVERIES[site.kind].renown);
    w.addBuilding('stockade', 0, site.x + 2, site.y + 2, true).guarded = 1;
    expect(renownRate(w, 0).landmarks).toBe(DISCOVERIES[site.kind].renown! + BALANCE.tendedBonus);
  });
});

describe('a rival with a mood', () => {
  it('a peaceable rival that falls far behind sends its huscarls against a post it can beat', async () => {
    const { OpeningBot } = await import('../src/sim/ai/openingBot');
    const w = new World({ seed: 2, rivalStyle: 'mason' });
    w.ais = [];
    const bot = new OpeningBot(1, 10, 1, 'mason');
    w.tick = BALANCE.raidsFrom;
    const theirs = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'wagon')!;
    const hall = w.addBuilding('musterhall', 1, theirs.x + 3, theirs.y - 4, true);
    for (const s of [...w.settlers.values()].filter((x) => x.owner === 1).slice(0, 3)) {
      s.child = false;
      s.job = { kind: 'guard', buildingId: hall.id, phase: 'watch' };
    }
    const post = w.addBuilding('lookout', 0, theirs.x - 14, theirs.y, true);
    for (let i = 0; i < w.explored.length; i++) w.explored[i] |= 2;
    w.players[0].renown = 400;
    w.players[1].renown = 100;
    for (let i = 0; i < 200 && !w.warbands.length; i++) {
      bot.update(w);
      w.step();
    }
    expect(w.warbands.some((b) => b.owner === 1 && b.targetId === post.id)).toBe(true);
  });
});
