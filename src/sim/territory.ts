import { BALANCE } from './balance';
import { BUILDINGS, DISCOVERIES, GOODS, SKILLS, type Good } from './defs';
import { spawnFamily } from './population';
import { grantXp } from './settlers';
import type { Building, Discovery, World } from './world';

/**
 * The frontier: land is claimed by buildings with a `claim` radius (the wagon, lookouts),
 * fog lifts around buildings and wherever settlers walk, and discoveries hidden in the fog
 * are claimed by whoever's border covers them first. Claimed land is final.
 */

export const NO_OWNER = -1;

export function owns(world: World, owner: number, x: number, y: number): boolean {
  return world.inBounds(x, y) && world.territory[world.idx(x, y)] === owner;
}

export function isExplored(world: World, owner: number, x: number, y: number): boolean {
  return world.inBounds(x, y) && (world.explored[world.idx(x, y)] & (1 << owner)) !== 0;
}

/** Claim unowned land in a disc. Returns the number of tiles gained. */
export function claimArea(world: World, owner: number, cx: number, cy: number, r: number): number {
  let gained = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = world.idx(x, y);
      if (world.territory[i] !== NO_OWNER) continue;
      world.territory[i] = owner;
      gained++;
    }
  if (gained) {
    world.territoryVersion++;
    world.emit({ type: 'territoryGrew', owner, tiles: gained, x: cx, y: cy });
    claimCoveredSites(world);
  }
  revealArea(world, owner, cx, cy, r + 2);
  return gained;
}

export function revealArea(world: World, owner: number, cx: number, cy: number, r: number): void {
  const bit = 1 << owner;
  let changed = false;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = world.idx(x, y);
      if (world.explored[i] & bit) continue;
      world.explored[i] |= bit;
      changed = true;
    }
  if (!changed) return;
  world.fogVersion++;
  for (const site of world.sites) {
    if (site.revealed & bit || !(world.explored[world.idx(site.x, site.y)] & bit)) continue;
    site.revealed |= bit;
    if (site.claimedBy !== NO_OWNER) continue;
    world.players[owner].rumourAt = world.tick + BALANCE.rumourDelay;
    world.emit({ type: 'discovered', siteId: site.id, kind: site.kind, owner });
  }
}

/** A finished building claims and reveals its surroundings. */
export function onBuildingComplete(world: World, b: Building): void {
  const def = BUILDINGS[b.type];
  const cx = b.x + Math.floor(def.size / 2);
  const cy = b.y + Math.floor(def.size / 2);
  if (def.claim) claimArea(world, b.owner, cx, cy, def.claim + (b.type === 'wagon' ? 0 : (world.families.get(b.builtBy)?.mods.claim ?? 0)));
  revealArea(world, b.owner, cx, cy, def.reveal ?? 4);
}

/** Settlers lift the fog a little wherever they walk. Runs about once a second. */
export function updateExploration(world: World): void {
  const r = BALANCE.settlerSight;
  for (const s of world.settlers.values()) revealArea(world, s.owner, s.x, s.y, r + (world.families.get(s.familyId)?.mods.sight ?? 0));
  for (const p of world.players) updateRumours(world, p.id);
}

/**
 * There is always somewhere new to head for: when nothing has been spotted or claimed for
 * a while (even if a known site is out of reach), a traveller tells of the nearest unseen
 * discovery and its spot is revealed through the fog.
 */
function updateRumours(world: World, owner: number): void {
  const player = world.players[owner];
  const bit = 1 << owner;
  if (world.tick < player.rumourAt) return;
  player.rumourAt = world.tick + BALANCE.rumourDelay;
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!wagon) return;
  let best: Discovery | undefined;
  let bestD = Infinity;
  for (const site of world.sites) {
    if (site.claimedBy !== NO_OWNER || site.revealed & bit) continue;
    const d = (site.x - wagon.x) ** 2 + (site.y - wagon.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  if (!best) return;
  world.emit({ type: 'rumour', siteId: best.id, kind: best.kind, owner, dir: compass(best.x - wagon.x, best.y - wagon.y) });
  revealArea(world, owner, best.x, best.y, 3);
}

/** Compass direction in the game's view (north is up the screen, -y). */
function compass(dx: number, dy: number): string {
  const ns = dy < -Math.abs(dx) / 2 ? 'north' : dy > Math.abs(dx) / 2 ? 'south' : '';
  const ew = dx > Math.abs(dy) / 2 ? 'east' : dx < -Math.abs(dy) / 2 ? 'west' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'nearby';
}

function claimCoveredSites(world: World): void {
  for (const site of world.sites) {
    if (site.claimedBy !== NO_OWNER) continue;
    const owner = world.territory[world.idx(site.x, site.y)];
    if (owner === NO_OWNER || !world.players[owner]) continue;
    site.claimedBy = owner;
    world.players[owner].claimed++;
    world.players[owner].rumourAt = world.tick + BALANCE.rumourDelay;
    const text = claimReward(world, site, owner);
    world.emit({ type: 'claimed', siteId: site.id, kind: site.kind, owner, text });
  }
}

/** Apply a discovery's reward. Returns a one-line description for the banner. */
function claimReward(world: World, site: Discovery, owner: number): string {
  switch (site.kind) {
    case 'cart': {
      const store = nearestStore(world, owner, site.x, site.y);
      const loot: Partial<Record<Good, number>> = { logs: 12, stone: 6, planks: 4, berries: 12 };
      if (store) for (const g of GOODS) store.stock[g] += loot[g] ?? 0;
      return '+12 logs, +6 stone, +4 planks and +12 berries';
    }
    case 'ruins': {
      // The carvings teach the craft your folk know least.
      const skill = SKILLS.reduce((a, k) => (bestXp(world, owner, k) < bestXp(world, owner, a) ? k : a), SKILLS[world.rng.int(SKILLS.length)]);
      let n = 0;
      for (const s of world.settlers.values())
        if (s.owner === owner && !s.child) {
          grantXp(world, s, skill, BALANCE.ruinsXp);
          n++;
        }
      return `${n} adults learn ${BALANCE.ruinsXp} XP of ${skill}`;
    }
    case 'wanderers': {
      const fam = spawnFamily(world, world.players[owner], null, site.x, site.y, 4, BALANCE.wandererSkill);
      return `The ${fam.surname} family join you, skilled Journeymen. Build them a hut!`;
    }
    case 'stones': {
      claimArea(world, owner, site.x, site.y, BALANCE.stonesClaim);
      return 'The land around the stones becomes yours';
    }
    default:
      return DISCOVERIES[site.kind].blurb;
  }
}

function bestXp(world: World, owner: number, skill: (typeof SKILLS)[number]): number {
  let best = 0;
  for (const s of world.settlers.values()) if (s.owner === owner) best = Math.max(best, s.skills[skill]);
  return best;
}

function nearestStore(world: World, owner: number, x: number, y: number): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.storages(owner)) {
    const d = Math.max(Math.abs(b.x - x), Math.abs(b.y - y));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Bounding box of a player's land (cached per territory version), for searches and flood fills. */
export function territoryBox(world: World, owner: number): { x0: number; y0: number; x1: number; y1: number } {
  const cached = world.boxCache[owner];
  if (cached && cached.version === world.territoryVersion) return cached.box;
  let x0 = world.size;
  let y0 = world.size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < world.size; y++)
    for (let x = 0; x < world.size; x++)
      if (world.territory[y * world.size + x] === owner) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const box = { x0, y0, x1, y1 };
  world.boxCache[owner] = { version: world.territoryVersion, box };
  return box;
}
