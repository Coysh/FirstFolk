import { describe, expect, it } from 'vitest';
import { canPlace } from '../src/sim/commands';
import { NO_OWNER, claimArea, owns } from '../src/sim/territory';
import { World } from '../src/sim/world';
import { newWorld, place, runSeconds, wagon } from './helpers';

/** Valleys draw their discoveries from pools: find one that has this kind. */
function withSite(kind: string) {
  for (let seed = 1; seed < 60; seed++) {
    const w = newWorld(seed);
    if (w.sites.some((s) => s.kind === kind)) return w;
  }
  throw new Error(`no valley with a ${kind}`);
}

describe('territory and discoveries', () => {
  it('the wagon claims land and reveals around it', () => {
    const w = newWorld(3);
    const wg = wagon(w);
    expect(owns(w, 0, wg.x + 1, wg.y + 1)).toBe(true);
    expect(w.territory[w.idx(wg.x + 30, wg.y)] ?? NO_OWNER).toBe(NO_OWNER);
    expect(w.explored[w.idx(wg.x + 1, wg.y + 1)] & 1).toBe(1);
  });

  it('buildings can only be placed inside the border', () => {
    const w = newWorld(3);
    const wg = wagon(w);
    let outside: { x: number; y: number } | null = null;
    for (let d = 14; d < 30 && !outside; d++) if (!owns(w, 0, wg.x + d, wg.y)) outside = { x: wg.x + d, y: wg.y };
    expect(outside).not.toBeNull();
    expect(canPlace(w, 0, 'hut', outside!.x, outside!.y).reason).toMatch(/border/);
  });

  it('a finished lookout pushes the border outwards', () => {
    const w = newWorld(3);
    const before = w.territory.filter((t) => t === 0).length;
    const lk = place(w, 'lookout');
    for (let i = 0; i < 3000 && !lk.done; i++) w.step();
    expect(lk.done).toBe(true);
    expect(w.territory.filter((t) => t === 0).length).toBeGreaterThan(before);
  });

  it('claiming land over a discovery claims it once, for the first owner', () => {
    const w = withSite('cart');
    const site = w.sites.find((s) => s.kind === 'cart')!;
    const logs = wagon(w).stock.logs;
    claimArea(w, 0, site.x, site.y, 2);
    expect(site.claimedBy).toBe(0);
    expect(w.players[0].claimed).toBe(1);
    expect(wagon(w).stock.logs).toBe(logs + 12);
    claimArea(w, 0, site.x, site.y, 4);
    expect(w.players[0].claimed).toBe(1);
  });

  it('wanderers join homeless and move into the next free hut', () => {
    const w = withSite('wanderers');
    const site = w.sites.find((s) => s.kind === 'wanderers')!;
    const pop = w.population(0);
    claimArea(w, 0, site.x, site.y, 2);
    expect(w.population(0)).toBe(pop + 4);
    const fam = [...w.families.values()].find((f) => f.homeId === 0)!;
    expect(fam).toBeDefined();
    const hut = place(w, 'hut');
    for (let i = 0; i < 6000 && fam.homeId === 0; i++) w.step();
    expect(fam.homeId).toBe(hut.id);
  });

  it('a rumour reveals a discovery when none is in sight', () => {
    const w = new World({ scenario: 'peaceful', seed: 3 });
    for (const s of w.sites) s.revealed = 0;
    runSeconds(w, 50);
    expect(w.sites.some((s) => s.revealed & 1)).toBe(true);
  });

  it('mapgen places discoveries on both halves of the valley', () => {
    const w = newWorld(5);
    expect(w.sites.length).toBeGreaterThanOrEqual(10);
    const [a, b] = w.map.starts;
    const near = (s: { x: number; y: number }, p: { x: number; y: number }) => Math.hypot(s.x - p.x, s.y - p.y);
    expect(w.sites.filter((s) => near(s, a) < near(s, b)).length).toBeGreaterThanOrEqual(4);
    expect(w.sites.filter((s) => near(s, b) < near(s, a)).length).toBeGreaterThanOrEqual(4);
  });
});
