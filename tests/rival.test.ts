import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { claimArea } from '../src/sim/territory';
import { World } from '../src/sim/world';

describe('the rival', () => {
  it('starts across the valley and builds through Commands', () => {
    const w = new World({ seed: 2 });
    expect(w.players[1]).toBeDefined();
    w.run(300);
    const rivalBuildings = [...w.buildings.values()].filter((b) => b.owner === 1 && b.type !== 'wagon');
    expect(rivalBuildings.length).toBeGreaterThan(0);
    expect(w.commandLog.some((c) => c.cmd.type === 'place' && c.cmd.owner === 1)).toBe(true);
  });

  it('claimed land is final: nobody can take another settlement’s tiles', () => {
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

  it('the peaceful scenario has no rival', () => {
    expect(new World({ seed: 2, scenario: 'peaceful' }).players[1]).toBeUndefined();
  });
});
