import { describe, expect, it } from 'vitest';
import { LANDFALL, SANDBOX, objectiveStatus, objectives, type Scenario } from '../src/sim/scenario';
import { World } from '../src/sim/world';
import { place, runSeconds } from './helpers';

describe('scenario system', () => {
  it('objectives latch once completed', () => {
    const w = new World({ seed: 1, scenario: LANDFALL });
    place(w, 'woodcutter');
    runSeconds(w, 30);
    const done = objectiveStatus(w, 0).find((o) => o.id === 'build-woodcutter-1')!;
    expect(done.done).toBe(true);
    // Demolish it: the objective stays done.
    const wc = [...w.buildings.values()].find((b) => b.type === 'woodcutter')!;
    w.enqueue({ type: 'demolish', owner: 0, id: wc.id });
    runSeconds(w, 2);
    expect(objectiveStatus(w, 0).find((o) => o.id === 'build-woodcutter-1')!.done).toBe(true);
  });

  it('declares a winner when all objectives are met', () => {
    const quick: Scenario = { id: 'quick', name: 'Quick', description: '', victory: 'all', objectives: [objectives.population(4)] };
    const w = new World({ seed: 1, scenario: quick });
    runSeconds(w, 2);
    expect(w.scenarioState.winner).toBe(0);
    expect(w.drainEvents().some((e) => e.type === 'victory')).toBe(true);
  });

  it('sandbox never ends the game', () => {
    const w = new World({ seed: 1, scenario: SANDBOX });
    runSeconds(w, 30);
    expect(w.scenarioState.winner).toBe(-1);
  });
});
