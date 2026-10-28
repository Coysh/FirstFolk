import { Rng } from './rng';
import type { BoonId } from './boons';
import type { Good, Skill } from './defs';

/**
 * Openers (Battle Drones' Blitz / Industry / Air Wing): before the clock starts you choose
 * where your founding house comes from. Each origin is a different first ten minutes: a
 * craft the founders already know (unlocking its building at once), a boon that brings a
 * deed, and a little extra in the wagon. The rival rolls one of its own.
 */
export type OriginId = 'woodfolk' | 'hillclan' | 'riverfolk' | 'wayfarers' | 'kinfolk' | 'dynasty';

export interface OriginDef {
  id: OriginId;
  name: string;
  icon: string;
  blurb: string;
  /** The founders start as Journeymen of this craft. */
  skill?: Skill;
  boons: BoonId[];
  stock: Partial<Record<Good, number>>;
  /** Extra children in the founding family. */
  children?: number;
}

export const ORIGINS: Record<OriginId, OriginDef> = {
  woodfolk: {
    id: 'woodfolk',
    name: 'Woodfolk',
    icon: '🪓',
    blurb: 'Journeyman Carpenters from the deep forest: the Sawpit from the start, Axe-Sworn, and a Timber Drive ready to call.',
    skill: 'woodcraft',
    boons: ['axeSworn'],
    stock: { logs: 10 },
  },
  hillclan: {
    id: 'hillclan',
    name: 'Hill Clan',
    icon: '⛏️',
    blurb: 'Journeyman Masons and Master Builders: a Storehouse from the start and the Raise deed to finish sites in an instant.',
    skill: 'stonework',
    boons: ['masterBuilders'],
    stock: { stone: 8 },
  },
  riverfolk: {
    id: 'riverfolk',
    name: 'River Folk',
    icon: '🐟',
    blurb: 'Journeyman Gatherers: Fishers from the start, a Bountiful harvest, and Harvest Home to fill the larder.',
    skill: 'husbandry',
    boons: ['bountiful'],
    stock: { berries: 12 },
  },
  wayfarers: {
    id: 'wayfarers',
    name: 'Wayfarers',
    icon: '🧭',
    blurb: 'Restless explorers with Wanderlust and Keen Eyes: they see further, their towers reach further, and Expeditions plant outposts far beyond the border.',
    boons: ['wanderlust', 'keenEyes'],
    stock: { logs: 8, berries: 6 },
  },
  dynasty: {
    id: 'dynasty',
    name: 'Dynasty',
    icon: '👑',
    blurb: 'Your greatest house from a valley you won, founding a new one.',
    boons: [],
    stock: { logs: 6, berries: 6 },
  },
  kinfolk: {
    id: 'kinfolk',
    name: 'Kinfolk',
    icon: '❤️',
    blurb: 'A big, warm-hearted clan: two more children, Big Hearts for many more, and Festivals that pull the border their way.',
    boons: ['bigHearts'],
    stock: { berries: 10 },
    children: 2,
  },
};

/** The five origins anyone can pick (a dynasty is earned; see `Dynasty`). */
export const ORIGIN_IDS: OriginId[] = ['woodfolk', 'hillclan', 'riverfolk', 'wayfarers', 'kinfolk'];

/**
 * A dynasty: the greatest house of a valley you won, carried into the next one (meta-progression).
 * The founders bear its name, its two finest boons and its craft; each win with it adds a generation,
 * and each generation the founders start a little more skilled.
 */
export interface Dynasty {
  surname: string;
  boons: BoonId[];
  skill: Skill | null;
  generation: number;
}

/** The rival's origin, from the seed (so a valley always has the same neighbour). */
export function rivalOrigin(seed: number): OriginId {
  return ORIGIN_IDS[new Rng(seed ^ 0x0219).int(ORIGIN_IDS.length)];
}
