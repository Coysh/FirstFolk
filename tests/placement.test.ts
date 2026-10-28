import { describe, expect, it } from 'vitest';
import { canPlace } from '../src/sim/commands';
import { Terrain } from '../src/sim/mapgen';
import { newWorld, wagon } from './helpers';

describe('placement', () => {
  it('allows building in the start clearing', () => {
    const w = newWorld();
    const wg = wagon(w);
    expect(canPlace(w, 0, 'hut', wg.x + 3, wg.y - 2).ok).toBe(true);
  });

  it('rejects overlapping buildings and blocked entrances', () => {
    const w = newWorld();
    const wg = wagon(w);
    expect(canPlace(w, 0, 'hut', wg.x, wg.y).reason).toBe('Occupied');
    // footprint covering the wagon entrance
    expect(canPlace(w, 0, 'hut', wg.x - 1, wg.y + 2).ok).toBe(false);
  });

  it('rejects water and far-away tiles', () => {
    const w = newWorld();
    const N = w.size;
    const waterIdx = w.map.terrain.findIndex((t) => t === Terrain.Water);
    expect(canPlace(w, 0, 'hut', waterIdx % N, Math.floor(waterIdx / N)).ok).toBe(false);
    const wg = wagon(w);
    expect(canPlace(w, 0, 'hut', wg.x + 40, wg.y).ok).toBe(false);
  });

  it('cannot place the wagon type', () => {
    const w = newWorld();
    const wg = wagon(w);
    expect(canPlace(w, 0, 'wagon', wg.x + 3, wg.y - 2).ok).toBe(false);
  });

  it('placing clears trees under the footprint', () => {
    const w = newWorld();
    const tree = [...w.nodes.values()].find((n) => n.kind === 'tree' && canPlace(w, 0, 'hut', n.x, n.y).ok)!;
    expect(tree).toBeDefined();
    w.enqueue({ type: 'place', owner: 0, building: 'hut', x: tree.x, y: tree.y });
    w.step();
    expect(w.nodes.has(tree.id)).toBe(false);
  });
});

describe('placement connectivity', () => {
  it('refuses a building that would wall in an entrance', () => {
    const w = newWorld();
    const wg = wagon(w);
    // Recreate the pocket found by the playtest: huts either side of a gap right above the wagon.
    const place = (x: number, y: number) => {
      w.enqueue({ type: 'place', owner: 0, building: 'hut', x, y });
      w.step();
    };
    place(wg.x - 2, wg.y - 2);
    place(wg.x + 2, wg.y - 2);
    expect(canPlace(w, 0, 'hut', wg.x, wg.y - 3).ok).toBe(false);
    expect(canPlace(w, 0, 'hut', wg.x, wg.y - 3).reason).toBe('Would cut off a path');
  });
});
