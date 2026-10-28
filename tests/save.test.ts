import { describe, expect, it } from 'vitest';
import { OpeningBot } from '../src/sim/ai/openingBot';
import { secs } from '../src/sim/balance';
import { hashWorld } from '../src/sim/hash';
import { SAVE_VERSION, deserializeWorld, serializeWorld } from '../src/sim/save';
import { World } from '../src/sim/world';

function played(seed: number, minutes: number, difficulty: 'relaxed' | 'normal' | 'hard' = 'normal') {
  const w = new World({ seed, difficulty });
  const bot = new OpeningBot();
  for (let i = 0; i < secs(minutes * 60); i++) {
    bot.update(w);
    w.step();
  }
  return w;
}

describe('save / load', () => {
  it('a restored game is identical and continues identically', () => {
    const a = played(21, 4);
    const data = JSON.parse(JSON.stringify(serializeWorld(a)));
    const b = deserializeWorld(data);
    expect(hashWorld(b)).toBe(hashWorld(a));
    a.run(secs(120));
    b.run(secs(120));
    expect(hashWorld(b)).toBe(hashWorld(a));
    expect(b.population(0)).toBe(a.population(0));
  });

  it('keeps difficulty, scenario and progress', () => {
    const a = played(22, 3, 'hard');
    const b = deserializeWorld(serializeWorld(a));
    expect(b.difficulty).toBe('hard');
    expect(b.scenario.id).toBe('landfall');
    expect(b.scenarioState).toEqual(a.scenarioState);
  });

  it('refuses incompatible versions', () => {
    const data = serializeWorld(new World({ scenario: 'peaceful', seed: 1 }));
    expect(() => deserializeWorld({ ...data, version: SAVE_VERSION + 1 })).toThrow(/not compatible/);
  });

  it('save data is compact enough for localStorage', () => {
    const json = JSON.stringify(serializeWorld(played(23, 6)));
    expect(json.length).toBeLessThan(1_500_000);
  });
});
