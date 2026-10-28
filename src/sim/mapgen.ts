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

export type ValleyId = 'riverlands' | 'longlake' | 'highlands' | 'threerivers' | 'wildwood' | 'fens';

export interface ValleyDef {
  name: string;
  icon: string;
  /** One line a player can act on: what the land offers, and what it asks. */
  blurb: string;
}

/**
 * Six valleys that play differently: where the water runs decides where you can walk, where the
 * chokepoints are, and what your folk can eat, mine and trade. The same seed always makes the same
 * valley; every feature is built point-symmetric so both settlements get the same geography.
 */
export const VALLEYS: Record<ValleyId, ValleyDef> = {
  riverlands: { name: 'The Riverlands', icon: '🌊', blurb: 'A river splits the valley and only a ford or two cross it. Hold the ford, or bridge the water.' },
  longlake: { name: 'The Long Lake', icon: '🛶', blurb: 'Rival shores round a great lake. A prize island sits in the narrows: bridge across, or walk the long way round.' },
  highlands: { name: 'The Highlands', icon: '⛰️', blurb: 'A mountain ridge with a few passes. Rich in stone, thin in timber and berries: fortify the passes.' },
  threerivers: { name: 'The Three Rivers', icon: '🏞️', blurb: 'Two rivers carve out a rich middle strip. Each side must ford twice to reach the prizes in the centre.' },
  wildwood: { name: 'The Wildwood', icon: '🌲', blurb: 'Deep forest and narrow streams. Timber for everyone, but berries are scarce: fish, trade, clear the land.' },
  fens: { name: 'The Fens', icon: '🪷', blurb: 'Ponds and shallows everywhere, with winding dry routes. Fish aplenty; bridges shorten every journey.' },
};
export const VALLEY_IDS = Object.keys(VALLEYS) as ValleyId[];
/** The valley a seed makes (so the New Game screen can show it before the map is built). */
export const valleyOf = (seed: number): ValleyId => VALLEY_IDS[new Rng(seed ^ 0x7a11e5).int(VALLEY_IDS.length)];

export interface MapData {
  size: number;
  valley: ValleyId;
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

/** Offsets of the guaranteed resource clusters around a start (point-mirrored for the rival). */
const CLUSTERS = {
  forest: { dx: 9, dy: -6, r: 4.2 },
  rock: { dx: -8, dy: 7, r: 2.8 },
  meadow: { dx: 5, dy: 7, r: 3 },
};
type ClusterKey = keyof typeof CLUSTERS;
const START_CLEAR = 4.5;

// ------------------------------------------------------------------------------------------------
// geometry: every feature is point-symmetric about the map centre, so both settlements share it
// ------------------------------------------------------------------------------------------------
type Pt = [number, number];
const rotPt = (p: Pt, N: number): Pt => [N - p[0], N - p[1]];

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return { d: Math.sqrt(qx * qx + qy * qy), t };
}

function distPath(px: number, py: number, path: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distSeg(px, py, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]).d);
  return best;
}

/** A wandering line through the control points: each stretch is sideways-jittered by smooth noise, easing to nothing at the end. */
function meander(pts: Pt[], amp: number, seed: number, perSeg = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const taper = i === pts.length - 2 ? 1 - t : 1;
      const j = (fbm(out.length * 0.3, 7.5, seed, 2) - 0.5) * amp * taper;
      out.push([ax + dx * t + (-dy / len) * j, ay + dy * t + (dx / len) * j]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A path from an edge to the centre, completed into a point-symmetric line through the centre. */
function throughCentre(half: Pt[], N: number): Pt[] {
  return [...half, ...half.slice(0, -1).reverse().map((p) => rotPt(p, N))];
}

interface Shape {
  hills: number;
  /** Positive: less forest. Negative: more. */
  forestShift: number;
  /** Positive: more meadow (and berries). */
  meadowShift: number;
  /** Negative: more rock. */
  rockShift: number;
  startClear: number;
}
interface River {
  path: Pt[];
  /** Outer edge of the bank slope; the water itself is about (w + 0.8) wide. */
  w: number;
  fords: Pt[];
}
interface Spec {
  rivers: River[];
  discs: { c: Pt; r: number }[];
  capsules: { a: Pt; b: Pt; rEnd: number; rMid: number }[];
  islands: { c: Pt; r: number }[];
  ridges: { path: Pt[]; w: number; h: number; passes: Pt[] }[];
  /** [first settlement, its point-mirror]. */
  starts: [Pt, Pt];
  shape: Shape;
  /** Prizes in the heart of the valley, as offsets from the centre. */
  heart?: [DiscoveryKind, number, number][];
  /** Kinds this valley swaps for others in the discovery rings. */
  swap?: Partial<Record<DiscoveryKind, DiscoveryKind>>;
}

const DEFAULT_SHAPE: Shape = { hills: 1, forestShift: 0, meadowShift: 0, rockShift: 0, startClear: START_CLEAR };

/** How clear of every feature a spot is (tiles of dry land to the nearest water, ridge or rock wall). */
function clearance(spec: Spec, x: number, y: number): number {
  let c = Infinity;
  for (const r of spec.rivers) c = Math.min(c, distPath(x, y, r.path) - (r.w + 0.8) / 2);
  for (const d of spec.discs) c = Math.min(c, Math.sqrt((x - d.c[0]) ** 2 + (y - d.c[1]) ** 2) - d.r);
  for (const k of spec.capsules) {
    const s = distSeg(x, y, k.a[0], k.a[1], k.b[0], k.b[1]);
    const u = Math.abs(2 * s.t - 1);
    c = Math.min(c, s.d - (k.rMid + (k.rEnd - k.rMid) * u * u));
  }
  for (const r of spec.ridges) c = Math.min(c, distPath(x, y, r.path) - r.w);
  return c;
}

/** The first candidate with room to breathe, else the roomiest. */
function pickStart(spec: Spec, cands: Pt[], N: number): [Pt, Pt] {
  let best = cands[0];
  let bestC = -Infinity;
  for (const c of cands) {
    const room = Math.min(clearance(spec, c[0], c[1]), clearance(spec, N - c[0], N - c[1]));
    if (room >= 11) return [c, rotPt(c, N)];
    if (room > bestC) {
      bestC = room;
      best = c;
    }
  }
  return [best, rotPt(best, N)];
}

/** Starts sit on either side of the centre, across the given direction. */
function sideCandidates(N: number, dir: Pt, dist: number[]): Pt[] {
  const [vx, vy] = dir;
  const c = N / 2;
  const out: Pt[] = [];
  for (const d of dist) for (const along of [0, -0.12, 0.12]) out.push([c + vx * d * N - vy * along * N, c + vy * d * N + vx * along * N]);
  return out;
}

function buildSpec(valley: ValleyId, N: number, seed: number, attempt: number): Spec {
  const rng = new Rng(seed ^ (0x51a9 + VALLEY_IDS.indexOf(valley) * 7919) ^ (attempt * 104729));
  const C = N / 2;
  const rf = (lo: number, hi: number) => lo + rng.float() * (hi - lo);
  const jit = (f: number) => rf(-f, f) * N;
  const ms = seed + attempt * 31;
  const spec: Spec = { rivers: [], discs: [], capsules: [], islands: [], ridges: [], starts: [[0, 0], [0, 0]], shape: { ...DEFAULT_SHAPE } };

  /** A random edge-to-centre line (vertical, horizontal, or one of the diagonals). */
  const centreLine = (orient: number, amp: number): { half: Pt[]; dir: Pt } => {
    let E: Pt;
    let M: Pt;
    let dir: Pt;
    if (orient === 0) {
      E = [C + jit(0.1), 0];
      M = [C + jit(0.14), 0.25 * N];
      dir = [1, 0];
    } else if (orient === 1) {
      E = [0, C + jit(0.1)];
      M = [0.25 * N, C + jit(0.14)];
      dir = [0, 1];
    } else if (orient === 2) {
      E = [0.12 * N + rf(0, 0.08) * N, 0.04 * N];
      M = [0.3 * N + jit(0.05), 0.3 * N + jit(0.05)];
      dir = [0.7071, -0.7071];
    } else {
      E = [0.88 * N - rf(0, 0.08) * N, 0.04 * N];
      M = [0.7 * N + jit(0.05), 0.3 * N + jit(0.05)];
      dir = [0.7071, 0.7071];
    }
    return { half: meander([E, M, [C, C]], amp, ms), dir };
  };
  /** Fords: shallows on the line, as a symmetric pair (or one in the middle). */
  const fordsOn = (half: Pt[], count: number, centre: boolean): Pt[] => {
    if (centre) return [[C, C]];
    const out: Pt[] = [];
    for (let i = 0; i < count; i++) {
      const p = half[Math.floor(half.length * rf(0.18 + i * 0.3, 0.42 + i * 0.3))] ?? half[0];
      out.push(p, rotPt(p, N));
    }
    return out;
  };
  const pondPairs = (n: number, rMin: number, rMax: number, minFrom: number) => {
    for (let i = 0; i < n; i++)
      for (let tries = 0; tries < 24; tries++) {
        const c: Pt = [rf(0.08, 0.92) * N, rf(0.08, 0.92) * N];
        const r = rf(rMin, rMax);
        const fromC = Math.hypot(c[0] - C, c[1] - C);
        if (fromC < 14 || fromC > 0.4 * N || clearance(spec, c[0], c[1]) < minFrom + r) continue;
        spec.discs.push({ c, r }, { c: rotPt(c, N), r });
        break;
      }
  };

  switch (valley) {
    case 'riverlands': {
      const { half, dir } = centreLine(rng.int(4), N * 0.07);
      const centreFord = rng.int(4) === 0;
      spec.rivers.push({ path: throughCentre(half, N), w: 2.7 + rf(0, 1.1), fords: fordsOn(half, 1 + rng.int(2), centreFord) });
      pondPairs(1, 4, 6.5, 12);
      spec.starts = pickStart(spec, sideCandidates(N, [-dir[1], dir[0]], [0.27, 0.24, 0.3]), N);
      break;
    }
    case 'longlake': {
      const dir: Pt = [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]][rng.int(4)] as Pt;
      const reach = 0.19 + rf(0, 0.04);
      spec.capsules.push({ a: [C + dir[0] * reach * N, C + dir[1] * reach * N], b: [C - dir[0] * reach * N, C - dir[1] * reach * N], rEnd: 11 + rf(0, 2.5), rMid: 4.4 });
      spec.islands.push({ c: [C, C], r: 2.4 });
      pondPairs(1, 3, 4.5, 12);
      spec.starts = pickStart(spec, sideCandidates(N, [-dir[1], dir[0]], [0.24, 0.21, 0.27]), N);
      spec.heart = [['starstone', 0, 0]];
      spec.swap = { outcrop: 'spring' };
      spec.shape = { ...DEFAULT_SHAPE, hills: 0.8, meadowShift: 0.04 };
      break;
    }
    case 'highlands': {
      const { half, dir } = centreLine(rng.int(4), N * 0.06);
      const passes: Pt[] = [[C, C]];
      if (rng.int(10) < 6) {
        const p = half[Math.floor(half.length * rf(0.25, 0.5))];
        passes.push(p, rotPt(p, N));
      }
      spec.ridges.push({ path: throughCentre(half, N), w: 5.5, h: 3.4, passes });
      pondPairs(2, 2.5, 4, 8);
      spec.starts = pickStart(spec, sideCandidates(N, [-dir[1], dir[0]], [0.26, 0.23, 0.29]), N);
      spec.shape = { hills: 1.5, forestShift: 0.08, meadowShift: -0.04, rockShift: -0.1, startClear: START_CLEAR };
      spec.swap = { grove: 'outcrop', oakwood: 'outcrop', spring: 'barrow' };
      break;
    }
    case 'threerivers': {
      const x0 = (0.33 + rf(-0.03, 0.03)) * N;
      const a = meander([[x0 + jit(0.04), 0], [x0 + jit(0.06), 0.36 * N], [x0 + jit(0.06), 0.64 * N], [x0 + jit(0.04), N]], N * 0.05, ms);
      const f = a[Math.floor(a.length * rf(0.22, 0.4))];
      const w = 2.6 + rf(0, 0.9);
      spec.rivers.push({ path: a, w, fords: [f] }, { path: a.map((p) => rotPt(p, N)), w, fords: [rotPt(f, N)] });
      spec.starts = pickStart(spec, [[0.14 * N, 0.5 * N + jit(0.08)], [0.17 * N, 0.4 * N], [0.17 * N, 0.62 * N], [0.12 * N, 0.5 * N]], N);
      spec.heart = [['stones', 0, 0], ['spring', -7, 9], ['outcrop', 7, -9]];
      break;
    }
    case 'wildwood': {
      const l1 = centreLine(rng.int(4), N * 0.06);
      const l2 = centreLine(rng.int(4), N * 0.06);
      spec.rivers.push({ path: throughCentre(l1.half, N), w: 2.1, fords: fordsOn(l1.half, 2, false) }, { path: throughCentre(l2.half, N), w: 2.1, fords: fordsOn(l2.half, 2, false) });
      spec.starts = pickStart(spec, [...sideCandidates(N, [-l1.dir[1], l1.dir[0]], [0.24, 0.28]), ...sideCandidates(N, [l1.dir[0], l1.dir[1]], [0.24])], N);
      spec.shape = { hills: 0.9, forestShift: -0.14, meadowShift: -0.1, rockShift: 0.05, startClear: 6 };
      spec.swap = { outcrop: 'oakwood', stones: 'shrine' };
      break;
    }
    case 'fens': {
      pondPairs(11, 2.8, 6, 2);
      const dir: Pt = [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]][rng.int(4)] as Pt;
      spec.starts = pickStart(spec, sideCandidates(N, [-dir[1], dir[0]], [0.26, 0.22, 0.29, 0.18]), N);
      spec.shape = { hills: 0.45, forestShift: 0.02, meadowShift: 0.05, rockShift: 0.05, startClear: START_CLEAR };
      spec.swap = { outcrop: 'spring', stones: 'barrow' };
      break;
    }
  }
  return spec;
}

/** Every tile of dry land the start can walk to (4-way, no bridges), as a flag per tile. */
function reach(terrain: Uint8Array, N: number, from: Pt): Uint8Array {
  const seen = new Uint8Array(N * N);
  const stack = [Math.round(from[1]) * N + Math.round(from[0])];
  if (!isWalkableTerrain(terrain[stack[0]])) return seen;
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % N;
    const y = (i - x) / N;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (!seen[j] && isWalkableTerrain(terrain[j])) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}

export function generateMap(seed: number, size = BALANCE.mapSize): MapData {
  const want = valleyOf(seed);
  let last: MapData | null = null;
  // A valley must always be playable: both starts walk to each other over land (fords, passes, shores).
  for (let attempt = 0; attempt < 8; attempt++) {
    const valley: ValleyId = attempt < 6 ? want : 'riverlands';
    const m = buildMap(seed, size, valley, attempt);
    last = m;
    const [a, b] = m.starts;
    if (reach(m.terrain, m.size, [a.x, a.y])[b.y * m.size + b.x]) return m;
  }
  return last!;
}

function buildMap(seed: number, size: number, valley: ValleyId, attempt: number): MapData {
  const N = size;
  const C = N + 1;
  const water = 1.0;
  const spec = buildSpec(valley, N, seed, attempt);
  const sh = spec.shape;
  const hf = new Float64Array(C * C);
  const starts = spec.starts.map((p) => ({ x: Math.round(p[0]), y: Math.round(p[1]) }));

  for (let y = 0; y <= N; y++) {
    for (let x = 0; x <= N; x++) {
      const base = fbm(x * 0.04, y * 0.04, seed, 4);
      const hills = fbm(x * 0.09, y * 0.09, seed + 7, 3);
      const dx = (x - N / 2) / (N / 2);
      const dy = (y - N / 2) / (N / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      let h = 1.4 + base * 1.5 * sh.hills + Math.max(0, hills - 0.55) * 4 * sh.hills + smoothstep(0.72, 1.05, d) * 4.5;

      for (const ridge of spec.ridges) {
        const rd = distPath(x, y, ridge.path);
        let pass = 0;
        for (const p of ridge.passes) pass = Math.max(pass, 1 - smoothstep(2.5, 7, Math.sqrt((x - p[0]) ** 2 + (y - p[1]) ** 2)));
        h += ridge.h * (1 - smoothstep(0, ridge.w + 3, rd)) * (1 - pass);
      }
      for (const river of spec.rivers) {
        const rt = 1 - smoothstep(0.8, river.w, distPath(x, y, river.path));
        if (rt <= 0) continue;
        let fordT = 0;
        // A ford's shallows must span the river's whole width, so its reach grows with the water.
        const fr = (river.w + 0.8) / 2 + 1.3;
        for (const f of river.fords) fordT = Math.max(fordT, 1 - smoothstep(fr, fr + 2.2, Math.sqrt((x - f[0]) ** 2 + (y - f[1]) ** 2)));
        const bed = water - 0.6 + 0.72 * fordT;
        h = h + (bed - h) * rt;
      }
      for (const disc of spec.discs) {
        const ld = Math.sqrt((x - disc.c[0]) ** 2 + (y - disc.c[1]) ** 2);
        const lt = 1 - smoothstep(disc.r * 0.5, disc.r + 1.5, ld);
        if (lt > 0) h = h + (water - 0.5 - h) * lt;
      }
      for (const cap of spec.capsules) {
        const s = distSeg(x, y, cap.a[0], cap.a[1], cap.b[0], cap.b[1]);
        const u = Math.abs(2 * s.t - 1);
        const r = cap.rMid + (cap.rEnd - cap.rMid) * u * u;
        const lt = 1 - smoothstep(r * 0.55, r + 1.2, s.d);
        if (lt > 0) h = h + (water - 0.5 - h) * lt;
      }
      for (const isle of spec.islands) {
        const it = 1 - smoothstep(isle.r * 0.5, isle.r + 0.8, Math.sqrt((x - isle.c[0]) ** 2 + (y - isle.c[1]) ** 2));
        if (it > 0) h = h + (2.0 - h) * it;
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
      else if (avg > 3.1 || fbm(x * 0.11, y * 0.11, seed + 53, 2) > 0.74 + sh.rockShift) t = Terrain.Rock;
      else {
        const moist = fbm(x * 0.07, y * 0.07, seed + 31, 3);
        t = moist > 0.57 + sh.forestShift ? Terrain.Forest : moist < 0.4 + sh.meadowShift ? Terrain.Meadow : Terrain.Grass;
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

  // Guaranteed starting resources: the cluster pattern is turned a quarter at a time to wherever
  // the land is best, then point-mirrored for the rival so the race stays fair.
  const turn = (k: number, dx: number, dy: number): Pt => (k === 0 ? [dx, dy] : k === 1 ? [-dy, dx] : k === 2 ? [-dx, -dy] : [dy, -dx]);
  const landIn = (cx: number, cy: number, r: number) => {
    let n = 0;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const t = tileAt(x, y);
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && t !== Terrain.Water && t !== Terrain.Mountain && t !== Terrain.Sand) n++;
      }
    return n;
  };
  let bestK = 0;
  let bestScore = -1;
  for (let k = 0; k < 4; k++) {
    // The thinnest cluster matters most (nobody should start without rock, say), then the total.
    let worst = Infinity;
    let total = 0;
    for (const c of Object.values(CLUSTERS)) {
      const [ox, oy] = turn(k, c.dx, c.dy);
      const land = landIn(starts[0].x + ox, starts[0].y + oy, c.r) / (c.r * c.r);
      worst = Math.min(worst, land);
      total += land;
    }
    const score = worst * 100 + total;
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  const clusters = (Object.keys(CLUSTERS) as ClusterKey[]).map((key) => ({ key, ...CLUSTERS[key], at: turn(bestK, CLUSTERS[key].dx, CLUSTERS[key].dy) }));
  starts.forEach((s, i) => {
    const m = i === 0 ? 1 : -1;
    for (const c of clusters) paint(s.x + c.at[0] * m, s.y + c.at[1] * m, c.r, c.key === 'forest' ? Terrain.Forest : c.key === 'rock' ? Terrain.Rock : Terrain.Meadow);
    paint(s.x, s.y, sh.startClear, Terrain.Grass);
  });

  const rng = new Rng(seed ^ 0x5eed);
  const sites = placeSites(N, starts, terrain, rng, spec);
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

  const inCluster = (x: number, y: number, key: ClusterKey) =>
    starts.some((s, i) => {
      const m = i === 0 ? 1 : -1;
      const c = clusters.find((q) => q.key === key)!;
      return (x - (s.x + c.at[0] * m)) ** 2 + (y - (s.y + c.at[1] * m)) ** 2 <= c.r * c.r;
    });

  const nodes: MapData['nodes'] = [];
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      if (starts.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 <= (sh.startClear + 1) ** 2)) continue;
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

  return { size: N, valley, heights, terrain, waterLevel: Math.round(water / HEIGHT_STEP), starts, nodes, sites };
}

function placeSites(N: number, starts: { x: number; y: number }[], terrain: Uint8Array, rng: Rng, spec: Spec): MapData['sites'] {
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
    const kind = kinds[rng.int(kinds.length)];
    const ring = { kind: spec.swap?.[kind] ?? kind, d: dist };
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
  // Rich prizes in the heart of the valley, equidistant from both starts: the race's hotspot.
  const mid = { x: Math.round((starts[0].x + starts[1].x) / 2), y: Math.round((starts[0].y + starts[1].y) / 2) };
  const heart: [DiscoveryKind, number, number][] = spec.heart ?? [[rng.int(2) ? 'outcrop' : 'spring', -7, 9], ['stones', 7, -9]];
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
