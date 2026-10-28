import { BALANCE } from './balance';
import { GOODS, type Good } from './defs';
import { pay } from './events';
import { callingTier } from './callings';
import { addRenown } from './renown';
import type { World } from './world';

/**
 * Market Day: whatever you over-produce can always become renown, carried off by traders.
 * Each sale gluts the market for that good (the next lot fetches less) and the glut eases
 * over a minute or so, so selling is a steady trickle, not a tap. From Hamlet rank.
 */
export const FAIR_LOT = 20;
/** Renown for a lot when the market is fresh. Planks are worked goods and fetch the most. */
export const FAIR_VALUE: Record<Good, number> = { logs: 3, planks: 6, stone: 4, berries: 2, fish: 2 };

export function fairPrice(world: World, owner: number, good: Good): number {
  const glut = world.players[owner]?.glut[good] ?? 0;
  // Merchants get more for the same goods: +20% a tier.
  return Math.floor((FAIR_VALUE[good] * (100 + 20 * callingTier(world, owner, 'trader'))) / (100 + glut));
}

export const marketOpen = (world: World, owner: number) => (world.players[owner]?.rank ?? 0) >= 1;

export function sell(world: World, owner: number, good: Good): void {
  const p = world.players[owner];
  if (!p || !marketOpen(world, owner) || world.stored(owner, good) < FAIR_LOT) return;
  const renown = fairPrice(world, owner, good);
  if (renown <= 0) return;
  pay(world, owner, { [good]: FAIR_LOT });
  p.glut[good] += BALANCE.glutPerSale;
  p.sold += FAIR_LOT;
  addRenown(world, owner, renown, 'trade');
  world.emit({ type: 'sold', owner, good, n: FAIR_LOT, renown });
}

/**
 * Standing orders: with a trade route on, traders take a lot of that good every 20 s while
 * the stores hold more than the reserve you set. Set and forget, never a clicking chore.
 */
export function setTrade(world: World, owner: number, good: Good, keep: number | null): void {
  const p = world.players[owner];
  if (!p) return;
  if (keep === null) delete p.routes[good];
  else p.routes[good] = Math.max(0, Math.min(999, Math.floor(keep)));
}

/** The glut eases (every 2 s), and standing orders sell (every 20 s). */
export function updateMarket(world: World): void {
  // The glut eases; a trading town's markets recover faster (twice, three times as fast).
  for (const p of world.players) for (const g of GOODS) if (p.glut[g] > 0) p.glut[g] = Math.max(0, p.glut[g] - 1 - callingTier(world, p.id, 'trader'));
  if (world.tick % BALANCE.routeEvery !== 15) return;
  for (const p of world.players)
    for (const g of GOODS) {
      const keep = p.routes[g];
      if (keep !== undefined && world.stored(p.id, g) - FAIR_LOT >= keep) sell(world, p.id, g);
    }
}
