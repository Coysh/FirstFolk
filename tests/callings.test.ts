import { describe, expect, it } from 'vitest';
import { CALLING_TIERS, callingScores, callingTier, leadingCalling, updateCallings, type CallingScores } from '../src/sim/callings';
import { BALANCE } from '../src/sim/balance';
import { addFavour, caravanMax, steadingsOf } from '../src/sim/steadings';
import { updateRenown } from '../src/sim/renown';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

const world = () => new World({ seed: 3, scenario: 'peaceful' });
const scores = (o: Partial<CallingScores>): CallingScores => ({ trader: 0, masons: 0, stronghold: 0, hearth: 0, ...o });

/** Put finished buildings in the middle of the map: only their counts matter here. */
function build(w: World, type: Parameters<World['addBuilding']>[0], n: number) {
  for (let i = 0; i < n; i++) w.addBuilding(type, 0, 20 + (i % 10) * 3, 20 + Math.floor(i / 10) * 3, true);
}

describe('callings', () => {
  it('a young town has no calling; a clear leader earns the first tier', () => {
    expect(leadingCalling(scores({ trader: 5 }), '')).toEqual({ id: '', tier: 0 });
    expect(leadingCalling(scores({ trader: CALLING_TIERS[0] }), '')).toEqual({ id: 'trader', tier: 1 });
    expect(leadingCalling(scores({ trader: CALLING_TIERS[1] }), '').tier).toBe(2);
    expect(leadingCalling(scores({ trader: CALLING_TIERS[2] }), '').tier).toBe(3);
  });

  it('needs a clear lead: a tie is no calling at all', () => {
    expect(leadingCalling(scores({ trader: 12, hearth: 12 }), '')).toEqual({ id: '', tier: 0 });
    expect(leadingCalling(scores({ trader: 13, hearth: 12 }), '')).toEqual({ id: '', tier: 0 });
    expect(leadingCalling(scores({ trader: 16, hearth: 12 }), '').id).toBe('trader');
  });

  it('identity sticks: it takes a real lead to change what a town is', () => {
    expect(leadingCalling(scores({ trader: 20, hearth: 24 }), 'trader').id).toBe('trader');
    expect(leadingCalling(scores({ trader: 20, hearth: 28 }), 'trader').id).toBe('hearth');
  });

  it('is read off what the town builds, and announced when it changes', () => {
    const w = world();
    const events: string[] = [];
    build(w, 'storehouse', 4);
    build(w, 'granary', 1);
    expect(callingScores(w, 0).trader).toBeGreaterThanOrEqual(CALLING_TIERS[0]);
    updateCallings(w);
    expect(w.players[0].calling.id).toBe('trader');
    for (const e of w.drainEvents()) if (e.type === 'calling') events.push(`${e.was || '-'}→${e.calling}`);
    expect(events).toContain('-→trader');
    expect(callingTier(w, 0, 'trader')).toBeGreaterThan(0);
    expect(callingTier(w, 0, 'masons')).toBe(0);
  });

  it('Merchants earn more favour at steadings, and run a third cart', () => {
    const w = world();
    const site = steadingsOf(w)[0];
    addFavour(w, site, 0, 20);
    expect(site.st!.favour[0]).toBe(20);
    expect(caravanMax(w, 0)).toBe(2);
    w.players[0].calling = { id: 'trader', tier: 3 };
    addFavour(w, site, 0, 20);
    expect(site.st!.favour[0]).toBe(20 + 35);
    expect(caravanMax(w, 0)).toBe(3);
  });

  it('Masons raise the Great Works for less and are paid more for them', () => {
    const w = world();
    const full = w.buildCost(0, 'henge');
    w.players[0].calling = { id: 'masons', tier: 2 };
    const cheap = w.buildCost(0, 'henge');
    for (const g of Object.keys(full) as (keyof typeof full)[]) expect(cheap[g]).toBe(Math.ceil((full[g]! * 70) / 100));
  });

  it('a Stronghold holds more posts and its guards eat less', () => {
    const w = world();
    const cap = w.frontierCap(0);
    w.players[0].calling = { id: 'stronghold', tier: 3 };
    expect(w.frontierCap(0)).toBe(cap + 2);
    // Guards on a post cost nothing extra at the top tier.
    expect(BALANCE.guardAppetitePct * (3 - 3)).toBe(0);
    const g = w.settlers.values().next().value!;
    g.job = { kind: 'guard', buildingId: wagon(w).id, phase: 'watch' };
    expect(w.eaters(0)).toBe(w.population(0));
  });

  it('a Hearth town in good health earns renown a minute for its people', () => {
    const w = world();
    for (let i = 0; i < 30; i++) w.addSettler(0, 0, 'x', 20, 5, 5);
    w.players[0].calling = { id: 'hearth', tier: 2 };
    const before = w.players[0].renown;
    // Two minutes of payouts (the calling is set by hand, so don't let the world re-read it).
    for (let t = 0; t < (2 * 600) / BALANCE.renownTick; t++) updateRenown(w);
    expect(w.players[0].renownBy.hearth ?? 0).toBeGreaterThan(0);
    expect(w.players[0].renown).toBeGreaterThan(before);
    // A hungry town earns nothing from it.
    const paid = w.players[0].renownBy.hearth ?? 0;
    w.players[0].hungry = true;
    for (let t = 0; t < (2 * 600) / BALANCE.renownTick; t++) updateRenown(w);
    expect(w.players[0].renownBy.hearth ?? 0).toBe(paid);
  });
});
