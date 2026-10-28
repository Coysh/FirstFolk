import { describe, expect, it } from 'vitest';
import { BOONS, addBoon, drawBoons, mod } from '../src/sim/boons';
import { hashWorld } from '../src/sim/hash';
import { World } from '../src/sim/world';
import { place, runSeconds, wagon } from './helpers';

describe('family boons', () => {
  it('the founders are offered a first boon straight away', () => {
    const w = new World({ scenario: 'peaceful', seed: 2 });
    const offers = w.players[0].offers;
    expect(offers.length).toBe(1);
    expect(offers[0].choices.length).toBe(3);
    expect(new Set(offers[0].choices).size).toBe(3);
  });

  it('choosing a boon applies its effect to the family', () => {
    const w = new World({ scenario: 'peaceful', seed: 2 });
    const o = w.players[0].offers[0];
    w.enqueue({ type: 'chooseBoon', owner: 0, offerId: o.id, choice: 1 });
    w.step();
    const fam = w.families.get(o.familyId)!;
    expect(fam.boons).toEqual([o.choices[1]]);
    const [key, value] = Object.entries(BOONS[o.choices[1]].mods)[0];
    expect(mod(w, fam.id, key as never)).toBe(value);
    expect(w.players[0].offers.length).toBe(0);
  });

  it('unanswered offers resolve themselves so the game never waits', () => {
    const w = new World({ scenario: 'peaceful', seed: 2 });
    runSeconds(w, 65);
    const founders = [...w.families.values()][0];
    expect(founders.boons.length).toBeGreaterThanOrEqual(1);
  });

  it('draws are deterministic and skip boons the family already has', () => {
    const a = new World({ scenario: 'peaceful', seed: 9 });
    const b = new World({ scenario: 'peaceful', seed: 9 });
    expect(a.players[0].offers[0].choices).toEqual(b.players[0].offers[0].choices);
    const fam = [...a.families.values()][0];
    addBoon(fam, 'hardy');
    for (let i = 0; i < 20; i++) expect(drawBoons(a, fam)).not.toContain('hardy');
  });

  it('marriage founds a household with both families’ boons and best skills', () => {
    const w = new World({ scenario: 'peaceful', seed: 4 });
    const [founders] = [...w.families.values()];
    addBoon(founders, 'keenEyes');
    // Fast-forward: the eldest founder child comes of age, a wandering family arrives single.
    runSeconds(w, 200);
    const single = [...w.settlers.values()].find((s) => !s.child && s.spouseId === 0 && s.familyId === founders.id);
    expect(single).toBeDefined();
    const other = [...w.settlers.values()].find((s) => s.familyId !== founders.id && !s.child && s.spouseId === 0);
    if (!other) {
      // Make a single adult in another family by hand.
      const fam2 = { ...founders, id: w.newId(), surname: 'Wren', boons: [], mods: {}, parents: [] };
      w.families.set(fam2.id, fam2);
      addBoon(fam2, 'twins');
      const s2 = w.addSettler(0, fam2.id, 'Edith', 2, single!.x, single!.y);
      s2.skills.stonework = 300;
      fam2.skills = { ...fam2.skills, stonework: 300 };
    }
    // A full larder: marriages (like migrants) wait for full bellies.
    wagon(w).stock.berries = 60;
    place(w, 'hut');
    runSeconds(w, 60);
    const married = [...w.families.values()].find((f) => f.parents.length === 2);
    expect(married).toBeDefined();
    expect(married!.boons).toContain('keenEyes');
    const [pa, pb] = married!.parents.map((id) => w.families.get(id));
    for (const k of ['woodcraft', 'stonework', 'husbandry'] as const)
      expect(married!.skills[k]).toBeGreaterThanOrEqual(Math.max(pa?.skills[k] ?? 0, pb?.skills[k] ?? 0));
  });

  it('boon choices replay deterministically', () => {
    const run = () => {
      const w = new World({ scenario: 'peaceful', seed: 6 });
      w.enqueue({ type: 'chooseBoon', owner: 0, offerId: w.players[0].offers[0].id, choice: 2 });
      runSeconds(w, 90);
      return hashWorld(w);
    };
    expect(run()).toBe(run());
  });
});
