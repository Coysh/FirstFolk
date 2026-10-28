import { BALANCE } from './balance';
import { revealArea } from './territory';
import type { World } from './world';

/**
 * Scouts: one fleet-footed runner a settlement can send across the fog. A scout walks out to a
 * point you choose, looks around from there, and comes home, lifting the fog on the way: landmarks
 * come into view, the rival's posts become something a raid can hit, and the rival's own scouts
 * are seen doing the same to you.
 *
 * State: `world.scouts` (saved). One per settlement at a time; they rest between trips.
 */
export interface Scout {
  id: number;
  owner: number;
  /** Tiles to walk (out, then back), and how far along it is (a step costs 1000). */
  path: number[];
  step: number;
  progress: number;
  phase: 'out' | 'look' | 'home';
  /** Ticks left looking round at the far end. */
  wait: number;
  x: number;
  y: number;
  /** A rival has noticed this scout (so it is only reported once). */
  seen: boolean;
  /** Landmarks and discoveries brought into view by this trip. */
  found: number;
}

const revealedSites = (world: World, owner: number) => world.sites.reduce((n, s) => n + (s.revealed & (1 << owner) ? 1 : 0), 0);

/** Why a scout can't go there ('' when it can). */
export function scoutProblem(world: World, owner: number, x: number, y: number): string {
  const p = world.players[owner];
  const hall = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!p || !hall) return 'No hall to send a scout from';
  if (world.scouts.some((s) => s.owner === owner)) return 'Your scout is still out';
  if (world.tick < p.scoutReady) return `Your scout is resting (${Math.ceil((p.scoutReady - world.tick) / 10)}s)`;
  if (!world.inBounds(x, y)) return 'Out of bounds';
  const i = world.idx(x, y);
  if (!world.walkable(i)) return 'A scout can only go where people can walk';
  if (Math.max(Math.abs(x - hall.x), Math.abs(y - hall.y)) > BALANCE.scoutReach) return `Too far: scouts range ${BALANCE.scoutReach} tiles from your hall`;
  if (!world.sameRegion(world.entranceIdx(hall), i)) return 'No way there on foot: find a ford, or bridge the water';
  return '';
}

/** Send a scout (a Command). */
export function sendScout(world: World, owner: number, x: number, y: number): void {
  if (scoutProblem(world, owner, x, y)) return;
  const hall = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon')!;
  const path = world.pathfinder.find(world.entranceIdx(hall), world.idx(x, y));
  if (!path || !path.length) return;
  const e = world.entrance(hall);
  world.scouts.push({ id: world.newId(), owner, path, step: 0, progress: 0, phase: 'out', wait: 0, x: e.x, y: e.y, seen: false, found: 0 });
  world.players[owner].scoutReady = world.tick + BALANCE.scoutCooldown;
  world.emit({ type: 'scoutSent', owner, x, y });
}

/** Walk the scouts, lift the fog around them, and notice who notices them. */
export function updateScouts(world: World): void {
  if (!world.scouts.length) return;
  for (const s of [...world.scouts]) {
    if (s.phase === 'look') {
      if (s.wait === BALANCE.scoutLook) revealArea(world, s.owner, s.x, s.y, BALANCE.scoutSight + 3);
      if (--s.wait > 0) continue;
      s.phase = 'home';
      s.path = [...s.path.slice(0, -1)].reverse();
      const hall = [...world.buildings.values()].find((b) => b.owner === s.owner && b.type === 'wagon');
      if (hall) s.path.push(world.entranceIdx(hall));
      s.step = 0;
      s.progress = 0;
      continue;
    }
    const before = revealedSites(world, s.owner);
    s.progress += BALANCE.scoutSpeed;
    while (s.progress >= 1000 && s.step < s.path.length) {
      s.progress -= 1000;
      const i = s.path[s.step++];
      s.x = i % world.size;
      s.y = (i - s.x) / world.size;
      if (s.phase === 'out') revealArea(world, s.owner, s.x, s.y, BALANCE.scoutSight);
    }
    s.found += revealedSites(world, s.owner) - before;
    // A settlement's own folk see a stranger on their land.
    if (!s.seen && world.tick % 10 === 0) {
      for (const b of world.buildings.values()) {
        if (b.owner === s.owner || b.owner < 0 || Math.max(Math.abs(b.x - s.x), Math.abs(b.y - s.y)) > BALANCE.scoutSpotted) continue;
        s.seen = true;
        world.emit({ type: 'scoutSpotted', owner: s.owner, seer: b.owner, x: s.x, y: s.y });
        break;
      }
    }
    if (s.step < s.path.length) continue;
    if (s.phase === 'out') {
      s.phase = 'look';
      s.wait = BALANCE.scoutLook;
    } else {
      world.scouts.splice(world.scouts.indexOf(s), 1);
      world.emit({ type: 'scoutHome', owner: s.owner, found: s.found });
    }
  }
}
