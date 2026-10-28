import { BALANCE, TICK_HZ } from './balance';
import { DISCOVERIES } from './defs';
import type { World } from './world';

/**
 * Renown is the score both settlements race for. It comes from many places, so there are
 * many ways to win: holding landmarks and land (a steady income that can be taken from you),
 * discoveries, Masters, family deeds and great works (one-off sums).
 */
export type RenownSource = 'landmarks' | 'land' | 'discoveries' | 'masters' | 'goals' | 'events' | 'deeds' | 'legends' | 'works' | 'trade';

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
  for (const s of world.sites) if (s.heldBy === owner) landmarks += DISCOVERIES[s.kind].renown ?? 0;
  // The Stone Circle makes held landmarks pay half as much again.
  if (world.hasWork(owner, 'henge')) landmarks = Math.floor((landmarks * 3) / 2);
  let tiles = 0;
  for (let i = 0; i < world.territory.length; i++) if (world.territory[i] === owner) tiles++;
  return { landmarks, land: Math.floor(tiles / BALANCE.renown.landTiles) };
}

/** Pay out holdings. Runs every `renownTick`; remainders carry over exactly between payouts. */
export function updateRenown(world: World): void {
  const minute = 60 * TICK_HZ;
  for (const p of world.players) {
    const rate = renownRate(world, p.id);
    const sources = [['landmarks', rate.landmarks], ['land', rate.land]] as const;
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
