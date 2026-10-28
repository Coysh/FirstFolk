import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { VALLEY_IDS, generateMap, isWalkableTerrain } from '../src/sim/mapgen';
import { addFavour, caravanProblem, sendCaravan, steadingsOf, suggestLoad } from '../src/sim/steadings';
import { STEADING_CHAR } from '../src/sim/steadingDefs';
import { hashWorld } from '../src/sim/hash';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { World } from '../src/sim/world';
import { wagon } from './helpers';

const duel = (seed = 7) => {
  const w = new World({ seed });
  w.ais = [];
  return w;
};

describe('steadings', () => {
  it('every valley has four, as two mirrored pairs on land the starts can walk to', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = generateMap(seed);
      const st = m.sites.filter((s) => s.kind === 'steading');
      expect(st.length, `seed ${seed}`).toBe(4);
      seen.add(m.valley);
      const N = m.size;
      for (const s of st) {
        expect(isWalkableTerrain(m.terrain[s.y * N + s.x])).toBe(true);
        expect(STEADING_CHAR[s.char!]).toBeDefined();
      }
      // Each pair: the same people, and (nearly) point-mirrored.
      const pairs = [st.filter((s) => s.char === st[0].char), st.filter((s) => s.char !== st[0].char)];
      for (const p of pairs) {
        expect(p.length).toBe(2);
        expect(Math.abs(p[0].x + p[1].x - N)).toBeLessThanOrEqual(8);
        expect(Math.abs(p[0].y + p[1].y - N)).toBeLessThanOrEqual(8);
      }
    }
    expect(seen.size).toBe(VALLEY_IDS.length);
  });

  it('are seen from the first morning, and a cart can reach each from both halls', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const w = duel(seed);
      wagon(w).stock.logs = 40;
      for (const s of steadingsOf(w)) {
        expect(s.revealed & 1).toBe(1);
        expect(caravanProblem(w, 0, s.id, 'logs', 5), `seed ${seed} ${s.st!.name}`).toBe('');
      }
    }
  });

  it('post a Want that anyone can win, and the first to deliver wins the favour', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    w.tick = s.st!.nextWantAt;
    w.run(20);
    const want = s.st!.want!;
    expect(want).not.toBeNull();
    // Give the player the goods and send a cart.
    const hall = wagon(w);
    if (want.kind === 'guard') {
      want.kind = 'goods';
      want.n = 10;
    }
    hall.stock[want.good] = 200;
    sendCaravan(w, 0, s.id, want.good, want.n);
    expect(w.caravans.length).toBe(1);
    expect(hall.stock[want.good]).toBe(200 - want.n);
    w.run(secs(120));
    expect(w.caravans.length).toBe(0);
    expect(s.st!.won[0]).toBe(1);
    expect(s.st!.favour[0]).toBeGreaterThan(BALANCE.wantWin - 10); // a little fades
    expect(w.players[0].caravanned).toBe(want.n);
  });

  it('stand with whoever has the favour and a clear lead, and keep them with a looser grip', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    addFavour(w, s, 0, 49);
    expect(s.st!.ally).toBe(-1);
    addFavour(w, s, 0, 2);
    expect(s.st!.ally).toBe(0);
    // The rival closing in does not unseat them until the lead is nearly gone.
    addFavour(w, s, 1, 40);
    expect(s.st!.ally).toBe(0);
    addFavour(w, s, 1, 10);
    expect(s.st!.ally).toBe(-1);
  });

  it('send their gift to the folk they stand with, and push that folk’s border', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    const before = w.stored(0, STEADING_CHAR[s.st!.char].gift);
    addFavour(w, s, 0, 60);
    expect(w.territory[w.idx(s.x, s.y)]).not.toBe(1);
    w.run(BALANCE.giftEvery + 20);
    expect(w.stored(0, STEADING_CHAR[s.st!.char].gift)).toBeGreaterThan(before);
    w.run(secs(10));
    expect(w.territory[w.idx(s.x, s.y)]).toBe(0);
  });

  it('refuse a cart with no goods, no free cart, or no steading', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    wagon(w).stock.fish = 0;
    expect(caravanProblem(w, 0, s.id, 'fish', 5)).toMatch(/No fish/);
    expect(caravanProblem(w, 0, 99999, 'logs', 5)).toMatch(/No steading/);
    wagon(w).stock.logs = 200;
    sendCaravan(w, 0, s.id, 'logs', 5);
    sendCaravan(w, 0, s.id, 'logs', 5);
    expect(caravanProblem(w, 0, s.id, 'logs', 5)).toMatch(/all on the road/);
    expect(suggestLoad(w, 0, s)).not.toBeNull();
  });

  it('save and load with carts on the road, and stay deterministic', () => {
    const w = duel();
    const s = steadingsOf(w)[0];
    wagon(w).stock.logs = 100;
    sendCaravan(w, 0, s.id, 'logs', 20);
    w.run(secs(8));
    expect(w.caravans.length).toBe(1);
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(loaded.caravans).toEqual(w.caravans);
    expect(steadingsOf(loaded).map((x) => x.st)).toEqual(steadingsOf(w).map((x) => x.st));
    expect(hashWorld(loaded)).toBe(hashWorld(w));
    loaded.ais = [];
    w.run(secs(60));
    loaded.run(secs(60));
    expect(hashWorld(loaded)).toBe(hashWorld(w));
  });
});
