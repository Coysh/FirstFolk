import { BUILDINGS, GOODS, type BuildingType } from './defs';
import { addRenown } from './renown';
import { demolish } from './commands';
import type { Building, World } from './world';

/**
 * Great Works: one of each in the whole valley (AoE wonders without the timer). They are the
 * late game's race and its great sink: big costs, a crew of builders, and a perk for good.
 * The first settlement to finish one wins it; any rival site of the same work is abandoned,
 * and half of what was delivered is carried home.
 */
export function workOwner(world: World, type: BuildingType): number {
  for (const b of world.buildings.values()) if (b.type === type && b.done) return b.owner;
  return -1;
}

export function greatWorkDone(world: World, b: Building): void {
  const great = BUILDINGS[b.type].great;
  if (!great) return;
  addRenown(world, b.owner, great.renown, 'works', b.x + 1, b.y + 1);
  for (const other of [...world.buildings.values()]) {
    if (other.type !== b.type || other.done || other.owner === b.owner) continue;
    // Half the delivered materials come home; the rest is lost with the abandoned site.
    for (const g of GOODS) other.delivered[g] = Math.floor(other.delivered[g] / 2);
    world.emit({ type: 'workLost', owner: other.owner, buildingType: b.type, winner: b.owner });
    demolish(world, other.id);
  }
}
