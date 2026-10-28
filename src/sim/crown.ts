import { BALANCE, TICK_HZ } from './balance';
import { NO_OWNER } from './territory';
import { watched } from './renown';
import type { World } from './world';

/**
 * The Crown is how the valley is won. When the Kingstone falls, the folk with a manned post
 * beside it (and nobody else's) fill the Crown a little every second, and the first to fill it
 * is crowned. A second watcher freezes it: the stone is *contested* until one post burns. The
 * rival's progress drains while you keep the stone, so a lead is never safe and a comeback
 * is always one good raid away. Renown no longer wins the game: it unlocks ranks, and breaks ties.
 *
 * State: `world.crown` (saved); null until the Kingstone falls.
 */
export interface Crown {
  /** The Kingstone's site id. */
  siteId: number;
  /** Progress per player, 0..BALANCE.crownNeed. */
  progress: number[];
  /** Who keeps the stone right now: a player id, NO_OWNER (vacant), or -2 (contested). */
  keeper: number;
  /** Highest quarter (0..4) each player has reached, so each milestone is announced once. */
  quarter: number[];
}

export const CONTESTED = -2;

export function newCrown(siteId: number, players: number): Crown {
  return { siteId, progress: new Array(players).fill(0), keeper: NO_OWNER, quarter: new Array(players).fill(0) };
}

export function crownSite(world: World) {
  return world.crown ? world.sites.find((s) => s.id === world.crown!.siteId) : undefined;
}

/** Who has a manned post (or the hall) beside the stone, and whether a stockade tends it. */
export function watchers(world: World): { owner: number; tended: boolean }[] {
  const site = crownSite(world);
  if (!site) return [];
  const out: { owner: number; tended: boolean }[] = [];
  for (const p of world.players) {
    const w = watched(world, p.id, site.x, site.y);
    if (w) out.push({ owner: p.id, tended: w === 'stockade' });
  }
  return out;
}

/** Crown points a second the keeper earns. */
export const crownRate = (tended: boolean) => (tended ? BALANCE.crownTended : BALANCE.crownRate);

/** Percent full (0..100) for a player. */
export const crownPct = (world: World, owner: number) => (world.crown ? Math.min(100, Math.floor((world.crown.progress[owner] * 100) / BALANCE.crownNeed)) : 0);

/** Seconds until a player fills the Crown at the current pace (Infinity if they are not the keeper). */
export function crownEta(world: World, owner: number): number {
  const c = world.crown;
  if (!c || c.keeper !== owner) return Infinity;
  const w = watchers(world).find((x) => x.owner === owner);
  return Math.ceil((BALANCE.crownNeed - c.progress[owner]) / crownRate(!!w?.tended));
}

/** The leading player on the Crown (ties by renown), or NO_OWNER before it exists. */
export function crownLeader(world: World): number {
  const c = world.crown;
  if (!c) return NO_OWNER;
  return [...world.players].sort((a, b) => c.progress[b.id] - c.progress[a.id] || b.renown - a.renown || a.id - b.id)[0].id;
}

/** Once a second: keep the stone, fill the Crown, drain the rest. */
export function updateCrown(world: World): void {
  const c = world.crown;
  if (!c || world.tick % TICK_HZ !== 0) return;
  const site = crownSite(world);
  if (!site) return;
  const w = watchers(world);
  const keeper = w.length === 1 ? w[0].owner : w.length > 1 ? CONTESTED : NO_OWNER;
  if (keeper !== c.keeper) {
    const was = c.keeper;
    c.keeper = keeper;
    world.emit({ type: 'crownKeeper', keeper, was, x: site.x, y: site.y });
  }
  if (keeper < 0) return;
  c.progress[keeper] = Math.min(BALANCE.crownNeed, c.progress[keeper] + crownRate(w[0].tended));
  for (const p of world.players) if (p.id !== keeper) c.progress[p.id] = Math.max(0, c.progress[p.id] - BALANCE.crownDecay);
  for (const p of world.players) {
    const q = Math.floor((c.progress[p.id] * 4) / BALANCE.crownNeed);
    if (q > c.quarter[p.id]) world.emit({ type: 'crownQuarter', owner: p.id, quarter: q });
    c.quarter[p.id] = Math.max(c.quarter[p.id], q);
  }
}

/** The Crowning: the first folk to fill it, if any. */
export function crowned(world: World): number {
  const c = world.crown;
  if (!c) return NO_OWNER;
  return world.players.find((p) => c.progress[p.id] >= BALANCE.crownNeed)?.id ?? NO_OWNER;
}
