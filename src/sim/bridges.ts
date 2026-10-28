import { BALANCE } from './balance';
import { canAfford, pay } from './events';
import { Terrain, isWalkableTerrain } from './mapgen';
import { owns } from './territory';
import type { World } from './world';

/**
 * Bridges turn a river into a choice. A span of 1 to 5 plank tiles joins two banks, laid by the
 * crew in a few seconds for logs and stone. Fords are free but few and fixed; a bridge goes where
 * *you* need it, shortens every haul and march, and becomes a chokepoint to hold or to burn.
 *
 * State: `world.bridges` (saved) and `world.deck`, rebuilt from it: 1 = a finished deck tile (walkable
 * water), 2 = planned or under construction (blocks a second bridge, not yet walkable).
 */
export const BRIDGE_MAX = BALANCE.bridgeMax;
export const BRIDGE_RANK = 1;

export interface Bridge {
  id: number;
  owner: number;
  /** The first water tile of the span. */
  x: number;
  y: number;
  /** 0: runs along +x, 1: along +y. */
  dir: 0 | 1;
  len: number;
  done: boolean;
  work: number;
  need: number;
}

export interface Span {
  x: number;
  y: number;
  dir: 0 | 1;
  len: number;
}

export interface BridgeCheck {
  ok: boolean;
  reason?: string;
  /** What it costs (goods), whether or not you can pay it right now. */
  cost: { logs: number; stone: number };
}

const step = (dir: 0 | 1) => (dir === 0 ? [1, 0] : [0, 1]) as [number, number];

export const bridgeCost = (len: number) => ({ logs: BALANCE.bridgeCost.logs * len, stone: BALANCE.bridgeCost.stone * len });

/** Tiles under a span. */
export function spanTiles(s: Span): [number, number][] {
  const [dx, dy] = step(s.dir);
  return Array.from({ length: s.len }, (_, k) => [s.x + dx * k, s.y + dy * k] as [number, number]);
}

/** The two bank tiles a span joins. */
export function spanEnds(s: Span): [[number, number], [number, number]] {
  const [dx, dy] = step(s.dir);
  return [[s.x - dx, s.y - dy], [s.x + dx * s.len, s.y + dy * s.len]];
}

const isWater = (world: World, x: number, y: number) => world.inBounds(x, y) && world.map.terrain[world.idx(x, y)] === Terrain.Water && world.deck[world.idx(x, y)] === 0;
const isBank = (world: World, x: number, y: number) => world.inBounds(x, y) && world.walkableGround(world.idx(x, y));

/** Cast across water from a bank tile in a direction: the span that reaches the far bank, if any. */
function castFrom(world: World, bx: number, by: number, dx: number, dy: number): Span | null {
  let len = 0;
  while (len <= BRIDGE_MAX && isWater(world, bx + dx * (len + 1), by + dy * (len + 1))) len++;
  if (len < 1 || len > BRIDGE_MAX || !isBank(world, bx + dx * (len + 1), by + dy * (len + 1))) return null;
  // Normalise to run along +x or +y from its first water tile.
  return dx > 0 || dy > 0 ? { x: bx + dx, y: by + dy, dir: dx ? 0 : 1, len } : { x: bx + dx * len, y: by + dy * len, dir: dx ? 0 : 1, len };
}

/**
 * The span under or beside a map tile: over water, the shortest straight run that joins two banks;
 * on a bank, the first span across the water next to it. (What the pointer means, for the UI.)
 */
export function spanAt(world: World, tx: number, ty: number): Span | null {
  if (!world.inBounds(tx, ty)) return null;
  const found: Span[] = [];
  if (world.map.terrain[world.idx(tx, ty)] === Terrain.Water) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let ax = tx;
      let ay = ty;
      while (isWater(world, ax - dx, ay - dy) && Math.abs(ax - tx) + Math.abs(ay - ty) <= BRIDGE_MAX) {
        ax -= dx;
        ay -= dy;
      }
      if (!isBank(world, ax - dx, ay - dy)) continue; // wider than any bridge
      const s = castFrom(world, ax - dx, ay - dy, dx, dy);
      if (s) found.push(s);
    }
  } else if (isBank(world, tx, ty)) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = castFrom(world, tx, ty, dx, dy);
      if (s) found.push(s);
    }
  }
  found.sort((a, b) => a.len - b.len);
  return found[0] ?? null;
}

export function canBridge(world: World, owner: number, s: Span): BridgeCheck {
  const cost = bridgeCost(s.len);
  const no = (reason: string): BridgeCheck => ({ ok: false, reason, cost });
  if ((world.players[owner]?.rank ?? 0) < BRIDGE_RANK) return no('Bridges need Hamlet rank');
  if (s.len < 1 || s.len > BRIDGE_MAX) return no(`Too wide: a bridge spans at most ${BRIDGE_MAX} tiles`);
  for (const [x, y] of spanTiles(s)) if (!isWater(world, x, y)) return no('Already bridged, or not water');
  const [a, b] = spanEnds(s);
  if (!isBank(world, a[0], a[1]) || !isBank(world, b[0], b[1])) return no('A bridge needs dry land at both ends');
  if (!owns(world, owner, a[0], a[1]) && !owns(world, owner, b[0], b[1])) return no('Outside your border: build a Lookout near the water');
  if (!canAfford(world, owner, cost)) return no(`Needs ${cost.logs} logs and ${cost.stone} stone`);
  return { ok: true, cost };
}

export function placeBridge(world: World, owner: number, s: Span): Bridge | null {
  if (!canBridge(world, owner, s).ok) return null;
  pay(world, owner, bridgeCost(s.len));
  const b: Bridge = { id: world.newId(), owner, x: s.x, y: s.y, dir: s.dir, len: s.len, done: false, work: 0, need: BALANCE.bridgeTicks * s.len };
  world.bridges.push(b);
  for (const [x, y] of spanTiles(b)) world.deck[world.idx(x, y)] = 2;
  world.emit({ type: 'bridgePlaced', owner, id: b.id, x: b.x, y: b.y });
  return b;
}

/** Rebuild the deck map from the bridge list (after a load). */
export function rebuildDeck(world: World): void {
  world.deck.fill(0);
  for (const b of world.bridges) for (const [x, y] of spanTiles(b)) world.deck[world.idx(x, y)] = b.done ? 1 : 2;
}

export function updateBridges(world: World): void {
  for (const b of world.bridges) {
    if (b.done) continue;
    b.work++;
    if (b.work < b.need) continue;
    b.done = true;
    for (const [x, y] of spanTiles(b)) world.deck[world.idx(x, y)] = 1;
    world.buildingsVersion++; // routes and reach caches are stale now
    world.regionLabels = null;
    world.barrierMap = null;
    world.territoryVersion++; // borders can now cross here
    world.emit({ type: 'bridgeBuilt', owner: b.owner, id: b.id, x: b.x, y: b.y, len: b.len });
  }
}

/** Dry tiles that touch open water (the terrain never changes, so this is worked out once). */
function shoreTiles(world: World): Int32Array {
  if (world.shoreCache) return world.shoreCache;
  const out: number[] = [];
  const size = world.size;
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (!isWalkableTerrain(world.map.terrain[i])) continue;
      if ([1, -1, size, -size].some((d) => world.map.terrain[i + d] === Terrain.Water)) out.push(i);
    }
  return (world.shoreCache = Int32Array.from(out));
}

/** Land the owner's folk can walk to from their hall (4-way), as a flag per tile (cached until the map of walkable tiles changes). */
function reachFromHome(world: World, owner: number): Uint8Array {
  const cached = world.bridgeReach[owner];
  if (cached && cached.version === world.buildingsVersion) return cached.seen;
  const seen = new Uint8Array(world.size * world.size);
  world.bridgeReach[owner] = { version: world.buildingsVersion, seen };
  const home = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!home) return seen;
  const stack = [world.entranceIdx(home)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % world.size;
    const y = (i - x) / world.size;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!world.inBounds(x + dx, y + dy)) continue;
      const j = world.idx(x + dx, y + dy);
      if (!seen[j] && world.walkableGround(j)) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}

/**
 * The bridge worth building: a span from land you can reach to land you cannot, scored by how much
 * walkable ground (and how many unclaimed landmarks) it opens. Used by the scripted player and as a
 * hint for humans; both go through the same Command.
 */
export function bestBridge(world: World, owner: number): { span: Span; score: number } | null {
  if ((world.players[owner]?.rank ?? 0) < BRIDGE_RANK) return null;
  const reach = reachFromHome(world, owner);
  const seenSpans = new Set<string>();
  let best: { span: Span; score: number } | null = null;
  const size = world.size;
  for (const i of shoreTiles(world)) {
    const x = i % size;
    const y = (i - x) / size;
    if (!reach[i] || world.territory[i] !== owner) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isWater(world, x + dx, y + dy)) continue;
      const span = castFrom(world, x, y, dx, dy);
      if (!span) continue;
      const key = `${span.x},${span.y},${span.dir},${span.len}`;
      if (seenSpans.has(key)) continue;
      seenSpans.add(key);
      const far = spanEnds(span).find(([ex, ey]) => !reach[world.idx(ex, ey)]);
      if (!far || !canBridge(world, owner, span).ok) continue;
      // Walk the far side (up to a cap) to see what it opens.
      const seen = new Set<number>();
      const stack = [world.idx(far[0], far[1])];
      seen.add(stack[0]);
      while (stack.length && seen.size < 400) {
        const j = stack.pop()!;
        const jx = j % size;
        const jy = (j - jx) / size;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!world.inBounds(jx + ax, jy + ay)) continue;
          const k = world.idx(jx + ax, jy + ay);
          if (!seen.has(k) && !reach[k] && world.walkableGround(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
      let score = seen.size - span.len * 6;
      for (const site of world.sites) if (site.claimedBy < 0 && site.heldBy < 0 && Math.max(Math.abs(site.x - far[0]), Math.abs(site.y - far[1])) <= 14) score += 120;
      if (!best || score > best.score) best = { span, score };
    }
  }
  return best;
}

