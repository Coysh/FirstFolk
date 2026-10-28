import { describe, expect, it } from 'vitest';
import { bestBridge, canBridge, spanAt, spanEnds, spanTiles, BRIDGE_MAX } from '../src/sim/bridges';
import { hashWorld } from '../src/sim/hash';
import { Terrain, valleyOf } from '../src/sim/mapgen';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { claimArea } from '../src/sim/territory';
import { World } from '../src/sim/world';
import { runSeconds, wagon } from './helpers';

const seedFor = (valley: string) => Array.from({ length: 200 }, (_, i) => i + 1).find((s) => valleyOf(s) === valley)!;

/** A world where the player has the rank, the goods and the land to bridge the water near the middle. */
function setup(valley: string) {
  const w = new World({ seed: seedFor(valley), scenario: 'peaceful' });
  w.players[0].rank = 1;
  wagon(w).stock.logs = 200;
  wagon(w).stock.stone = 100;
  const c = Math.floor(w.size / 2);
  claimArea(w, 0, c, c, 22);
  return { w, c };
}

describe('bridges', () => {
  it('find the narrowest span across water, and only where both banks are dry', () => {
    const { w, c } = setup('riverlands');
    let found = 0;
    for (let y = c - 12; y <= c + 12; y++)
      for (let x = c - 12; x <= c + 12; x++) {
        if (w.map.terrain[w.idx(x, y)] !== Terrain.Water) continue;
        const s = spanAt(w, x, y);
        if (!s) continue;
        found++;
        expect(s.len).toBeLessThanOrEqual(BRIDGE_MAX);
        for (const [tx, ty] of spanTiles(s)) expect(w.map.terrain[w.idx(tx, ty)]).toBe(Terrain.Water);
        for (const [ex, ey] of spanEnds(s)) expect(w.walkableGround(w.idx(ex, ey))).toBe(true);
      }
    expect(found).toBeGreaterThan(5);
  });

  it('need Hamlet rank, goods and your own border', () => {
    const { w, c } = setup('riverlands');
    let span = null as ReturnType<typeof spanAt>;
    for (let y = c - 12; y <= c + 12 && !span; y++) for (let x = c - 12; x <= c + 12 && !span; x++) if (w.map.terrain[w.idx(x, y)] === Terrain.Water) span = spanAt(w, x, y);
    expect(span).not.toBeNull();
    expect(canBridge(w, 0, span!).ok).toBe(true);
    w.players[0].rank = 0;
    expect(canBridge(w, 0, span!).reason).toMatch(/Hamlet/);
    w.players[0].rank = 1;
    wagon(w).stock.logs = 0;
    expect(canBridge(w, 0, span!).reason).toMatch(/Needs/);
    wagon(w).stock.logs = 200;
    expect(canBridge(w, 0, { ...span!, len: BRIDGE_MAX + 1 }).reason).toMatch(/Too wide/);
    // Not your land: the rival's side of the map.
    const far = spanAt(w, w.map.starts[1].x, w.map.starts[1].y);
    expect(far === null || !canBridge(w, 0, far).ok).toBe(true);
  });

  it('are paid for, laid in a few seconds, and then walkable', () => {
    const { w } = setup('longlake');
    const pick = bestBridge(w, 0);
    expect(pick).not.toBeNull();
    const s = pick!.span;
    const before = w.stored(0, 'logs');
    w.enqueue({ type: 'bridge', owner: 0, ...s });
    w.step();
    expect(w.stored(0, 'logs')).toBeLessThan(before);
    expect(w.bridges).toHaveLength(1);
    const [tx, ty] = spanTiles(s)[0];
    expect(w.walkable(w.idx(tx, ty))).toBe(false); // not yet
    // A second bridge over the same water is refused while this one is going up.
    expect(canBridge(w, 0, s).ok).toBe(false);
    runSeconds(w, 5 * s.len + 2);
    expect(w.bridges[0].done).toBe(true);
    for (const [x, y] of spanTiles(s)) expect(w.walkable(w.idx(x, y))).toBe(true);
  });

  it('open the Long Lake island, which no one could walk to before', () => {
    const { w } = setup('longlake');
    const star = w.sites.find((s) => s.kind === 'starstone')!;
    const home = w.entranceIdx(wagon(w));
    const target = w.idx(star.x, star.y);
    expect(w.pathfinder.find(home, target)).toBeNull();
    // Bridge the water between the shore and the island (one or two spans) until the prize is reachable.
    for (let n = 0; n < 4 && !w.pathfinder.find(home, target); n++) {
      const pick = bestBridge(w, 0);
      if (!pick) break;
      w.enqueue({ type: 'bridge', owner: 0, ...pick.span });
      w.step();
      runSeconds(w, 5 * pick.span.len + 2);
    }
    expect(w.bridges.length).toBeGreaterThan(0);
    expect(w.pathfinder.find(home, target)).not.toBeNull();
  });

  it('survive a save and load, and keep the sim deterministic', () => {
    const { w } = setup('riverlands');
    const pick = bestBridge(w, 0);
    expect(pick).not.toBeNull();
    w.enqueue({ type: 'bridge', owner: 0, ...pick!.span });
    runSeconds(w, 5 * pick!.span.len + 3);
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(loaded.bridges).toEqual(w.bridges);
    expect(loaded.deck).toEqual(w.deck);
    expect(hashWorld(loaded)).toBe(hashWorld(w));
  });
});
