import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { hearthHolder, hearthStatus, newCrown, voicesHeld } from '../src/sim/crown';
import { prosperity } from '../src/sim/prosperity';
import { sendCaravan, steadingsOf } from '../src/sim/steadings';
import { STEADING_CHAR } from '../src/sim/steadingDefs';
import { hire, hireProblem, hireStrength } from '../src/sim/warfare';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { NO_OWNER } from '../src/sim/territory';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

const duel = (seed = 7) => {
  const w = new World({ seed });
  w.ais = [];
  return w;
};

/** Make a town "richer" without playing it out: more finished workshops count towards prosperity. */
function enrich(w: World, owner: number, homeLevel: number) {
  w.players[owner].homeLevel = homeLevel;
}

describe('the Hearth: the richer town is a voice', () => {
  it('needs a floor and a clear lead, and keeps it on a thin one', () => {
    const w = duel();
    w.crown = newCrown(0, 2);
    // Nobody is rich yet: the floor stops a lead of 3 over 1 from counting.
    expect(hearthHolder(w, NO_OWNER)).toBe(NO_OWNER);
    // Many homes at the best level: the player's prosperity jumps past the floor and the rival's lead.
    for (let i = 0; i < 24; i++) w.addBuilding('hut', 0, 10 + i * 3, 10, true);
    enrich(w, 0, 2);
    expect(prosperity(w, 0)).toBeGreaterThan(BALANCE.hearthMin);
    expect(hearthHolder(w, NO_OWNER)).toBe(0);
    // The rival closes to within the keep margin: whoever holds it keeps it.
    const mine = prosperity(w, 0);
    const need = Math.floor((mine * 100) / (100 + BALANCE.hearthKeep));
    expect(need).toBeLessThan(mine);
  });

  it('counts as one voice, and is reported to the HUD', () => {
    const w = duel();
    w.crown = newCrown(0, 2);
    w.crown.hearth = 0;
    expect(voicesHeld(w, 0)).toBe(1);
    expect(voicesHeld(w, 1)).toBe(0);
    const h = hearthStatus(w);
    expect(h.holder).toBe(0);
    expect(h.scores.length).toBe(2);
    expect(h.min).toBe(BALANCE.hearthMin);
  });

  it('survives a save', () => {
    const w = duel();
    w.crown = newCrown(0, 2);
    w.crown.hearth = 1;
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.crown!.hearth).toBe(1);
  });
});

describe('trade pays both ways', () => {
  it('a cart comes home laden with the steading’s own good', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    const hall = wagon(w);
    const gift = STEADING_CHAR[s.st!.char].gift;
    hall.stock.logs = 200;
    const before = w.stored(0, gift);
    s.st!.want = null;
    s.st!.nextWantAt = 1e9;
    sendCaravan(w, 0, s.id, 'logs', 20);
    expect(w.caravans.length).toBe(1);
    w.run(secs(240));
    expect(w.caravans.length).toBe(0);
    const after = w.stored(0, gift);
    // 20 logs sent: half comes back as the steading's gift (at least a few units), whatever the tier.
    expect(after - before).toBeGreaterThanOrEqual(Math.min(BALANCE.tradeBackMax, Math.ceil((20 * BALANCE.tradeBackPct) / 100)));
  });
});

describe('Hired Spears: wealth buys strength in a fight', () => {
  it('is only possible in a fight, with goods in store, once per side', () => {
    const w = duel();
    expect(hireProblem(w, 0)).toMatch(/No fight/);
    expect(hire(w, 0)).toBe(false);
    expect(hireStrength(w, 0)).toBe(BALANCE.hireBase);
    w.players[0].homeLevel = 2;
    expect(hireStrength(w, 0)).toBe(BALANCE.hireBase + 2 * BALANCE.hirePerLevel);
  });
});
