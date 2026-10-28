import { BALANCE } from './balance';
import { BUILDINGS, costTotal } from './defs';
import { addRenown } from './renown';
import { cheb, setIdle } from './settlers';
import { NO_OWNER, recomputeTerritory } from './territory';
import type { Building, World } from './world';

/**
 * Shields and spears: light, automatic warfare. Guard posts hold the land; a post's defence is
 * its guards, the stockades standing near it, the hall's ward close to home and the huscarls
 * at a Mustering Hall nearby. A raid marches a warband to a rival post and the skirmish is
 * settled on arrival, plainly: the stronger side wins. Nobody is ever killed: raids burn posts,
 * and the beaten are sent home.
 */

export interface Warband {
  id: number;
  /** The raiding settlement (NO_OWNER for reavers). */
  owner: number;
  /** Huscarls marching (their settler ids); reavers have none. */
  members: number[];
  strength: number;
  /** Tiles to walk, and how far along it is (a step costs 1000). */
  path: number[];
  step: number;
  progress: number;
  targetId: number;
  /** Where it set out from (the Mustering Hall, or the shore for reavers). */
  homeId: number;
  phase: 'march' | 'home';
  x: number;
  y: number;
}

/** The posts a raid can strike: towers, outposts and stockades. */
export const raidable = (b: Building) => b.done && !!BUILDINGS[b.type].capped;

/** A player's Mustering Hall, if built. */
export function hallOf(world: World, owner: number): Building | undefined {
  for (const b of world.buildings.values()) if (b.owner === owner && b.type === 'musterhall' && b.done) return b;
  return undefined;
}

/** Huscarls at home in a Mustering Hall (not away with a warband). */
export function huscarls(world: World, hall: Building | undefined): number {
  if (!hall) return 0;
  let n = 0;
  for (const s of world.settlers.values()) if (s.job.kind === 'guard' && s.job.buildingId === hall.id && s.job.phase === 'watch') n++;
  return n;
}

/** A warband's strength: its huscarls, plus the settlement's war bonus. */
export function raidStrength(_world: World, _owner: number, n: number): number {
  return n * BALANCE.guardStrength;
}

/** How hard a building is to take: its guards, nearby stockades, the hall's ward and huscarls close by. */
export function defenceOf(world: World, b: Building): number {
  let d = b.guarded * BALANCE.guardStrength;
  for (const o of world.buildings.values()) {
    if (o.owner !== b.owner || !o.done) continue;
    const def = BUILDINGS[o.type];
    const dist = cheb(o.x, o.y, b.x, b.y);
    if (def.defence && dist <= def.defence[0]) d += def.defence[1];
    if (o.type === 'wagon' && dist <= BALANCE.hallWard[0]) d += BALANCE.hallWard[1] + BALANCE.hallWard[2] * (world.players[b.owner]?.rank ?? 0);
    // A Mustering Hall's huscarls turn out for any post close enough (unless they are away raiding).
    if (o.type === 'musterhall' && o !== b && dist <= BALANCE.interceptRange) d += huscarls(world, o) * BALANCE.guardStrength;
  }
  return d;
}

/** Why a raid on this building can't be launched ('' when it can). */
export function raidProblem(world: World, owner: number, targetId: number): string {
  const p = world.players[owner];
  const hall = hallOf(world, owner);
  if (!hall) return 'Build a Mustering Hall first';
  if (world.tick < BALANCE.raidsFrom) return 'Raids begin at 10:00';
  if (world.warbands.some((w) => w.owner === owner)) return 'Your warband is already out';
  if (world.tick < p.raidReady) return `The huscarls are resting (${Math.ceil((p.raidReady - world.tick) / 10)}s)`;
  if (!huscarls(world, hall)) return 'No huscarls at the Mustering Hall';
  const b = world.buildings.get(targetId);
  if (!b || b.owner === owner || b.owner === NO_OWNER || !raidable(b)) return 'Pick a rival tower, outpost or stockade';
  if (!(world.explored[world.idx(b.x, b.y)] & (1 << owner))) return 'Your scouts haven’t seen it';
  if (cheb(b.x, b.y, hall.x, hall.y) > BALANCE.raidReach) return `Too far: raids reach ${BALANCE.raidReach} tiles from the Mustering Hall`;
  return '';
}

/** Launch a raid (a Command): the huscarls march out and the defender is warned. */
export function launchRaid(world: World, owner: number, targetId: number): void {
  if (raidProblem(world, owner, targetId)) return;
  const hall = hallOf(world, owner)!;
  const target = world.buildings.get(targetId)!;
  const path = world.pathfinder.find(world.entranceIdx(hall), world.entranceIdx(target));
  if (!path) return;
  const members: number[] = [];
  for (const s of world.settlers.values())
    if (s.job.kind === 'guard' && s.job.buildingId === hall.id && s.job.phase === 'watch') {
      s.job.phase = 'away';
      s.path = [];
      s.next = -1;
      s.busy = 0;
      members.push(s.id);
    }
  const e = world.entrance(hall);
  const band: Warband = { id: world.newId(), owner, members, strength: raidStrength(world, owner, members.length), path, step: 0, progress: 0, targetId, homeId: hall.id, phase: 'march', x: e.x, y: e.y };
  world.warbands.push(band);
  world.emit({ type: 'raidLaunched', owner, defender: target.owner, targetId, buildingType: target.type, x: target.x, y: target.y, strength: band.strength, eta: Math.ceil((path.length * 1000) / BALANCE.adultSpeed / 10) });
}

/** March warbands and settle skirmishes. Runs every tick. */
export function updateWarbands(world: World): void {
  if (!world.warbands.length) return;
  for (const band of [...world.warbands]) {
    band.progress += BALANCE.adultSpeed;
    while (band.progress >= 1000 && band.step < band.path.length) {
      band.progress -= 1000;
      const i = band.path[band.step++];
      band.x = i % world.size;
      band.y = (i - band.x) / world.size;
    }
    if (band.step < band.path.length) continue;
    if (band.phase === 'march') skirmish(world, band);
    else disband(world, band);
  }
}

/** The warband reaches its target: the stronger side wins, and the loser goes home. */
function skirmish(world: World, band: Warband): void {
  const target = world.buildings.get(band.targetId);
  const defender = target?.owner ?? NO_OWNER;
  const defence = target ? defenceOf(world, target) : 0;
  const won = !!target && (band.strength > defence || (band.strength === defence && world.rng.int(2) === 0));
  let renown = 0;
  if (target && won) {
    // Spoils grow with what the post cost; an unmanned post is a poor prize.
    renown = Math.min(BALANCE.raidSpoils[1], BALANCE.raidSpoils[0] + Math.floor(costTotal(target.cost) / 2));
    if (!target.guarded) renown = Math.floor(renown / 2);
    raze(world, target);
    if (band.owner !== NO_OWNER) {
      addRenown(world, band.owner, renown, 'raids', target.x, target.y);
      world.players[band.owner].raidsWon++;
    }
  } else if (target && defender !== NO_OWNER) {
    renown = BALANCE.repelRenown;
    addRenown(world, defender, renown, 'defence', target.x, target.y);
    world.players[defender].repelled++;
  }
  world.emit({ type: 'raidResolved', owner: band.owner, defender, won, buildingType: target?.type ?? 'lookout', x: band.x, y: band.y, attack: band.strength, defence, renown });
  // Home again (the way they came).
  band.phase = 'home';
  band.path = band.path.slice(0, -1).reverse();
  const home = world.buildings.get(band.homeId);
  if (home) band.path.push(world.entranceIdx(home));
  band.step = 0;
  band.progress = 0;
  if (band.owner !== NO_OWNER) world.players[band.owner].raidReady = world.tick + BALANCE.raidCooldown;
}

function disband(world: World, band: Warband): void {
  world.warbands.splice(world.warbands.indexOf(band), 1);
  for (const id of band.members) {
    const s = world.settlers.get(id);
    if (!s || s.job.kind !== 'guard' || s.job.phase !== 'away') continue;
    s.x = band.x;
    s.y = band.y;
    if (world.buildings.has(s.job.buildingId)) s.job.phase = 'toPost';
    else setIdle(s);
  }
}

/** A post burns: it is gone, its guards flee home, and its land is open to whoever pushes. */
export function raze(world: World, b: Building): void {
  world.buildings.delete(b.id);
  world.buildingsVersion++;
  const size = BUILDINGS[b.type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) world.buildingAt[world.idx(b.x + dx, b.y + dy)] = 0;
  for (const s of world.settlers.values()) if (s.job.kind === 'guard' && s.job.buildingId === b.id && s.job.phase !== 'away') setIdle(s), (s.path = []);
  world.emit({ type: 'razed', owner: b.owner, id: b.id, buildingType: b.type, x: b.x, y: b.y });
  // Landmarks that change hands because of a raid don't pay the seizing prize as well.
  world.quietSeize = true;
  recomputeTerritory(world);
  world.quietSeize = false;
}
