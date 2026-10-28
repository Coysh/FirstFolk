import { BUILDINGS, type BuildingType, type NodeKind } from '../defs';
import { canPlace } from '../commands';
import { cheb } from '../settlers';
import { NO_OWNER, territoryBox } from '../territory';
import type { World } from '../world';

/**
 * Pick a good spot for a building: gatherers want dense resources near the entrance,
 * homes want to be close to the wagon, lookouts want new land (or a target discovery).
 * Candidates are scored first and validated best-first, since `canPlace` is the costly part.
 * Shared by the scripted playtest bot and the rival AI.
 */
export function bestSite(world: World, owner: number, type: BuildingType, target?: { x: number; y: number }, opts: { want?: NodeKind } = {}): { x: number; y: number } | null {
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!wagon) return null;
  const def = BUILDINGS[type];
  const job = def.job;
  const box = territoryBox(world, owner);
  const cands: { x: number; y: number; score: number }[] = [];
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      if (!footprintFree(world, owner, x, y, def.size)) continue;
      const dist = cheb(x, y, wagon.x, wagon.y);
      let score: number;
      if (job?.kind === 'gather') {
        const n = countNodes(world, x, y + def.size, job.node, Math.min(job.radius, 6));
        if (n < 3) continue;
        score = n * 2 - dist * 0.4;
      } else if (job?.kind === 'plant') {
        score = countNodes(world, x, y + def.size, 'tree', 5) - dist * 0.4;
      } else if (def.claim) {
        score = target ? -cheb(x, y, target.x, target.y) * 4 + newLand(world, owner, x + 1, y + 1, def.claim) * 0.02 : newLand(world, owner, x + 1, y + 1, def.claim) - dist * 0.5;
        // Short of stone or wood? Head for land with rocks or trees.
        if (opts.want) score += countNodes(world, x + 1, y + 1, opts.want, def.claim) * (target ? 0.3 : 1.5);
      } else if (def.storage) {
        // A second store pays off a little way out, towards the work.
        score = -Math.abs(dist - 9);
      } else {
        score = -dist;
      }
      cands.push({ x, y, score });
    }
  cands.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  for (let i = 0; i < cands.length && i < 400; i++) if (canPlace(world, owner, type, cands[i].x, cands[i].y).ok) return cands[i];
  return null;
}

/** Cheap pre-check (own land, nothing built) so the costly `canPlace` only sees plausible spots. */
function footprintFree(world: World, owner: number, x: number, y: number, size: number): boolean {
  for (let dy = 0; dy <= size; dy++)
    for (let dx = 0; dx < size; dx++) {
      if (!world.inBounds(x + dx, y + dy)) return false;
      const i = world.idx(x + dx, y + dy);
      if (world.territory[i] !== owner || world.buildingAt[i]) return false;
    }
  return true;
}

/** Land a claim of radius r could gain (sampled every other tile); a rival's land counts half, being harder to take. */
function newLand(world: World, owner: number, cx: number, cy: number, r: number): number {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y += 2)
    for (let x = cx - r; x <= cx + r; x += 2) {
      if (!world.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const t = world.territory[world.idx(x, y)];
      if (t === owner || world.map.terrain[world.idx(x, y)] === 0) continue;
      n += t === NO_OWNER ? 1 : 0.5;
    }
  return n;
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
