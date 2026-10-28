import { BALANCE } from './balance';
import { isWalkableTerrain } from './mapgen';
import { NO_OWNER, updateHoldings } from './territory';
import type { World } from './world';

/**
 * Happenings: valley-wide surprises that land mid-game and give both settlements something
 * new to fight over (Battle Drones' supply drops). Star-fall: somewhere between the two
 * settlements a star comes down, leaving a Star-Stone, a rich landmark both sides can see.
 */
export function starfallTick(world: World): number {
  // Between 15:00 and 16:30 depending on the valley (always ≡ 5 mod 10, when this runs).
  return BALANCE.starfallAt + (world.seed % 7) * 150;
}

export function updateHappenings(world: World): void {
  if (world.players.length < 2 || world.tick !== starfallTick(world)) return;
  const [a, b] = world.map.starts;
  const mx = Math.round((a.x + b.x) / 2) + world.rng.range(-4, 4);
  const my = Math.round((a.y + b.y) / 2) + world.rng.range(-4, 4);
  const spot = findSpot(world, mx, my, a, b);
  if (!spot) return;
  const nodeId = world.nodeAt[world.idx(spot.x, spot.y)];
  const node = nodeId ? world.nodes.get(nodeId) : undefined;
  if (node) world.removeNode(node);
  const all = (1 << world.players.length) - 1;
  const site = { id: world.newId(), kind: 'starstone' as const, x: spot.x, y: spot.y, revealed: all, claimedBy: NO_OWNER, heldBy: NO_OWNER };
  world.sites.push(site);
  world.emit({ type: 'starfall', siteId: site.id, x: site.x, y: site.y });
  updateHoldings(world);
  // The race to the stone starts at once (unless a challenge is already running).
  if (!world.challenge) world.nextChallengeAt = world.tick;
}

/**
 * Open ground near a point, as fair as possible (equally far from both halls), preferring
 * land nobody holds yet and away from other finds.
 */
function findSpot(world: World, cx: number, cy: number, a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let y = cy - 14; y <= cy + 14; y++)
    for (let x = cx - 14; x <= cx + 14; x++) {
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      if (!isWalkableTerrain(world.map.terrain[i]) || world.buildingAt[i]) continue;
      if (world.sites.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < 36)) continue;
      const unfair = Math.abs((x - a.x) ** 2 + (y - a.y) ** 2 - (x - b.x) ** 2 - (y - b.y) ** 2) / 3;
      const score = (x - cx) ** 2 + (y - cy) ** 2 + unfair + (world.territory[i] === NO_OWNER ? 0 : 150);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}
