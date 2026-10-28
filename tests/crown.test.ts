import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { CONTESTED, crownEta, crownPct, crownRate, crownSite, updateCrown, watchers } from '../src/sim/crown';
import { starfallTick } from '../src/sim/happenings';
import { hashWorld } from '../src/sim/hash';
import { raze } from '../src/sim/warfare';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { evaluateScenario } from '../src/sim/scenario';
import { World } from '../src/sim/world';

/** A duel, bots off, just after the Kingstone has fallen. */
function fallen(seed = 6) {
  const w = new World({ seed });
  w.ais = [];
  w.tick = starfallTick(w) - 10;
  w.run(20);
  return { w, site: crownSite(w)! };
}

/** A manned post of `owner`, a few tiles from the stone. */
function post(w: World, owner: number, site: { x: number; y: number }, type: 'lookout' | 'stockade' = 'lookout', dx = -4, dy = 0) {
  const b = w.addBuilding(type, owner, site.x + dx, site.y + dy, true);
  b.guarded = 1;
  return b;
}

describe('the Crown', () => {
  it('begins when the Kingstone falls, and not before', () => {
    const w = new World({ seed: 6 });
    expect(w.crown).toBeNull();
    const { w: after, site } = fallen();
    expect(after.crown?.siteId).toBe(site.id);
    expect(site.kind).toBe('kingstone');
    expect(after.crown!.progress).toEqual([0, 0]);
  });

  it('fills for the one folk with a manned post beside the stone, at a stockade-tended pace if there is one', () => {
    const { w, site } = fallen();
    w.run(secs(5));
    expect(w.crown!.keeper).toBe(-1); // unkept
    expect(w.crown!.progress[0]).toBe(0);
    post(w, 0, site);
    w.run(secs(10));
    expect(w.crown!.keeper).toBe(0);
    expect(w.crown!.progress[0]).toBe(10 * BALANCE.crownRate);
    expect(crownEta(w, 0)).toBe(Math.ceil((BALANCE.crownNeed - w.crown!.progress[0]) / BALANCE.crownRate));
    // A stockade beside it tends the stone: a faster Crown (one tick of the Crown, called directly, so the guards' walking doesn't matter).
    const st = post(w, 0, site, 'stockade', 3, 2);
    st.guarded = 3;
    w.tick = Math.ceil(w.tick / 10) * 10;
    const before = w.crown!.progress[0];
    updateCrown(w);
    expect(watchers(w)).toEqual([{ owner: 0, tended: true }]);
    expect(w.crown!.progress[0] - before).toBe(crownRate(true));
    expect(crownRate(true)).toBeGreaterThan(crownRate(false));
  });

  it('is frozen while two folk have posts there, and drains the one who loses the stone', () => {
    const { w, site } = fallen();
    const mine = post(w, 0, site);
    w.run(secs(20));
    const lit = w.crown!.progress[0];
    expect(lit).toBeGreaterThan(0);
    post(w, 1, site, 'lookout', 4, 2);
    w.run(secs(3)); // their spearman takes up his post
    const frozen = w.crown!.progress[0];
    w.run(secs(10));
    expect(w.crown!.keeper).toBe(CONTESTED);
    expect(w.crown!.progress[0]).toBe(frozen); // nobody gains, nobody loses
    expect(w.crown!.progress[1]).toBe(0);
    // Burn the first post: the rival keeps it, and the first Crown drains.
    raze(w, mine);
    w.run(secs(10));
    expect(w.crown!.keeper).toBe(1);
    expect(w.crown!.progress[1]).toBe(10 * BALANCE.crownRate);
    expect(w.crown!.progress[0]).toBe(Math.max(0, frozen - 10 * BALANCE.crownDecay));
    expect(crownPct(w, 1)).toBeGreaterThanOrEqual(0);
  });

  it('crowns the first folk to fill it, who then win the valley', () => {
    const { w, site } = fallen();
    post(w, 1, site);
    w.crown!.progress[1] = BALANCE.crownNeed - 3;
    w.crown!.progress[0] = BALANCE.crownNeed - 500;
    w.run(secs(3));
    w.run(20);
    expect(w.scenarioState.winner).toBe(1);
    const ev = w.drainEvents().find((e) => e.type === 'victory');
    expect(ev && ev.type === 'victory' && ev.crowned).toBe(true);
  });

  it('is not won on renown, however much there is, nor by waiting', () => {
    const { w } = fallen();
    w.players[0].renown = 99999;
    w.run(secs(30));
    expect(w.scenarioState.winner).toBe(-1);
  });

  it('is judged by the fuller Crown when the clock runs out, then by renown', () => {
    const { w } = fallen();
    w.crown!.progress = [100, 300];
    w.players[0].renown = 5000;
    w.tick = w.scenario.timeLimit!;
    evaluateScenario(w);
    expect(w.scenarioState.winner).toBe(1);
    const t = fallen().w;
    t.crown!.progress = [200, 200];
    t.players[0].renown = 50;
    t.players[1].renown = 70;
    t.tick = t.scenario.timeLimit!;
    evaluateScenario(t);
    expect(t.scenarioState.winner).toBe(1);
  });

  it('survives a save and load, and stays deterministic', () => {
    const { w, site } = fallen();
    post(w, 0, site);
    w.run(secs(15));
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(loaded.crown).toEqual(w.crown);
    expect(loaded.saga).toBe(w.saga);
    expect(hashWorld(loaded)).toBe(hashWorld(w));
    loaded.ais = [];
    w.run(secs(10));
    loaded.run(secs(10));
    expect(hashWorld(loaded)).toBe(hashWorld(w));
  });
});
