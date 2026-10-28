import { BUILDINGS, type BuildingType, type Skill } from './defs';

/**
 * Trades replace a tech tree: settlers earn XP in a skill by working, and reaching a tier
 * transforms their workplace (model variant), their gear, and unlocks new buildings.
 * Everything here is data; the renderer maps `tier` to model variants and gear.
 */
export const TIER_XP = [0, 220, 1200] as const;
export const TIER_NAMES = ['Novice', 'Journeyman', 'Master'] as const;

export interface TradeDef {
  skill: Skill;
  name: string;
  icon: string;
  /** Title per tier, e.g. Woodcutter → Carpenter → Master Carpenter. */
  titles: [string, string, string];
  /** Work-time multiplier per tier (lower is faster). */
  speed: [number, number, number];
  /** Chance (percent) of a bonus unit per harvest, per tier. */
  bonus: [number, number, number];
  /** Short description of what each tier changes, for toasts and the info panel. */
  perks: [string, string, string];
}

export const TRADES: Record<Skill, TradeDef> = {
  woodcraft: {
    skill: 'woodcraft',
    name: 'Woodcraft',
    icon: '🪓',
    titles: ['Woodcutter', 'Carpenter', 'Master Carpenter'],
    speed: [1, 0.8, 0.65],
    bonus: [0, 10, 25],
    perks: ['', 'Sawpit unlocked: logs become planks', 'Swift felling and frequent bonus logs'],
  },
  stonework: {
    skill: 'stonework',
    name: 'Stonework',
    icon: '⛏️',
    titles: ['Quarrier', 'Mason', 'Master Mason'],
    speed: [1, 0.8, 0.65],
    bonus: [0, 10, 25],
    perks: ['', 'Storehouse unlocked: a second logistics hub', 'Swift quarrying and frequent bonus stone'],
  },
  husbandry: {
    skill: 'husbandry',
    name: 'Husbandry',
    icon: '🫐',
    titles: ['Forager', 'Gatherer', 'Master Gatherer'],
    speed: [1, 0.8, 0.65],
    bonus: [0, 15, 30],
    perks: ['', 'Faster picking and bonus berries', 'Bushes give generously'],
  },
};

export function tierOf(xp: number): number {
  return xp >= TIER_XP[2] ? 2 : xp >= TIER_XP[1] ? 1 : 0;
}

/** Progress 0..1 towards the next tier (1 at Master). */
export function tierProgress(xp: number): number {
  const t = tierOf(xp);
  if (t >= 2) return 1;
  return (xp - TIER_XP[t]) / (TIER_XP[t + 1] - TIER_XP[t]);
}

/** Buildings unlocked by reaching a given tier in a skill. */
export function unlocksFor(skill: Skill, tier: number): BuildingType[] {
  return (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => {
    const r = BUILDINGS[t].requires;
    return r && r.skill === skill && r.tier === tier;
  });
}
