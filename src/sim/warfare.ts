import { BALANCE } from './balance';
import { BUILDINGS } from './defs';
import { cheb } from './settlers';
import type { Building, World } from './world';

/**
 * Shields and spears: light, automatic warfare. Guard posts hold the land; a post's defence
 * is its guards, the stockades standing near it and the hall's ward close to home. Nobody is
 * ever killed: raids burn posts, and the beaten are sent home.
 */

/** How hard a building is to take: its guards, nearby stockades and the hall's ward. */
export function defenceOf(world: World, b: Building): number {
  let d = b.guarded * BALANCE.guardStrength;
  for (const o of world.buildings.values()) {
    if (o.owner !== b.owner || !o.done) continue;
    const def = BUILDINGS[o.type];
    if (def.defence && cheb(o.x, o.y, b.x, b.y) <= def.defence[0]) d += def.defence[1];
    if (o.type === 'wagon' && cheb(o.x, o.y, b.x, b.y) <= BALANCE.hallWard[0]) d += BALANCE.hallWard[1] + BALANCE.hallWard[2] * (world.players[b.owner]?.rank ?? 0);
  }
  return d;
}
