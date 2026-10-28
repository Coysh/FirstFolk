import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { OpeningBot } from '../src/sim/ai/openingBot';
import { secs } from '../src/sim/balance';
import { newWorld, place, runSeconds, wagon } from './helpers';
import { World } from '../src/sim/world';

describe('core loop', () => {
  it('starts with a family of four and a stocked wagon', () => {
    const w = newWorld();
    expect(w.population(0)).toBe(4);
    expect([...w.settlers.values()].filter((s) => s.child)).toHaveLength(2);
    expect(wagon(w).stock.logs).toBeGreaterThan(0);
  });

  it('builds a woodcutter from wagon stock, then logs flow back to the wagon', () => {
    const w = newWorld();
    const wc = place(w, 'woodcutter');
    runSeconds(w, 30);
    expect(wc.done).toBe(true);
    expect(wc.delivered.logs).toBe(3);
    const afterBuild = wagon(w).stock.logs;
    runSeconds(w, 60);
    expect(w.players[0].produced.logs).toBeGreaterThanOrEqual(4);
    expect(wagon(w).stock.logs).toBeGreaterThan(afterBuild);
  });

  it('settlers visibly carry goods (porters and workers)', () => {
    const w = newWorld();
    place(w, 'woodcutter');
    let sawCarry = false;
    for (let i = 0; i < secs(60); i++) {
      w.step();
      if ([...w.settlers.values()].some((s) => s.carry)) sawCarry = true;
    }
    expect(sawCarry).toBe(true);
  });

  it('foresters plant saplings that grow into trees', () => {
    const w = newWorld();
    const before = [...w.nodes.values()].filter((n) => n.kind === 'tree').length;
    place(w, 'forester');
    runSeconds(w, 60);
    const saplings = [...w.nodes.values()].filter((n) => n.kind === 'tree' && n.growth > 0);
    expect(saplings.length).toBeGreaterThan(0);
    runSeconds(w, 90);
    expect([...w.nodes.values()].filter((n) => n.kind === 'tree').length).toBeGreaterThan(before);
  });

  it('settlers eat berries and go hungry without them', () => {
    const w = newWorld();
    const wg = wagon(w);
    const b0 = wg.stock.berries;
    runSeconds(w, 61);
    expect(wg.stock.berries).toBeLessThan(b0);
    wg.stock.berries = 0;
    runSeconds(w, 30);
    expect(w.players[0].hungry).toBe(true);
    wg.stock.berries = 10;
    runSeconds(w, 30);
    expect(w.players[0].hungry).toBe(false);
  });

  it('an empty hut attracts a newcomer family who walk in', () => {
    const w = newWorld();
    wagon(w).stock.logs += 10;
    wagon(w).stock.berries += 20;
    const hut = place(w, 'hut');
    runSeconds(w, 50);
    expect(hut.done).toBe(true);
    runSeconds(w, 10);
    expect(hut.familyId).not.toBe(0);
    expect(w.families.size).toBe(2);
    expect(w.population(0)).toBeGreaterThan(4);
    const newcomers = [...w.settlers.values()].filter((s) => s.familyId === hut.familyId);
    runSeconds(w, 30);
    const e = w.entrance(hut);
    for (const s of newcomers) expect(Math.max(Math.abs(s.x - e.x), Math.abs(s.y - e.y))).toBeLessThanOrEqual(4);
  });

  it('demolishing a site refunds delivered materials', () => {
    const w = newWorld();
    const total0 = wagon(w).stock.logs;
    const site = place(w, 'woodcutter');
    runSeconds(w, 12);
    w.enqueue({ type: 'demolish', owner: 0, id: site.id });
    runSeconds(w, 1);
    expect(w.buildings.has(site.id)).toBe(false);
    runSeconds(w, 20);
    const carrying = [...w.settlers.values()].filter((s) => s.carry === 'logs').length;
    expect(wagon(w).stock.logs + carrying).toBe(total0);
    expect([...w.settlers.values()].every((s) => s.job.kind !== 'build')).toBe(true);
  });
});

describe('determinism', () => {
  function play(seed: number, minutes: number) {
    const w = new World({ seed });
    const bot = new OpeningBot();
    for (let i = 0; i < secs(minutes * 60); i++) {
      bot.update(w);
      w.step();
    }
    return w;
  }

  it('same seed and commands give identical state', () => {
    expect(hashWorld(play(5, 3))).toBe(hashWorld(play(5, 3)));
  });

  it('different seeds diverge', () => {
    expect(hashWorld(play(5, 1))).not.toBe(hashWorld(play(6, 1)));
  });

  it('replaying the command log reproduces the game', () => {
    const a = play(9, 3);
    const b = new World({ seed: 9 });
    const log = [...a.commandLog];
    while (b.tick < a.tick) {
      while (log.length && log[0].tick === b.tick) b.enqueue(log.shift()!.cmd);
      b.step();
    }
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});
