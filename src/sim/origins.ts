import { Rng } from './rng';
import type { HouseId } from './houses';
import type { Good, Skill } from './defs';

/**
 * Openers (Battle Drones' Blitz / Industry / Air Wing): before the clock starts you choose
 * where your founding house comes from. Each origin is a different first ten minutes: a
 * craft the founders already know (unlocking its building at once), the Great House that takes
 * the first council seat, and a little extra in the wagon. The rival rolls one of its own.
 */
export type OriginId = 'woodfolk' | 'hillclan' | 'riverfolk' | 'wayfarers' | 'kinfolk' | 'dynasty';

export interface OriginDef {
  id: OriginId;
  name: string;
  icon: string;
  blurb: string;
  /** The founders start as Journeymen of this craft. */
  skill?: Skill;
  /** The Great House that founds the settlement (the first council seat). */
  house: HouseId;
  stock: Partial<Record<Good, number>>;
  /** Extra children in the founding family. */
  children?: number;
  /** A few words for the New Game card. */
  lead: string;
}

export const ORIGINS: Record<OriginId, OriginDef> = {
  woodfolk: {
    id: 'woodfolk',
    name: 'Woodfolk',
    icon: '🪓',
    lead: 'Planks from day one',
    blurb: 'Journeyman Carpenters from the deep forest: the Sawpit from the start, and the House of the Axe (40% faster woodcraft, Wagon Train).',
    skill: 'woodcraft',
    house: 'axe',
    stock: { logs: 10 },
  },
  hillclan: {
    id: 'hillclan',
    name: 'Hill Clan',
    icon: '⛏️',
    lead: 'Build fast, quarry deep',
    blurb: 'Journeyman Masons: a Storehouse from the start, and the House of the Hammer (build 40% faster, quarry 20% faster, Raise finishes a site at once).',
    skill: 'stonework',
    house: 'hammer',
    stock: { stone: 8 },
  },
  riverfolk: {
    id: 'riverfolk',
    name: 'River Folk',
    icon: '🐟',
    lead: 'Fish from day one',
    blurb: 'Journeyman Gatherers: Fishers from the start, and the House of the Plough (15% faster gathering, Open Hands).',
    skill: 'husbandry',
    house: 'plough',
    stock: { berries: 12 },
  },
  wayfarers: {
    id: 'wayfarers',
    name: 'Wayfarers',
    icon: '🧭',
    lead: 'Claim far and wide',
    blurb: 'Restless explorers: the House of the Horn (towers reach 3 further, folk see 4 further, Expeditions plant outposts beyond the border).',
    house: 'horn',
    stock: { logs: 16, berries: 10 },
  },
  dynasty: {
    id: 'dynasty',
    name: 'Dynasty',
    icon: '👑',
    lead: 'Your winning house returns',
    blurb: 'Your greatest house from a valley you won, founding a new one.',
    house: 'hearth',
    stock: { logs: 6, berries: 6 },
  },
  kinfolk: {
    id: 'kinfolk',
    name: 'Kinfolk',
    icon: '❤️',
    lead: 'A bigger family',
    blurb: 'A big, warm-hearted clan: another child, and the House of the Hearth (a third more births, Festivals that pull the border their way).',
    house: 'hearth',
    stock: { berries: 10 },
    children: 1,
  },
};

/** The five origins anyone can pick (a dynasty is earned; see `Dynasty`). */
export const ORIGIN_IDS: OriginId[] = ['woodfolk', 'hillclan', 'riverfolk', 'wayfarers', 'kinfolk'];

/**
 * A dynasty: the greatest house of a valley you won, carried into the next one (meta-progression).
 * The founders bear its name, its Great House and its craft; each win with it adds a generation,
 * and each generation the founders start a little more skilled.
 */
export interface Dynasty {
  surname: string;
  house: HouseId;
  skill: Skill | null;
  generation: number;
}

/** The rival's origin, from the seed (so a valley always has the same neighbour). */
export function rivalOrigin(seed: number): OriginId {
  return ORIGIN_IDS[new Rng(seed ^ 0x0219).int(ORIGIN_IDS.length)];
}
