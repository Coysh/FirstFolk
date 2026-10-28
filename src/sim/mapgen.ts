import { BALANCE } from './balance';
import type { DiscoveryKind, NodeKind } from './defs';
import { fbm, smoothstep } from './noise';
import { Rng } from './rng';

export const Terrain = {
  Water: 0,
  Sand: 1,
  Grass: 2,
  Meadow: 3,
  Forest: 4,
  Rock: 5,
  Mountain: 6,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

/** World units per integer height step. */
export const HEIGHT_STEP = 0.05;

export interface MapData {
  size: number;
  /** Corner heights, (size+1)² integers in HEIGHT_STEP units. */
  heights: Int16Array;
  /** Per-tile terrain ids. */
  terrain: Uint8Array;
  waterLevel: number;
  starts: { x: number; y: number }[];
  /** `max` overrides the default yield (prize sites). */
  nodes: { kind: NodeKind; x: number; y: number; max?: number }[];
  sites: { kind: DiscoveryKind; x: number; y: number }[];
}

/**
 * Discoveries per start, by distance: one just past the first border to pull the player
 * outwards, then a trail of richer prizes across the valley. Mirrored for the rival start.
 */
const SITE_RINGS: { kinds: DiscoveryKind[]; d: number }[] = [
  // Each ring draws its kind from a small pool, so every valley holds different surprises
  // (both starts always get the same draw: the race stays fair).
  { kinds: ['cart', 'cart', 'hoard'], d: 15 },
  { kinds: ['ruins', 'barrow', 'hermit'], d: 20 },
  { kinds: ['grove', 'shrine'], d: 23 },
  { kinds: ['wanderers', 'hermit', 'hoard'], d: 28 },
  { kinds: ['oakwood', 'spring'], d: 31 },
  { kinds: ['stones', 'shrine'], d: 36 },
  { kinds: ['outcrop', 'oakwood'], d: 40 },
  { kinds: ['ruins', 'barrow', 'hoard'], d: 46 },
];
/** Prize sites paint their own terrain and resources. */
const PRIZE: Partial<Record<DiscoveryKind, { terrain: TerrainId; node: NodeKind; r: number; density: number; max: number }>> = {
  grove: { terrain: 3, node: 'bush', r: 3.2, density: 0.55, max: 6 },
  oakwood: { terrain: 4, node: 'tree', r: 3.6, density: 0.75, max: 3 },
  outcrop: { terrain: 5, node: 'rock', r: 2.6, density: 0.6, max: 30 },
};

export const isWalkableTerrain = (t: number) => t !== Terrain.Water && t !== Terrain.Mountain;

/** Offsets of the guaranteed resource clusters around a start (mirrored for the rival). */
const CLUSTERS = {
  forest: { dx: 9, dy: -6, r: 4.2 },
  rock: { dx: -8, dy: 7, r: 2.8 },
  meadow: { dx: 5, dy: 7, r: 3 },
};
const START_CLEAR = 4.5;

export function generateMap(seed: number, size = BALANCE.mapSize): MapData {
  const N = size;
  const C = N + 1;
  const water = 1.0;
  const hf = new Float64Array(C * C);

  const sx = Math.round(N * 0.28);
  const sy = Math.round(N * 0.55);
  const starts = [
    { x: sx, y: sy },
    { x: N - sx, y: N - sy },
  ];
  const fords = [Math.round(N * 0.3), Math.round(N * 0.72)];
  const lakes = [
    { x: N * 0.17, y: N * 0.28 },
    { x: N * 0.83, y: N * 0.72 },
  ];

  for (let y = 0; y <= N; y++) {
    const riverX = N / 2 + (fbm(y * 0.025, 3.7, seed + 19, 2) - 0.5) * N * 0.3;
    for (let x = 0; x <= N; x++) {
      const base = fbm(x * 0.04, y * 0.04, seed, 4);
      const hills = fbm(x * 0.09, y * 0.09, seed + 7, 3);
      const dx = (x - N / 2) / (N / 2);
      const dy = (y - N / 2) / (N / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      let h = 1.4 + base * 1.5 + Math.max(0, hills - 0.55) * 4 + smoothstep(0.72, 1.05, d) * 4.5;

      // A meandering river splits the valley; two shallow fords cross it.
      const rt = 1 - smoothstep(1.5, 5, Math.abs(x - riverX));
      if (rt > 0) {
        let fordT = 0;
        for (const fy of fords) fordT = Math.max(fordT, 1 - smoothstep(1.5, 3.5, Math.abs(y - fy)));
        const bed = water - 0.6 + (0.72 * fordT);
        h = h + (bed - h) * rt;
      }
      for (const lake of lakes) {
        const ld = Math.sqrt((x - lake.x) ** 2 + (y - lake.y) ** 2);
        const lt = 1 - smoothstep(3, 6.5, ld);
        if (lt > 0) h = h + (water - 0.5 - h) * lt;
      }
      hf[y * C + x] = h;
    }
  }

  // Flatten a building-friendly clearing around each start.
  for (const s of starts) {
    let sum = 0;
    let n = 0;
    for (let y = s.y - 6; y <= s.y + 6; y++)
      for (let x = s.x - 6; x <= s.x + 6; x++) {
        sum += hf[y * C + x];
        n++;
      }
    const target = Math.max(water + 0.5, Math.min(2.6, sum / n));
    for (let y = s.y - 9; y <= s.y + 9; y++)
      for (let x = s.x - 9; x <= s.x + 9; x++) {
        const t = 1 - smoothstep(4, 8, Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2));
        const i = y * C + x;
        hf[i] = hf[i] + (target - hf[i]) * t;
      }
  }

  const heights = new Int16Array(C * C);
  for (let i = 0; i < heights.length; i++) heights[i] = Math.round(hf[i] / HEIGHT_STEP);
  const hq = (x: number, y: number) => heights[y * C + x] * HEIGHT_STEP;

  const terrain = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = hq(x, y);
      const b = hq(x + 1, y);
      const c = hq(x, y + 1);
      const e = hq(x + 1, y + 1);
      const min = Math.min(a, b, c, e);
      const max = Math.max(a, b, c, e);
      const avg = (a + b + c + e) / 4;
      let t: TerrainId;
      if (avg < water) t = Terrain.Water;
      else if (avg < water + 0.18) t = Terrain.Sand;
      else if (max - min > 0.85 || avg > 4.3) t = Terrain.Mountain;
      else if (avg > 3.1 || fbm(x * 0.11, y * 0.11, seed + 53, 2) > 0.74) t = Terrain.Rock;
      else {
        const moist = fbm(x * 0.07, y * 0.07, seed + 31, 3);
        t = moist > 0.57 ? Terrain.Forest : moist < 0.4 ? Terrain.Meadow : Terrain.Grass;
      }
      terrain[y * N + x] = t;
    }
  }

  const tileAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? terrain[y * N + x] : Terrain.Mountain);
  const paint = (cx: number, cy: number, r: number, t: TerrainId) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const cur = tileAt(x, y);
        if (cur === Terrain.Water || cur === Terrain.Mountain || cur === Terrain.Sand) continue;
        terrain[y * N + x] = t;
      }
  };

  // Guaranteed starting resources, mirrored for the rival start so the race is fair.
  starts.forEach((s, i) => {
    const m = i === 0 ? 1 : -1;
    paint(s.x + CLUSTERS.forest.dx * m, s.y + CLUSTERS.forest.dy * m, CLUSTERS.forest.r, Terrain.Forest);
    paint(s.x + CLUSTERS.rock.dx * m, s.y + CLUSTERS.rock.dy * m, CLUSTERS.rock.r, Terrain.Rock);
    paint(s.x + CLUSTERS.meadow.dx * m, s.y + CLUSTERS.meadow.dy * m, CLUSTERS.meadow.r, Terrain.Meadow);
    paint(s.x, s.y, START_CLEAR, Terrain.Grass);
  });

  const rng = new Rng(seed ^ 0x5eed);
  const sites = placeSites(N, starts, terrain, rng);
  for (const site of sites) {
    const p = PRIZE[site.kind];
    if (p) paint(site.x, site.y, p.r, p.terrain);
  }
  const prizeAt = (x: number, y: number) => {
    for (const site of sites) {
      const p = PRIZE[site.kind];
      if (p && (x - site.x) ** 2 + (y - site.y) ** 2 <= p.r * p.r) return p;
    }
    return undefined;
  };

  const inCluster = (x: number, y: number, key: keyof typeof CLUSTERS) =>
    starts.some((s, i) => {
      const m = i === 0 ? 1 : -1;
      const c = CLUSTERS[key];
      return (x - (s.x + c.dx * m)) ** 2 + (y - (s.y + c.dy * m)) ** 2 <= c.r * c.r;
    });

  const nodes: MapData['nodes'] = [];
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      if (starts.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 <= (START_CLEAR + 1) ** 2)) continue;
      const t = terrain[y * N + x];
      const roll = rng.float();
      if (sites.some((s) => s.x === x && s.y === y)) continue;
      const prize = prizeAt(x, y);
      if (prize && t === prize.terrain) {
        if (roll < prize.density) nodes.push({ kind: prize.node, x, y, max: prize.max });
        continue;
      }
      if (t === Terrain.Water) {
        // Fish shoals gather in the shallows, within reach of the bank.
        const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkableTerrain(terrain[(y + dy) * N + x + dx]));
        if (shore && roll < 0.14) nodes.push({ kind: 'fish', x, y });
        continue;
      }
      if (t === Terrain.Forest && roll < 0.7) nodes.push({ kind: 'tree', x, y });
      else if (t === Terrain.Grass && roll < 0.03) nodes.push({ kind: 'tree', x, y });
      else if (t === Terrain.Meadow && roll < (inCluster(x, y, 'meadow') ? 0.45 : 0.06)) nodes.push({ kind: 'bush', x, y });
      else if (t === Terrain.Rock && roll < (inCluster(x, y, 'rock') ? 0.55 : 0.28)) nodes.push({ kind: 'rock', x, y });
    }
  }

  return { size: N, heights, terrain, waterLevel: Math.round(water / HEIGHT_STEP), starts, nodes, sites };
}

function placeSites(N: number, starts: { x: number; y: number }[], terrain: Uint8Array, rng: Rng): MapData['sites'] {
  const sites: MapData['sites'] = [];
  const ok = (x: number, y: number) => {
    if (x < 5 || y < 5 || x >= N - 5 || y >= N - 5) return false;
    const t = terrain[y * N + x];
    if (t === Terrain.Water || t === Terrain.Mountain || t === Terrain.Sand) return false;
    // Keep clear of both starts and of other sites.
    if (starts.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 < 12 * 12)) return false;
    return !sites.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 < 9 * 9);
  };
  // Directions are integer unit-ish vectors (no trig in the sim): 16 compass points.
  const DIRS = [
    [100, 0], [92, 38], [71, 71], [38, 92], [0, 100], [-38, 92], [-71, 71], [-92, 38],
    [-100, 0], [-92, -38], [-71, -71], [-38, -92], [0, -100], [38, -92], [71, -71], [92, -38],
  ];
  const s0 = starts[0];
  for (const { kinds, d: dist } of SITE_RINGS) {
    const ring = { kind: kinds[rng.int(kinds.length)], d: dist };
    for (let tries = 0; tries < 48; tries++) {
      const [dx, dy] = DIRS[rng.int(DIRS.length)];
      const d = ring.d + rng.range(-2, 2);
      const x = s0.x + Math.round((dx * d) / 100);
      const y = s0.y + Math.round((dy * d) / 100);
      // The rival's copy sits at the mirrored spot (nudged to the nearest good tile).
      const mirror = nearestOk(N - x, N - y, ok);
      if (!ok(x, y) || !mirror) continue;
      sites.push({ kind: ring.kind, x, y });
      if (ok(mirror.x, mirror.y)) sites.push({ kind: ring.kind, ...mirror });
      break;
    }
  }
  // Two rich prizes in the heart of the valley, equidistant from both starts: the race's hotspot.
  const mid = { x: Math.round((starts[0].x + starts[1].x) / 2), y: Math.round((starts[0].y + starts[1].y) / 2) };
  const heart: [DiscoveryKind, number, number][] = [[rng.int(2) ? 'outcrop' : 'spring', -7, 9], ['stones', 7, -9]];
  for (const [kind, dx, dy] of heart) {
    const p = nearestOk(mid.x + dx, mid.y + dy, (x, y) => ok(x, y) || (x === mid.x + dx && y === mid.y + dy && terrain[y * N + x] !== Terrain.Water));
    if (p) sites.push({ kind, ...p });
  }
  return sites;
}

function nearestOk(x: number, y: number, ok: (x: number, y: number) => boolean): { x: number; y: number } | null {
  for (let r = 0; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  return null;
}
