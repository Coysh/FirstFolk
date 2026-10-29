import { BALANCE, secs } from './balance';
import { BUILDINGS, type Good } from './defs';
import { canAfford, pay } from './events';
import { isWalkableTerrain } from './mapgen';
import { addRenown } from './renown';
import { HOUSES, playerMod, type Seat } from './houses';
import { NO_OWNER, onBuildingComplete, recomputeTerritory } from './territory';
import { hallOf } from './warfare';
import { openHands } from './steadings';
import type { Building, World } from './world';

/**
 * House powers (the Great Houses' deeds): each seated house lends one call-down power with a
 * cooldown. Every power says exactly what it does, in numbers, and the news line after it
 * reports what happened. Pure data plus one `apply` per power.
 */
export type DeedId = 'raise' | 'timber' | 'harvest' | 'expedition' | 'festival' | 'warhorn' | 'shieldwall';

export interface DeedDef {
  id: DeedId;
  name: string;
  icon: string;
  /** What it does, with its numbers, for the house bar and cards. */
  blurb: string;
  /** A few words for the house bar. */
  short: string;
  /** Targeted powers need a tile (chosen on the map). */
  target: boolean;
  cooldown: number;
  cost?: Partial<Record<Good | 'food', number>>;
  /** Do it. Returns the news line, or null if it cannot be done (nothing is spent). */
  apply(world: World, owner: number, x: number, y: number): string | null;
}

/** What a power costs right now: every frontier building you have makes the next Expedition dearer. */
export function deedCost(world: World, owner: number, id: DeedId): Partial<Record<Good | 'food', number>> {
  const cost = { ...DEEDS[id].cost };
  if (id === 'expedition') cost.logs = (cost.logs ?? 0) + 2 * world.frontierCount(owner);
  return cost;
}

/** Ticks until a seat's power is ready (0 = ready). */
export function deedWait(world: World, seat: Seat): number {
  return Math.max(0, seat.ready - world.tick);
}

/** A power's cooldown for this settlement right now (the Mead Hall and being behind shorten it). */
export function deedCooldown(world: World, owner: number, id: DeedId): number {
  const p = world.players[owner];
  const behind = world.players.some((o) => o.id !== owner && o.renown - p.renown >= BALANCE.underdogGap);
  const mead = world.hasWork(owner, 'meadhall');
  return Math.round((DEEDS[id].cooldown * (100 - (behind ? BALANCE.underdogPct : 0) - (mead ? 30 : 0))) / 100);
}

/** Running effects of powers, for the HUD: name → ticks left. */
export function activePowers(world: World, owner: number): { id: DeedId; left: number }[] {
  const p = world.players[owner];
  const out: { id: DeedId; left: number }[] = [];
  if (p.buffs.timber > world.tick) out.push({ id: 'timber', left: p.buffs.timber - world.tick });
  if (p.buffs.harvest > world.tick) out.push({ id: 'harvest', left: p.buffs.harvest - world.tick });
  if (p.shieldWall && p.shieldWall.until > world.tick) out.push({ id: 'shieldwall', left: p.shieldWall.until - world.tick });
  for (const b of p.boosts) if (b.until > world.tick) out.push({ id: 'festival', left: b.until - world.tick });
  if (p.warhorn) out.push({ id: 'warhorn', left: 0 });
  return out;
}

export const DEEDS: Record<DeedId, DeedDef> = {
  raise: {
    id: 'raise',
    name: 'Raise',
    icon: '🔨',
    short: 'Finish a site now',
    blurb: 'Finish the construction site nearest where you tap, at once (a Great Work: a quarter of it). Ready every 110 s.',
    target: true,
    cooldown: secs(110),
    apply(world, owner, x, y) {
      const sites = [...world.buildings.values()].filter((b) => b.owner === owner && !b.done);
      if (!sites.length) return null;
      sites.sort((a, b) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) - Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) || a.id - b.id);
      const site = sites[0];
      const def = BUILDINGS[site.type];
      if (def.great) {
        site.work = Math.min(site.workNeeded - 1, site.work + Math.ceil(site.workNeeded / 4));
        // Their own hands and stores supply what the quarter needs.
        for (const g of Object.keys(site.cost) as Good[]) site.delivered[g] = Math.max(site.delivered[g], Math.min(site.cost[g]!, Math.ceil((site.cost[g]! * site.work) / site.workNeeded)));
        return `A quarter of the ${def.name} rises overnight.`;
      }
      for (const g of Object.keys(site.cost) as Good[]) site.delivered[g] = site.cost[g]!;
      site.work = site.workNeeded;
      completeSite(world, site);
      return `The ${def.name} is finished overnight.`;
    },
  },
  timber: {
    id: 'timber',
    name: 'Wagon Train',
    icon: '🐂',
    short: 'Carts safe and fast, 90 s',
    blurb: 'For 90 seconds every cart of yours travels half as fast again and cannot be waylaid on the road. Ready every 120 s.',
    target: false,
    cooldown: secs(120),
    apply(world, owner) {
      world.players[owner].buffs.timber = world.tick + secs(90);
      return 'The wagon train rolls: your carts are safe and swift for a minute and a half.';
    },
  },
  harvest: {
    id: 'harvest',
    name: 'Open Hands',
    icon: '🤝',
    short: 'Deliver to a steading now',
    blurb: 'Hand a steading what it asks for at once, up to 30 goods from your stores, with no cart to be waylaid. With no Want to meet, it wins a friend 12 favour instead. Ready every 120 s.',
    target: false,
    cooldown: secs(120),
    apply(world, owner) {
      return openHands(world, owner);
    },
  },
  expedition: {
    id: 'expedition',
    name: 'Expedition',
    icon: '🧭',
    short: 'Outpost up to 18 tiles out',
    blurb: 'Scouts raise an Outpost up to 18 tiles beyond your border: new land (radius 7), and maybe a landmark. Costs 8 logs and 6 food, +2 logs for each tower you hold. Ready every 170 s.',
    target: true,
    cooldown: secs(170),
    cost: { logs: 8, food: 6 },
    apply(world, owner, x, y) {
      if (world.territory[world.idx(x, y)] === owner || world.frontierCount(owner) >= world.frontierCap(owner)) return null;
      const spot = outpostSpot(world, owner, x, y);
      if (!spot) return null;
      const b = world.addBuilding('outpost', owner, spot.x, spot.y, true);
      b.reach = playerMod(world, owner, 'claim');
      world.emit({ type: 'buildingComplete', owner, id: b.id, buildingType: b.type });
      onBuildingComplete(world, b);
      return 'Scouts raise an outpost in the wilds.';
    },
  },
  festival: {
    id: 'festival',
    name: 'Festival',
    icon: '🎪',
    short: 'Push the border for 60 s',
    blurb: 'Hold a great gathering at your border: for 60 seconds your influence surges 12 tiles around it (strong enough to pull a landmark over), and +5 renown. Costs 12 food. Ready every 150 s.',
    target: true,
    cooldown: secs(150),
    cost: { food: 12 },
    apply(world, owner, x, y) {
      if (!world.inBounds(x, y) || !nearOwnLand(world, owner, x, y, 4)) return null;
      world.players[owner].boosts.push({ x, y, r: 12, p: 150, until: world.tick + secs(60) });
      recomputeTerritory(world);
      addRenown(world, owner, BALANCE.renown.festival, 'deeds', x, y);
      return 'A festival! For a minute the whole valley comes to you.';
    },
  },
  warhorn: {
    id: 'warhorn',
    name: 'War-Horn',
    icon: '📯',
    short: 'Huscarls ready, next raid +50%',
    blurb: 'Blow the war-horn: your huscarls are rested at once, and the next raid fights half as strong again. Needs a Mustering Hall. Ready every 150 s.',
    target: false,
    cooldown: secs(150),
    apply(world, owner) {
      const p = world.players[owner];
      if (!hallOf(world, owner) || p.warhorn) return null;
      p.warhorn = true;
      p.raidReady = Math.min(p.raidReady, world.tick);
      return 'The war-horn sounds: the huscarls are ready, and the next raid strikes half as hard again.';
    },
  },
  shieldwall: {
    id: 'shieldwall',
    name: 'Shield Wall',
    icon: '🛡️',
    short: '+40 defence near a spot, 60 s',
    blurb: 'For 60 seconds every building of yours within 9 tiles of where you tap defends with +40 more. Tap your own land. Ready every 120 s.',
    target: true,
    cooldown: secs(120),
    apply(world, owner, x, y) {
      if (!world.inBounds(x, y) || world.territory[world.idx(x, y)] !== owner) return null;
      world.players[owner].shieldWall = { x, y, until: world.tick + secs(60) };
      return 'A shield wall: everything near it defends with +40 for a minute.';
    },
  },
};

function nearOwnLand(world: World, owner: number, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (world.inBounds(x + dx, y + dy) && world.territory[world.idx(x + dx, y + dy)] === owner) return true;
  return false;
}

/**
 * Where an outpost can stand: open ground (2×2 plus entrance) near the target, not on a
 * rival's land and within reach of your border.
 */
export function outpostSpot(world: World, owner: number, x: number, y: number): { x: number; y: number } | null {
  for (let r = 0; r <= 5; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const bx = x + dx;
        const by = y + dy;
        if (fits(world, owner, bx, by) && nearOwnLand(world, owner, bx, by, BALANCE.expeditionReach)) return { x: bx, y: by };
      }
  return null;
}

function fits(world: World, owner: number, x: number, y: number): boolean {
  for (let dy = 0; dy <= 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!world.inBounds(tx, ty)) return false;
      const i = world.idx(tx, ty);
      if (!isWalkableTerrain(world.map.terrain[i]) || world.buildingAt[i]) return false;
      const t = world.territory[i];
      if (t !== NO_OWNER && t !== owner) return false;
      if (dy < 2 && world.nodeAt[i] && world.nodes.get(world.nodeAt[i])?.kind === 'rock') return false;
      if (world.sites.some((s) => s.x === tx && s.y === ty)) return false;
    }
  return true;
}

function completeSite(world: World, site: Building): void {
  site.done = true;
  site.builderId = 0;
  site.status = '';
  site.alert = '';
  for (const s of world.settlers.values()) if (s.job.kind === 'build' && s.job.siteId === site.id) s.job = { kind: 'idle', wait: 0 };
  world.stats.completions.push({ type: site.type, tick: world.tick });
  world.emit({ type: 'buildingComplete', owner: site.owner, id: site.id, buildingType: site.type });
  onBuildingComplete(world, site);
}

/** Why a power can't be used here and now ('' when it can), so the UI can say so before trying. */
export function deedTargetProblem(world: World, owner: number, id: DeedId, x: number, y: number): string {
  if (!world.inBounds(x, y)) return 'Off the map';
  if (id === 'expedition') {
    if (world.frontierCount(owner) >= world.frontierCap(owner)) return `Your folk can hold ${world.frontierCap(owner)} towers and outposts at this rank`;
    if (world.territory[world.idx(x, y)] === owner) return 'That’s already your land: pick a spot beyond the border';
    if (!outpostSpot(world, owner, x, y)) return `No open ground there within ${BALANCE.expeditionReach} tiles of your border`;
  }
  if (id === 'festival' && !nearOwnLand(world, owner, x, y, 4)) return 'Too far out: hold festivals at your border';
  if (id === 'shieldwall' && world.territory[world.idx(x, y)] !== owner) return 'Raise the shield wall on your own land';
  if (id === 'raise' && ![...world.buildings.values()].some((b) => b.owner === owner && !b.done)) return 'Nothing is under construction';
  return '';
}

/** Why a seat's power can't be called right now ('' when it can). */
export function deedProblem(world: World, owner: number, seatIndex: number): string {
  const seat = world.players[owner]?.seats[seatIndex];
  if (!seat) return 'No house sits there';
  const id = HOUSES[seat.house].power;
  if (deedWait(world, seat) > 0) return `Ready in ${Math.ceil(deedWait(world, seat) / 10)}s`;
  if (!canAfford(world, owner, deedCost(world, owner, id))) return `Needs ${Object.entries(deedCost(world, owner, id)).map(([g, n]) => `${n} ${g}`).join(', ')}`;
  if (id === 'warhorn' && !hallOf(world, owner)) return 'Needs a Mustering Hall';
  if (id === 'warhorn' && world.players[owner].warhorn) return 'The horn has sounded: raid first';
  if (id === 'raise' && ![...world.buildings.values()].some((b) => b.owner === owner && !b.done)) return 'Nothing is under construction';
  return '';
}

/** Call on a seated house's power (a Command). Checks the seat, cooldown and cost. */
export function performDeed(world: World, owner: number, seatIndex: number, x: number, y: number): void {
  const p = world.players[owner];
  const seat = p?.seats[seatIndex];
  if (!seat || deedWait(world, seat) > 0) return;
  const id = HOUSES[seat.house].power;
  const def = DEEDS[id];
  const cost = deedCost(world, owner, id);
  if (!canAfford(world, owner, cost)) return;
  const text = def.apply(world, owner, x, y);
  if (text === null) return;
  pay(world, owner, cost);
  seat.ready = world.tick + deedCooldown(world, owner, id);
  p.deedsUsed++;
  const fam = world.families.get(seat.familyId);
  world.emit({ type: 'deed', owner, seat: seatIndex, house: seat.house, surname: fam?.surname ?? '', deed: id, x, y, text });
}
