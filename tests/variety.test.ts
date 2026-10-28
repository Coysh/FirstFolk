import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { DISCOVERIES } from '../src/sim/defs';
import { HOUSES } from '../src/sim/houses';
import { OMEN_IDS, rollOmens } from '../src/sim/omens';
import { ORIGINS, ORIGIN_IDS, rivalOrigin } from '../src/sim/origins';
import { renownRate } from '../src/sim/renown';
import { claimArea, recomputeTerritory } from '../src/sim/territory';
import { TIER_XP } from '../src/sim/trades';
import { World } from '../src/sim/world';

const founders = (w: World, owner: number) => [...w.families.values()].find((f) => f.owner === owner)!;

describe('origins (openers)', () => {
  it('each origin seats its founding house, and gives its craft and buildings before the clock starts', () => {
    for (const id of ORIGIN_IDS) {
      const w = new World({ seed: 4, scenario: 'peaceful', origin: id });
      const o = ORIGINS[id];
      const fam = founders(w, 0);
      expect(w.players[0].seats.map((s) => s.house)).toEqual([o.house]);
      expect(w.players[0].seats[0].familyId).toBe(fam.id);
      expect(Object.keys(w.players[0].mods)).toEqual(Object.keys(HOUSES[o.house].mods));
      if (o.skill) {
        expect(w.players[0].crafts[o.skill]).toBe(TIER_XP[1]);
        expect(w.players[0].unlocked.length).toBeGreaterThan(0);
      }
      // No founders' letter to answer: the origin was that choice.
      expect(w.players[0].houseOffer).toBeNull();
      expect(w.population(0)).toBe(4 + (o.children ?? 0));
    }
  });

  it('the rival rolls an origin of its own from the seed', () => {
    const w = new World({ seed: 9, origin: 'woodfolk' });
    expect(w.players[1].origin).toBe(rivalOrigin(9));
  });
});

describe('omens', () => {
  it('every valley rolls two distinct omens, the same for the same seed', () => {
    for (let seed = 1; seed < 40; seed++) {
      const o = rollOmens(seed);
      expect(o.length).toBe(2);
      expect(o[0]).not.toBe(o[1]);
      expect(rollOmens(seed)).toEqual(o);
      for (const id of o) expect(OMEN_IDS).toContain(id);
    }
  });

  it('Rich Seams doubles the stone in every rock', () => {
    const plain = new World({ seed: 5, scenario: 'peaceful' });
    const rich = new World({ seed: 5, scenario: 'peaceful', omens: ['richSeams'] });
    const stone = (w: World) => [...w.nodes.values()].filter((n) => n.kind === 'rock').reduce((n, r) => n + r.max, 0);
    expect(stone(rich)).toBe(stone(plain) * 2);
  });

  it('The Old Kingdom makes every landmark pay a little more', () => {
    const run = (omens: ('oldKingdom')[]) => {
      const w = new World({ seed: 2, scenario: 'peaceful', omens });
      const site = w.sites.find((s) => DISCOVERIES[s.kind].renown)!;
      const tower = w.addBuilding('watchtower', 0, site.x - 6, site.y - 1, true);
      recomputeTerritory(w);
      tower.guarded = 1;
      return renownRate(w, 0).landmarks;
    };
    expect(run(['oldKingdom'])).toBe(run([]) + 1);
  });
});

describe('new discoveries', () => {
  const valleyWith = (kind: string) => {
    for (let seed = 1; seed < 80; seed++) {
      const w = new World({ seed, scenario: 'peaceful' });
      const site = w.sites.find((s) => s.kind === kind);
      if (site) return { w, site };
    }
    throw new Error(`no ${kind}`);
  };

  it('a Barrow Mound gives you a legend', () => {
    const { w, site } = valleyWith('barrow');
    claimArea(w, 0, site.x, site.y, 2);
    expect(w.players[0].legends.length).toBe(1);
    expect(w.players[0].renownBy.legends).toBe(BALANCE.renown.legend);
  });

  it('a Hermit teaches the town the craft it knows least', () => {
    const { w, site } = valleyWith('hermit');
    const before = { ...w.players[0].crafts };
    claimArea(w, 0, site.x, site.y, 2);
    const gained = (['woodcraft', 'stonework', 'husbandry'] as const).map((k) => w.players[0].crafts[k] - before[k]);
    expect(Math.max(...gained)).toBe(BALANCE.hermitXp);
  });

  it('a Buried Hoard is worth renown at once', () => {
    const { w, site } = valleyWith('hoard');
    claimArea(w, 0, site.x, site.y, 2);
    expect(w.players[0].renown).toBeGreaterThanOrEqual(BALANCE.renown.hoard);
  });
});

describe('happenings and matches', () => {
  it('a star falls between the settlements mid-game: the Kingstone, a landmark both can see, and the Crown with it', async () => {
    const { starfallTick } = await import('../src/sim/happenings');
    const w = new World({ seed: 6 });
    w.tick = starfallTick(w) - 10;
    w.run(20);
    const star = w.sites.find((s) => s.kind === 'kingstone')!;
    expect(star).toBeDefined();
    expect(star.revealed & 3).toBe(3);
    expect(w.crown?.siteId).toBe(star.id);
    expect(DISCOVERIES.kingstone.renown).toBeGreaterThan(DISCOVERIES.starstone.renown!);
    expect(w.drainEvents().some((e) => e.type === 'starfall')).toBe(true);
  });

  it('a classic start asks which house founds the settlement, and settles it if left unanswered', () => {
    const w = new World({ seed: 3, scenario: 'peaceful' });
    const o = w.players[0].houseOffer!;
    expect(o.choices.every((h) => !['spear', 'shield'].includes(h))).toBe(true);
    w.run(secs(121));
    expect(w.players[0].seats.map((s) => s.house)).toEqual([o.choices[0]]);
  });
});

describe('dynasties (meta-progression)', () => {
  it('a winning house founds the next valley with its name, house and craft, more skilled each generation', () => {
    const w = new World({ seed: 8, origin: 'dynasty', dynasty: { surname: 'Thorne', house: 'hammer', skill: 'stonework', generation: 3 } });
    const fam = founders(w, 0);
    expect(fam.surname).toBe('Thorne');
    expect(w.players[0].seats[0].house).toBe('hammer');
    expect(w.players[0].crafts.stonework).toBe(TIER_XP[1] + 300);
    expect(w.players[0].unlocked).toContain('storehouse');
    // The rival still rolls an ordinary origin.
    expect(ORIGIN_IDS).toContain(w.players[1].origin);
  });
});

describe('challenges, acclaim and auto-homes', () => {
  it('the valley calls a challenge, and the first to the target wins the prize', async () => {
    const { CHALLENGES, challengeProgress } = await import('../src/sim/challenges');
    const w = new World({ seed: 5 });
    w.tick = BALANCE.firstChallenge - 5;
    w.run(20);
    expect(w.challenge).not.toBeNull();
    const def = CHALLENGES.find((d) => d.id === w.challenge!.def)!;
    expect(challengeProgress(w, 0)).toEqual([0, def.target]);
    // Fake the player's progress past the line.
    w.challenge!.start[0] -= def.target;
    const before = w.players[0].renown;
    w.run(20);
    expect(w.challenge).toBeNull();
    expect(w.players[0].challengesWon).toBe(1);
    expect(w.players[0].renown).toBe(before + def.prize);
  });

  it('with auto-homes on, families put up a hut when every home is full', () => {
    const w = new World({ seed: 4, scenario: 'peaceful' });
    const wagon = [...w.buildings.values()].find((b) => b.type === 'wagon')!;
    wagon.stock.logs = 60;
    wagon.stock.stone = 20;
    w.enqueue({ type: 'setAutoHomes', owner: 0, on: true });
    w.run(secs(12));
    expect(w.countBuildings(0, 'hut', true)).toBeGreaterThan(0);
  });
});
