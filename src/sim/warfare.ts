import { BALANCE } from './balance';
import { BUILDINGS, GOODS, costTotal } from './defs';
import { isWalkableTerrain } from './mapgen';
import { hasOmen } from './omens';
import { playerMod } from './houses';
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
export function raidStrength(world: World, owner: number, n: number): number {
  let s = n * (BALANCE.guardStrength + playerMod(world, owner, 'husc'));
  // Fury of the underdog: a settlement far behind fights a quarter harder (a comeback lever).
  const p = world.players[owner];
  if (p && world.players.some((o) => o.id !== owner && o.renown - p.renown >= BALANCE.underdogGap)) s = Math.floor((s * (100 + BALANCE.underdogFury)) / 100);
  // The War-Horn has sounded: half as strong again.
  return p?.warhorn ? Math.floor((s * 3) / 2) : s;
}

/** How hard a building is to take: its guards, nearby stockades, the hall's ward and huscarls close by. */
export function defenceOf(world: World, b: Building): number {
  let d = Math.floor((b.guarded * BALANCE.guardStrength * (100 + playerMod(world, b.owner, 'guard'))) / 100);
  const wall = world.players[b.owner]?.shieldWall;
  if (wall && wall.until > world.tick && cheb(wall.x, wall.y, b.x, b.y) <= BALANCE.shieldWall[0]) d += BALANCE.shieldWall[1];
  for (const o of world.buildings.values()) {
    if (o.owner !== b.owner || !o.done) continue;
    const def = BUILDINGS[o.type];
    const dist = cheb(o.x, o.y, b.x, b.y);
    if (def.defence && dist <= def.defence[0]) d += def.defence[1];
    if (o.type === 'wagon' && dist <= BALANCE.hallWard[0]) d += BALANCE.hallWard[1] + BALANCE.hallWard[2] * (world.players[b.owner]?.rank ?? 0);
    // A Mustering Hall's huscarls turn out for any post close enough (unless they are away raiding).
    if (o.type === 'musterhall' && o !== b && dist <= BALANCE.interceptRange) d += huscarls(world, o) * (BALANCE.guardStrength + playerMod(world, b.owner, 'husc'));
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
  world.players[owner].warhorn = false;
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
    if (band.owner === NO_OWNER) plunder(world, defender, target.x, target.y);
  } else if (target && defender !== NO_OWNER) {
    renown = band.owner === NO_OWNER ? BALANCE.reaverRepel : BALANCE.repelRenown;
    addRenown(world, defender, renown, 'defence', target.x, target.y);
    world.players[defender].repelled++;
  }
  // A target that burned (or was pulled down) before they arrived: they simply turn for home.
  if (target) world.emit({ type: 'raidResolved', owner: band.owner, defender, won, buildingType: target.type, x: band.x, y: band.y, attack: band.strength, defence, renown });
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

/** Reavers carry off a little from the nearest store. */
function plunder(world: World, owner: number, x: number, y: number): void {
  const stores = world.storages(owner);
  let best: Building | undefined;
  for (const s of stores) if (!best || cheb(s.x, s.y, x, y) < cheb(best.x, best.y, x, y)) best = s;
  if (!best) return;
  const good = GOODS.reduce((a, g) => (best!.stock[g] - best!.reserved[g] > best!.stock[a] - best!.reserved[a] ? g : a), GOODS[0]);
  best.stock[good] -= Math.min(BALANCE.reaverLoot, Math.max(0, best.stock[good] - best.reserved[good]));
}

/** Do reavers come to this valley? Always in a race; in a peaceful valley only with the Reaver Coast omen. */
export const reaversCome = (world: World) => world.players.length > 1 || hasOmen(world, 'reaverCoast');

/** How strong the next band of reavers is. */
export function reaverStrength(world: World): number {
  const [base, step] = BALANCE.reaverStrength;
  const n = base + step * Math.floor(Math.max(0, world.tick - BALANCE.reaversFrom) / (BALANCE.reaverGap[0] * 1.25));
  return Math.round((n * (world.difficulty === 'relaxed' ? 70 : world.difficulty === 'hard' ? 120 : 100)) / 100 / 5) * 5;
}

/**
 * Reavers land on the shore facing the settlement that has spread itself thinnest (the most
 * posts, at least `reaverMinPosts`) and march on its furthest post from home.
 */
export function updateReavers(world: World): void {
  if (!reaversCome(world) || world.tick < world.nextReaversAt) return;
  const limit = world.scenario.timeLimit;
  if (limit && world.tick > limit - BALANCE.reaverGap[0] / 2) return;
  const gap = BALANCE.reaverGap[0] + world.rng.int(BALANCE.reaverGap[1] - BALANCE.reaverGap[0]);
  world.nextReaversAt = world.tick + (hasOmen(world, 'reaverCoast') ? Math.floor(gap / 2) : gap);
  // The settlement spread widest (ties: the one with more renown).
  const ranked = [...world.players].sort((a, b) => world.frontierCount(b.id) - world.frontierCount(a.id) || b.renown - a.renown || a.id - b.id);
  const victim = ranked[0];
  if (!victim || world.frontierCount(victim.id) < BALANCE.reaverMinPosts) return;
  const hall = [...world.buildings.values()].find((b) => b.owner === victim.id && b.type === 'wagon');
  if (!hall) return;
  // They strike the post furthest from home: guard your outermost tower and you hold the line.
  let target: Building | undefined;
  let far = -1;
  for (const b of world.buildings.values()) {
    if (b.owner !== victim.id || !raidable(b)) continue;
    const d = cheb(b.x, b.y, hall.x, hall.y);
    if (d > far) {
      far = d;
      target = b;
    }
  }
  if (!target) return;
  const shore = landing(world, victim.id, hall, target);
  if (!shore) return;
  const path = world.pathfinder.find(shore, world.entranceIdx(target));
  if (!path) return;
  const x = shore % world.size;
  const y = (shore - x) / world.size;
  const band: Warband = { id: world.newId(), owner: NO_OWNER, members: [], strength: reaverStrength(world), path, step: 0, progress: 0, targetId: target.id, homeId: 0, phase: 'march', x, y };
  world.warbands.push(band);
  world.emit({ type: 'raidLaunched', owner: NO_OWNER, defender: victim.id, targetId: target.id, buildingType: target.type, x: target.x, y: target.y, strength: band.strength, eta: Math.ceil((path.length * 1000) / BALANCE.adultSpeed / 10) });
}

/** Open ground beyond a post, away from its hall, outside its owner's land: where reavers come ashore. */
function landing(world: World, owner: number, hall: Building, target: Building): number | null {
  const dx = target.x - hall.x;
  const dy = target.y - hall.y;
  const len = Math.max(1, Math.abs(dx), Math.abs(dy));
  let best: number | null = null;
  for (let k = 10; k <= 26; k++) {
    const x = target.x + Math.round((dx * k) / len);
    const y = target.y + Math.round((dy * k) / len);
    if (!world.inBounds(x, y)) break;
    const i = world.idx(x, y);
    if (!isWalkableTerrain(world.map.terrain[i]) || world.buildingAt[i] || world.territory[i] === owner) continue;
    best = i;
    if (k >= 14) break;
  }
  return best;
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
