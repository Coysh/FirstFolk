import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { DISCOVERIES } from '../src/sim/defs';
import { deedOf } from '../src/sim/deeds';
import { OMEN_IDS, rollOmens } from '../src/sim/omens';
import { ORIGINS, ORIGIN_IDS, rivalOrigin } from '../src/sim/origins';
import { renownRate } from '../src/sim/renown';
import { claimArea, recomputeTerritory } from '../src/sim/territory';
import { TIER_XP } from '../src/sim/trades';
import { World } from '../src/sim/world';

const founders = (w: World, owner: number) => [...w.families.values()].find((f) => f.owner === owner)!;

describe('origins (openers)', () => {
  it('each origin gives its craft, buildings, boons and a deed before the clock starts', () => {
    for (const id of ORIGIN_IDS) {
      const w = new World({ seed: 4, scenario: 'peaceful', origin: id });
      const o = ORIGINS[id];
      const fam = founders(w, 0);
      for (const b of o.boons) expect(fam.boons).toContain(b);
      expect(deedOf(fam)).not.toBeNull();
      if (o.skill) {
        expect(fam.skills[o.skill]).toBe(TIER_XP[1]);
        expect(w.players[0].unlocked.length).toBeGreaterThan(0);
      }
      // No founders' boon card to pick: the origin was that choice.
      expect(w.players[0].offers.length).toBe(0);
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
      w.addBuilding('watchtower', 0, site.x - 6, site.y - 1, true);
      recomputeTerritory(w);
      return renownRate(w, 0).landmarks;
    };
    expect(run(['oldKingdom'])).toBe(run([]) + 1);
  });
});

describe('the Moot', () => {
  it('from 25:00 landmarks pay double, and the valley hears of it', () => {
    const w = new World({ seed: 2 });
    const site = w.sites.find((s) => DISCOVERIES[s.kind].renown)!;
    w.addBuilding('watchtower', 0, site.x - 6, site.y - 1, true);
    recomputeTerritory(w);
    const before = renownRate(w, 0).landmarks;
    w.tick = BALANCE.mootAt;
    expect(renownRate(w, 0).landmarks).toBe(before * 2);
    w.run(secs(10));
    expect(w.drainEvents().some((e) => e.type === 'moot')).toBe(true);
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

  it('a Hermit comes to teach the largest family as an elder Master', () => {
    const { w, site } = valleyWith('hermit');
    const pop = w.population(0);
    claimArea(w, 0, site.x, site.y, 2);
    expect(w.population(0)).toBe(pop + 1);
    const hermit = [...w.settlers.values()].find((s) => s.elder)!;
    expect(Math.max(hermit.skills.woodcraft, hermit.skills.stonework, hermit.skills.husbandry)).toBe(TIER_XP[2]);
  });

  it('a Buried Hoard is worth renown at once', () => {
    const { w, site } = valleyWith('hoard');
    claimArea(w, 0, site.x, site.y, 2);
    expect(w.players[0].renown).toBeGreaterThanOrEqual(BALANCE.renown.hoard);
  });
});

describe('happenings and matches', () => {
  it('a star falls between the settlements mid-game: a landmark both can see', async () => {
    const { starfallTick } = await import('../src/sim/happenings');
    const w = new World({ seed: 6 });
    w.tick = starfallTick(w) - 10;
    w.run(20);
    const star = w.sites.find((s) => s.kind === 'starstone')!;
    expect(star).toBeDefined();
    expect(star.revealed & 3).toBe(3);
    expect(DISCOVERIES.starstone.renown).toBeGreaterThan(DISCOVERIES.stones.renown!);
    expect(w.drainEvents().some((e) => e.type === 'starfall')).toBe(true);
  });

  it('a Betrothal lets you choose which families join, and the new house gets both sets of boons', async () => {
    const { VALLEY_EVENTS, resolveEvent } = await import('../src/sim/events');
    const { wed } = await import('../src/sim/population');
    void wed;
    const w = new World({ seed: 3, scenario: 'peaceful' });
    w.players[0].rank = 1;
    // Build a little town: three families with singles, and a free hut.
    const home = [...w.buildings.values()].find((b) => b.type === 'wagon')!;
    const fams = [0, 1, 2].map((i) => {
      const hut = w.addBuilding('hut', 0, home.x - 8 + i * 4, home.y + 6, true);
      const f = [...w.families.values()][0];
      const fam = { ...f, id: w.newId(), surname: ['Ash', 'Brook', 'Cole'][i], homeId: hut.id, boons: [(['keenEyes', 'masterBuilders', 'bigHearts'] as const)[i]], mods: {}, parents: [], glory: 0, deedReady: 0, skills: { ...f.skills } };
      w.families.set(fam.id, fam);
      hut.familyId = fam.id;
      for (let k = 0; k < 2; k++) w.addSettler(0, fam.id, `S${i}${k}`, 2, hut.x, hut.y + 2);
      return fam;
    });
    w.addBuilding('hut', 0, home.x + 6, home.y + 6, true);
    const def = VALLEY_EVENTS.find((d) => d.id === 'betrothal')!;
    const data = def.setup!(w, 0)!;
    expect(data.length).toBe(4);
    w.players[0].event = { id: 77, def: 'betrothal', expires: w.tick + 100, data };
    resolveEvent(w, 0, 77, 0);
    const a = w.settlers.get(data[0])!;
    const merged = w.families.get(a.familyId)!;
    expect(merged.parents.length).toBe(2);
    expect(merged.boons.length).toBeGreaterThanOrEqual(2);
    expect(fams.length).toBe(3);
  });
});
