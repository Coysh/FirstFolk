import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { claimArea } from '../src/sim/territory';
import { World } from '../src/sim/world';
import { styleOf } from '../src/sim/ai/styles';
import { deserializeWorld, serializeWorld } from '../src/sim/save';

describe('the rival', () => {
  it('starts across the valley and builds through Commands', () => {
    const w = new World({ seed: 2 });
    expect(w.players[1]).toBeDefined();
    w.run(300);
    const rivalBuildings = [...w.buildings.values()].filter((b) => b.owner === 1 && b.type !== 'wagon');
    expect(rivalBuildings.length).toBeGreaterThan(0);
    expect(w.commandLog.some((c) => c.cmd.type === 'place' && c.cmd.owner === 1)).toBe(true);
  });

  it('a grant of land never takes another settlement’s tiles (only influence can)', () => {
    const w = new World({ seed: 2 });
    const wagon0 = [...w.buildings.values()].find((b) => b.owner === 0 && b.type === 'wagon')!;
    claimArea(w, 1, wagon0.x, wagon0.y, 6);
    expect(w.territory[w.idx(wagon0.x, wagon0.y)]).toBe(0);
  });

  it('the race is deterministic', () => {
    const run = () => {
      const w = new World({ seed: 5 });
      w.run(3000);
      return hashWorld(w);
    };
    expect(run()).toBe(run());
  });

  it('the rival has a personality that follows its origin, and keeps it through a save', () => {
    expect(styleOf('wayfarers')).toBe('expander');
    expect(styleOf('hillclan')).toBe('mason');
    expect(styleOf('')).toBe('balanced');
    const w = new World({ seed: 4, origin: 'woodfolk' });
    expect(w.players[1].style).toBe(styleOf(w.players[1].origin));
    const forced = new World({ seed: 4, rivalStyle: 'expander' });
    expect(forced.players[1].style).toBe('expander');
    forced.run(600);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(forced))));
    expect(back.players[1].style).toBe('expander');
    forced.run(600);
    back.run(600);
    expect(hashWorld(back)).toBe(hashWorld(forced));
  });

  it('the peaceful scenario has no rival', () => {
    expect(new World({ seed: 2, scenario: 'peaceful' }).players[1]).toBeUndefined();
  });
});
