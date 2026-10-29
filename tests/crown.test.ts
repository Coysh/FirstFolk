import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { CONTESTED, crownEta, crownPace, crownSite, updateCrown, voicesHeld } from '../src/sim/crown';
import { starfallTick } from '../src/sim/happenings';
import { hashWorld } from '../src/sim/hash';
import { raze } from '../src/sim/warfare';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { evaluateScenario } from '../src/sim/scenario';
import { steadingsOf } from '../src/sim/steadings';
import { World } from '../src/sim/world';

/** A duel with the bots off, the Crown open, and nobody holding anything. */
function open(seed = 6) {
  const w = new World({ seed });
  w.ais = [];
  w.tick = BALANCE.crownOpens - 10;
  w.run(20);
  return w;
}

/** A duel just after the Kingstone has fallen. */
function fallen(seed = 6) {
  const w = new World({ seed });
  w.ais = [];
  w.tick = starfallTick(w) - 10;
  w.run(20);
  return { w, site: crownSite(w)! };
}

/** A steading sworn to `owner` (favour is the cause, allegiance the effect, so set both the way the sim would). */
function swear(w: World, index: number, owner: number) {
  const s = steadingsOf(w)[index];
  s.st!.favour[owner] = 90;
  s.st!.ally = owner;
  return s;
}

/** A manned post of `owner`, a few tiles from the stone. */
function post(w: World, owner: number, site: { x: number; y: number }, type: 'lookout' | 'stockade' = 'lookout', dx = -4, dy = 0) {
  const b = w.addBuilding(type, owner, site.x + dx, site.y + dy, true);
  b.guarded = 1;
  return b;
}

describe('the Crown, filled by the voices of the valley', () => {
  it('opens before the star falls, and the Kingstone joins it later', () => {
    const w = new World({ seed: 6 });
    expect(w.crown).toBeNull();
    const o = open();
    expect(o.crown).not.toBeNull();
    expect(crownSite(o)).toBeUndefined();
    const { w: after, site } = fallen();
    expect(after.crown?.siteId).toBe(site.id);
    expect(site.kind).toBe('kingstone');
    expect(after.crown!.progress).toEqual([0, 0]);
  });

  it('fills for whoever holds more voices, a point a second for each voice of lead', () => {
    const w = open();
    w.run(secs(5));
    expect(w.crown!.progress).toEqual([0, 0]); // nobody holds anything
    swear(w, 0, 0);
    w.run(secs(10));
    expect(voicesHeld(w, 0)).toBe(1);
    expect(w.crown!.progress[0]).toBe(10 * BALANCE.crownRate);
    expect(crownEta(w, 0)).toBe(Math.ceil((BALANCE.crownNeed - w.crown!.progress[0]) / BALANCE.crownRate));
    swear(w, 1, 0);
    const before = w.crown!.progress[0];
    w.run(secs(10));
    expect(w.crown!.progress[0] - before).toBe(10 * 2 * BALANCE.crownRate);
    // A third steading adds nothing: a lead is capped.
    swear(w, 2, 0);
    expect(crownPace(w, 0)).toBe(BALANCE.crownDiffCap * BALANCE.crownRate);
  });

  it('is frozen when the voices are level, and drains the side that is behind', () => {
    const w = open();
    swear(w, 0, 0);
    w.run(secs(20));
    const lit = w.crown!.progress[0];
    expect(lit).toBeGreaterThan(0);
    swear(w, 1, 1);
    w.run(secs(10));
    expect(w.crown!.progress[0]).toBe(lit); // level: nobody gains, nobody loses
    expect(w.crown!.progress[1]).toBe(0);
    swear(w, 2, 1);
    w.run(secs(10));
    expect(w.crown!.progress[1]).toBe(10 * BALANCE.crownRate);
    expect(w.crown!.progress[0]).toBe(Math.max(0, lit - 10 * BALANCE.crownRate * BALANCE.crownDrain));
  });

  it('counts the Kingstone for two voices to whoever keeps it alone, and nobody’s when it is contested', () => {
    const { w, site } = fallen();
    w.tick = BALANCE.crownOpens;
    expect(w.crown!.keeper).toBe(-1);
    const mine = post(w, 0, site);
    w.run(secs(10));
    expect(w.crown!.keeper).toBe(0);
    expect(voicesHeld(w, 0)).toBe(BALANCE.kingstoneVoices);
    post(w, 1, site, 'lookout', 4, 2);
    w.run(secs(3)); // their spearman takes up his post
    w.run(secs(3));
    expect(w.crown!.keeper).toBe(CONTESTED);
    expect(voicesHeld(w, 0)).toBe(0);
    expect(voicesHeld(w, 1)).toBe(0);
    raze(w, mine);
    w.run(secs(10));
    expect(w.crown!.keeper).toBe(1);
    expect(voicesHeld(w, 1)).toBe(BALANCE.kingstoneVoices);
  });

  it('a manned Stockade beside the stone tends it: one more point a second', () => {
    const { w, site } = fallen();
    post(w, 0, site);
    w.run(secs(5));
    const plain = crownPace(w, 0);
    const st = post(w, 0, site, 'stockade', 3, 2);
    st.guarded = 3;
    w.tick = Math.ceil(w.tick / 10) * 10;
    updateCrown(w);
    expect(crownPace(w, 0)).toBe(plain + BALANCE.crownTended);
  });

  it('crowns the first folk to fill it, who then win the valley', () => {
    const w = open();
    swear(w, 0, 1);
    w.crown!.progress[1] = BALANCE.crownNeed - 3;
    w.crown!.progress[0] = BALANCE.crownNeed - 500;
    w.run(secs(3));
    w.run(20);
    expect(w.scenarioState.winner).toBe(1);
    const ev = w.drainEvents().find((e) => e.type === 'victory');
    expect(ev && ev.type === 'victory' && ev.crowned).toBe(true);
  });

  it('cannot be filled before it opens', () => {
    const w = new World({ seed: 6 });
    w.ais = [];
    swear(w, 0, 0);
    w.run(secs(60));
    expect(w.crown?.progress ?? [0, 0]).toEqual([0, 0]);
  });

  it('is not won on renown, however much there is, nor by waiting', () => {
    const w = open();
    w.players[0].renown = 99999;
    w.run(secs(30));
    expect(w.scenarioState.winner).toBe(-1);
  });

  it('is judged by the fuller Crown when the clock runs out, then by renown', () => {
    const w = open();
    w.crown!.progress = [100, 300];
    w.players[0].renown = 5000;
    w.tick = w.scenario.timeLimit!;
    evaluateScenario(w);
    expect(w.scenarioState.winner).toBe(1);
    const t = open();
    t.crown!.progress = [200, 200];
    t.players[0].renown = 50;
    t.players[1].renown = 70;
    t.tick = t.scenario.timeLimit!;
    evaluateScenario(t);
    expect(t.scenarioState.winner).toBe(1);
  });

  it('survives a save and load, and stays deterministic', () => {
    const w = open();
    swear(w, 0, 0);
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
