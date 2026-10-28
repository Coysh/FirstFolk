import type { BuildingType } from './defs';
import { tierOf } from './trades';
import type { PlayerState, World } from './world';

/**
 * A settlement's calling is what it has become, not something it picked: the way it is built and
 * the way it lives add up, quietly, and the town's character follows. A town of storehouses and
 * stalls becomes a trading town; one of quarries and Great Works a mason's hold; towers and
 * garrisons a stronghold; fields, fish and full cradles a hearth. The leading calling is
 * recognised at three tiers, and each tier changes what the town can do (and shows on the hall).
 * Nothing is stored but the current calling; the scores are read off the town as it stands.
 */
export type CallingId = 'trader' | 'masons' | 'stronghold' | 'hearth';
export const CALLING_IDS: CallingId[] = ['trader', 'masons', 'stronghold', 'hearth'];

export interface CallingDef {
  id: CallingId;
  name: string;
  icon: string;
  /** What the town is called at each tier. */
  titles: [string, string, string];
  /** Colour of its banner on the hall. */
  color: number;
  /** How it is earned, in a line. */
  earned: string;
  /** What each tier grants (cumulative), one line each. */
  perks: [string, string, string];
}

export const CALLINGS: Record<CallingId, CallingDef> = {
  trader: {
    id: 'trader',
    name: 'Merchants',
    icon: '⚖️',
    titles: ['Market Town', 'Trading Town', 'Free Port'],
    color: 0x2e86c1,
    earned: 'Storehouses, the Great Granary and goods sold',
    perks: ['Goods sell for 20% more', 'Sells for 40% more, and the market recovers twice as fast', 'Sells for 60% more, and the market recovers three times as fast'],
  },
  masons: {
    id: 'masons',
    name: 'Masons',
    icon: '⛏️',
    titles: ['Quarry Town', 'Mason’s Hold', 'Citadel of Works'],
    color: 0x8c8478,
    earned: 'Quarries, sawpits and Great Works',
    perks: ['Great Works cost 15% less and pay 50 more renown; stone and timber work 8% faster', 'Cost 30% less, pay 100 more; 16% faster', 'Cost 45% less, pay 150 more; 24% faster'],
  },
  stronghold: {
    id: 'stronghold',
    name: 'Wardens',
    icon: '🛡️',
    titles: ['Garrison Town', 'Stronghold', 'Fortress'],
    color: 0xc0392b,
    earned: 'Towers, stockades, the hall, raids won and repelled',
    perks: ['Guards fight 10% harder and eat a third less; raid spoils +25%', 'Guards 20% harder, eat two thirds less; spoils +50%; hold one more post', 'Guards 30% harder and eat no extra; spoils +75%; hold two more posts'],
  },
  hearth: {
    id: 'hearth',
    name: 'Hearthfolk',
    icon: '🌾',
    titles: ['Farmstead', 'Hearth Town', 'Harvest Hall'],
    color: 0x3f8a4a,
    earned: 'Foragers, fishers, homes and a well-fed town',
    perks: ['Gatherers 8% faster, births 10% sooner, a little renown for a fed town; two more hands answer a Rally', '16% faster, 20% sooner, more renown; four more hands answer a Rally', '24% faster, 30% sooner, the most renown; six more hands answer a Rally'],
  },
};

/** Score thresholds for tiers 1, 2 and 3. */
export const CALLING_TIERS = [10, 22, 40] as const;
/** A new calling takes over only when it leads the current one by this much (percent), so identity never flickers. */
const TAKEOVER_PCT = 130;
/** …and a calling is recognised only when it leads the runner-up by this much. */
const CLEAR_PCT = 115;

export type CallingScores = Record<CallingId, number>;

function counts(world: World, owner: number): (t: BuildingType) => number {
  const n: Partial<Record<BuildingType, number>> = {};
  for (const b of world.buildings.values()) if (b.owner === owner && b.done) n[b.type] = (n[b.type] ?? 0) + 1;
  return (t) => n[t] ?? 0;
}

/** What the town has become, read off the town as it stands. */
export function callingScores(world: World, owner: number): CallingScores {
  const p = world.players[owner];
  const c = counts(world, owner);
  if (!p) return { trader: 0, masons: 0, stronghold: 0, hearth: 0 };
  const works = c('henge') + c('meadhall') + c('granary');
  return {
    trader: 3 * c('storehouse') + 6 * c('granary') + Math.floor(p.sold / 40),
    masons: 3 * c('quarry') + 2 * c('sawpit') + 7 * works + 3 * tierOf(p.crafts.stonework) + 2 * tierOf(p.crafts.woodcraft),
    stronghold: 3 * (c('watchtower') + c('stockade')) + c('lookout') + c('outpost') + 6 * c('musterhall') + 3 * p.raidsWon + 2 * p.repelled,
    hearth: 2 * (c('forager') + c('fisher')) + c('hut') + 2 * c('longhouse') + 3 * tierOf(p.crafts.husbandry) + (p.hungry ? 0 : Math.floor(world.population(owner) / 10)),
  };
}

/** Which calling leads, and at what tier (0 if none is clear yet), given the one the town already has. */
export function leadingCalling(scores: CallingScores, current: CallingId | ''): { id: CallingId | ''; tier: number } {
  const ranked = CALLING_IDS.map((id) => ({ id, v: scores[id] })).sort((a, b) => b.v - a.v);
  const [first, second] = ranked;
  let id: CallingId | '' = current;
  if (!current || scores[current] < CALLING_TIERS[0]) id = first.v >= CALLING_TIERS[0] && first.v * 100 >= second.v * CLEAR_PCT ? first.id : '';
  else if (first.id !== current && first.v * 100 >= scores[current] * TAKEOVER_PCT) id = first.id;
  if (!id) return { id: '', tier: 0 };
  const v = scores[id];
  return { id, tier: v >= CALLING_TIERS[2] ? 3 : v >= CALLING_TIERS[1] ? 2 : v >= CALLING_TIERS[0] ? 1 : 0 };
}

/** Re-read every town's calling (every couple of seconds), announcing a change. */
export function updateCallings(world: World): void {
  for (const p of world.players) {
    const next = leadingCalling(callingScores(world, p.id), p.calling.id);
    if (next.id === p.calling.id && next.tier === p.calling.tier) continue;
    const was = p.calling;
    p.calling = next;
    world.emit({ type: 'calling', owner: p.id, calling: next.id, tier: next.tier, was: was.id, wasTier: was.tier });
  }
}

/** The tier of a calling the town holds right now (0 if it holds another, or none). */
export function callingTier(world: World, owner: number, id: CallingId): number {
  const c = world.players[owner]?.calling;
  return c && c.id === id ? c.tier : 0;
}

export const emptyCalling = (): PlayerState['calling'] => ({ id: '', tier: 0 });

/** "Trading Town", "Fortress", or '' for a town that hasn't found its calling yet. */
export function callingTitle(c: PlayerState['calling']): string {
  return c.id && c.tier ? CALLINGS[c.id].titles[c.tier - 1] : '';
}

