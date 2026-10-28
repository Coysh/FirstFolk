import { BALANCE, TICK_HZ } from './balance';
import { NO_OWNER } from './territory';
import { watched } from './renown';
import type { World } from './world';

/**
 * The Crown is how the valley is won, and it fills for the folk who hold more of the valley. The
 * valley has *voices*: each steading that stands with you is one, and the Kingstone (once the star
 * has fallen) is worth two to whoever keeps it alone, with a manned post beside it and nobody
 * else's. From the moment the Crown opens, whoever holds more voices fills it a point a second for
 * each voice of lead (at most two), and the other's Crown drains as fast. Equal voices freeze it.
 * Win favour with caravans, or take the stone with spears: every road leads to the Crown, and every
 * road can be contested. Renown no longer wins: it raises your rank, and breaks a tie.
 *
 * State: `world.crown` (saved); null until the Crown opens.
 */
export interface Crown {
  /** The Kingstone's site id, or 0 before the star has fallen. */
  siteId: number;
  /** Progress per player, 0..BALANCE.crownNeed. */
  progress: number[];
  /** Who keeps the Kingstone right now: a player id, NO_OWNER (vacant), or -2 (contested). */
  keeper: number;
  /** Highest quarter (0..4) each player has reached, so each milestone is announced once. */
  quarter: number[];
  /** Voices each player holds (recomputed each second; read by the HUD and the bots). */
  voices: number[];
}

export const CONTESTED = -2;

export function newCrown(siteId: number, players: number): Crown {
  return { siteId, progress: new Array(players).fill(0), keeper: NO_OWNER, quarter: new Array(players).fill(0), voices: new Array(players).fill(0) };
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

/** Voices a player holds: steadings that stand with them, and the Kingstone if they keep it alone. */
export function voicesHeld(world: World, owner: number): number {
  let n = 0;
  for (const s of world.sites) if (s.st && s.st.ally === owner) n++;
  if (world.crown && world.crown.keeper === owner) n += BALANCE.kingstoneVoices;
  return n;
}

/** Whether the keeper's Kingstone is tended by a manned Stockade (one more point a second). */
function tendedBy(world: World, owner: number): boolean {
  return watchers(world).some((w) => w.owner === owner && w.tended);
}

/** Crown points a second a player gains (positive) or loses (negative) right now. */
export function crownPace(world: World, owner: number): number {
  const c = world.crown;
  if (!c || world.tick < BALANCE.crownOpens) return 0;
  const v = c.voices;
  const mine = v[owner] ?? 0;
  const best = Math.max(0, ...v.filter((_, o) => o !== owner));
  if (mine === best) return 0;
  const diff = Math.min(BALANCE.crownDiffCap, Math.abs(mine - best));
  const rate = diff * BALANCE.crownRate + (mine > best && c.keeper === owner && tendedBy(world, owner) ? BALANCE.crownTended : 0);
  return mine > best ? rate : -diff * BALANCE.crownRate;
}

/** Percent full (0..100) for a player. */
export const crownPct = (world: World, owner: number) => (world.crown ? Math.min(100, Math.floor((world.crown.progress[owner] * 100) / BALANCE.crownNeed)) : 0);

/** Seconds until a player fills the Crown at the current pace (Infinity if they are not gaining). */
export function crownEta(world: World, owner: number): number {
  const c = world.crown;
  const pace = crownPace(world, owner);
  if (!c || pace <= 0) return Infinity;
  return Math.ceil((BALANCE.crownNeed - c.progress[owner]) / pace);
}

/** The leading player on the Crown (ties by renown), or NO_OWNER before it exists. */
export function crownLeader(world: World): number {
  const c = world.crown;
  if (!c) return NO_OWNER;
  return [...world.players].sort((a, b) => c.progress[b.id] - c.progress[a.id] || b.renown - a.renown || a.id - b.id)[0].id;
}

/** Once a second: who keeps the stone, who holds the valley, and who fills the Crown. */
export function updateCrown(world: World): void {
  const c = world.crown;
  if (!c || world.tick % TICK_HZ !== 0) return;
  const site = crownSite(world);
  if (site) {
    const w = watchers(world);
    const keeper = w.length === 1 ? w[0].owner : w.length > 1 ? CONTESTED : NO_OWNER;
    if (keeper !== c.keeper) {
      const was = c.keeper;
      c.keeper = keeper;
      world.emit({ type: 'crownKeeper', keeper, was, x: site.x, y: site.y });
    }
  }
  for (const p of world.players) c.voices[p.id] = voicesHeld(world, p.id);
  if (world.tick < BALANCE.crownOpens) return;
  for (const p of world.players) {
    const pace = crownPace(world, p.id);
    if (pace) c.progress[p.id] = Math.max(0, Math.min(BALANCE.crownNeed, c.progress[p.id] + pace));
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
