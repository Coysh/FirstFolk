import { BALANCE } from '../balance';
import { BUILDINGS, type BuildingType } from '../defs';
import { canPlace } from '../commands';
import { cheb } from '../settlers';
import type { World } from '../world';

/**
 * Pick a good spot for a building: gatherers want dense resources near the entrance,
 * homes want to be close to the wagon. Shared by the scripted playtest bot and (later) the rival AI.
 */
export function bestSite(world: World, owner: number, type: BuildingType): { x: number; y: number } | null {
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!wagon) return null;
  const job = BUILDINGS[type].job;
  const R = BALANCE.claimRadius;
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let y = wagon.y - R; y <= wagon.y + R; y++)
    for (let x = wagon.x - R; x <= wagon.x + R; x++) {
      if (!canPlace(world, owner, type, x, y).ok) continue;
      const dist = cheb(x, y, wagon.x, wagon.y);
      let score: number;
      if (job?.kind === 'gather') {
        score = countNodes(world, x, y + BUILDINGS[type].size, job.node, 5) * 2 - dist * 0.4;
      } else if (job?.kind === 'plant') {
        score = countNodes(world, x, y + BUILDINGS[type].size, 'tree', 5) - dist * 0.4;
      } else if (BUILDINGS[type].storage) {
        // A second store pays off a little way out, towards the work.
        score = -Math.abs(dist - 9);
      } else {
        score = -dist;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}

function countNodes(world: World, cx: number, cy: number, kind: string, r: number): number {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y)) continue;
      const node = world.nodes.get(world.nodeAt[world.idx(x, y)]);
      if (node && node.kind === kind && node.amount > 0) n++;
    }
  return n;
}
