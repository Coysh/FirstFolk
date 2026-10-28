import type { Good } from './defs';

/**
 * The folk who already live in the valley. Each valley holds four steadings (two mirrored pairs),
 * each a different kind of people; you win them with what your town makes, and the Crown fills
 * for whoever holds more of them (see steadings.ts and crown.ts). Content is data: a new people
 * is one more row here, plus a model id in the renderer.
 */
export interface SteadingChar {
  id: string;
  /** "Quarrymen", "Beekeepers": shown as "Hollin's Beekeepers". */
  people: string;
  icon: string;
  /** What a steading sworn to you sends to your nearest store every minute. */
  gift: Good;
  giftN: number;
  blurb: string;
  /** What they ask for: [good, min, max] a Want may name (never what they make themselves). */
  wants: [Good, number, number][];
}

export const STEADING_CHARS: SteadingChar[] = [
  { id: 'quarrymen', people: 'Quarrymen', icon: '⛏️', gift: 'stone', giftN: 6, blurb: 'Hardy folk of the rock who send stone, but never have enough timber.', wants: [['planks', 14, 22], ['logs', 24, 36], ['berries', 24, 36]] },
  { id: 'beekeepers', people: 'Beekeepers', icon: '🐝', gift: 'berries', giftN: 8, blurb: 'Keepers of hives and orchards who send berries, and want things built.', wants: [['planks', 14, 22], ['stone', 14, 22], ['logs', 24, 36]] },
  { id: 'woodwrights', people: 'Woodwrights', icon: '🪚', gift: 'planks', giftN: 5, blurb: 'Sawyers and wheelwrights who send planks, and are always short of food.', wants: [['berries', 24, 36], ['fish', 20, 30], ['stone', 14, 22]] },
  { id: 'fisherfolk', people: 'Fisherfolk', icon: '🎣', gift: 'fish', giftN: 8, blurb: 'Net-menders of the water who send fish, and need timber for their boats.', wants: [['logs', 24, 36], ['planks', 14, 22], ['stone', 14, 22]] },
  { id: 'charcoalers', people: 'Charcoal-burners', icon: '🔥', gift: 'logs', giftN: 10, blurb: 'Smoke-stained folk of the deep wood who send logs, and want stone and bread.', wants: [['stone', 14, 22], ['berries', 24, 36], ['fish', 20, 30]] },
];
export const STEADING_CHAR: Record<string, SteadingChar> = Object.fromEntries(STEADING_CHARS.map((c) => [c.id, c]));

/** Headmen and hamlets, for names like "Hollin's Beekeepers". */
const HEADMEN = ['Hollin', 'Aldred', 'Wystan', 'Edda', 'Osric', 'Maud', 'Godric', 'Thora', 'Leofric', 'Brenna'];
export const steadingName = (char: string, k: number) => `${HEADMEN[k % HEADMEN.length]}'s ${STEADING_CHAR[char]?.people ?? 'Steading'}`;
