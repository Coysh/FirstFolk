import { BALANCE, TICK_HZ } from './balance';
import { BUILDINGS, DISCOVERIES } from './defs';
import type { World } from './world';
import { hasOmen } from './omens';
import { callingTier } from './callings';

/**
 * Renown is the score both settlements race for. It comes from many places, so there are
 * many ways to win: holding landmarks and land (a steady income that can be taken from you),
 * discoveries, Masters, family deeds and great works (one-off sums).
 */
export type RenownSource = 'landmarks' | 'land' | 'discoveries' | 'masters' | 'goals' | 'events' | 'deeds' | 'legends' | 'works' | 'trade' | 'contests' | 'raids' | 'defence' | 'hearth';

export function addRenown(world: World, owner: number, n: number, source: RenownSource, x = -1, y = -1): void {
  const p = world.players[owner];
  if (!p || n <= 0) return;
  p.renown += n;
  p.renownBy[source] = (p.renownBy[source] ?? 0) + n;
  world.emit({ type: 'renown', owner, amount: n, source, x, y });
}

/** Renown a minute from what a player holds right now: landmarks plus land. */
export function renownRate(world: World, owner: number): { landmarks: number; land: number } {
  let landmarks = 0;
  const bonus = hasOmen(world, 'oldKingdom') ? 1 : 0;
  for (const s of world.sites) {
    if (s.heldBy !== owner) continue;
    const watch = watched(world, owner, s.x, s.y);
    // A stockade standing watch tends the landmark: it pays a little more.
    if (watch) landmarks += (DISCOVERIES[s.kind].renown ?? 0) + bonus + (watch === 'stockade' ? BALANCE.tendedBonus : 0);
  }
  // The Stone Circle makes held landmarks pay half as much again.
  if (world.hasWork(owner, 'henge')) landmarks = Math.floor((landmarks * 3) / 2);
  // The Moot: the whole valley gathers for the final stretch, and landmarks pay double.
  if (mootUnderway(world)) landmarks *= 2;
  let tiles = 0;
  for (let i = 0; i < world.territory.length; i++) if (world.territory[i] === owner) tiles++;
  return { landmarks, land: Math.floor(tiles / BALANCE.renown.landTiles) };
}

/**
 * A landmark pays only while it is watched: a manned post (a guard standing there), or your
 * hall, within `watchRange`. Holding many landmarks takes many spears; burn the post that
 * watches one and it stops paying, even if the land stays.
 */
export function watched(world: World, owner: number, x: number, y: number): '' | 'watched' | 'stockade' {
  const r = BALANCE.watchRange;
  let out: '' | 'watched' | 'stockade' = '';
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || !b.done || Math.max(Math.abs(b.x + 1 - x), Math.abs(b.y + 1 - y)) > r) continue;
    if (b.type === 'stockade' && b.guarded > 0) return 'stockade';
    if (b.type === 'wagon' || (BUILDINGS[b.type].garrison && b.guarded > 0)) out = 'watched';
  }
  return out;
}

export const mootUnderway = (world: World) => !!world.scenario.timeLimit && world.tick >= BALANCE.mootAt;

/** Pay out holdings. Runs every `renownTick`; remainders carry over exactly between payouts. */
export function updateRenown(world: World): void {
  const minute = 60 * TICK_HZ;
  if (world.scenario.timeLimit && world.tick >= BALANCE.mootAt && world.tick < BALANCE.mootAt + BALANCE.renownTick) world.emit({ type: 'moot' });
  const top = Math.max(...world.players.map((p) => p.renown));
  for (const p of world.players) {
    p.maxDeficit = Math.max(p.maxDeficit, top - p.renown);
    const rate = renownRate(world, p.id);
    // A hearth town in good health earns renown for it: a fed, housed people is a prosperous one.
    const hearth = p.hungry ? 0 : Math.floor(world.population(p.id) / 18) * callingTier(world, p.id, 'hearth');
    const sources = [['landmarks', rate.landmarks], ['land', rate.land], ['hearth', hearth]] as const;
    sources.forEach(([source, perMin], k) => {
      p.renownFrac[k] += perMin * BALANCE.renownTick;
      const whole = Math.floor(p.renownFrac[k] / minute);
      if (!whole) return;
      p.renownFrac[k] -= whole * minute;
      p.renown += whole;
      p.renownBy[source] = (p.renownBy[source] ?? 0) + whole;
    });
  }
}
