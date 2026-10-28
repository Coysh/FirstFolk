import { BALANCE, secs } from './balance';

export type Good = 'logs' | 'stone' | 'berries' | 'planks' | 'fish';
export const GOODS: readonly Good[] = ['logs', 'planks', 'stone', 'berries', 'fish'];
/** Goods settlers eat, in the order they reach for them. */
export const FOODS: readonly Good[] = ['berries', 'fish'];

export type NodeKind = 'tree' | 'rock' | 'bush' | 'fish';

export type BuildingType = 'wagon' | 'woodcutter' | 'forester' | 'quarry' | 'forager' | 'fisher' | 'hut' | 'longhouse' | 'lookout' | 'watchtower' | 'sawpit' | 'storehouse' | 'outpost' | 'henge' | 'meadhall' | 'granary';

export type Tool = 'axe' | 'pick' | 'basket' | 'hammer' | 'shovel' | 'saw';

/** Skills settlers learn by working; trades (see trades.ts) are tiers of these. */
export type Skill = 'woodcraft' | 'stonework' | 'husbandry';
export const SKILLS: readonly Skill[] = ['woodcraft', 'stonework', 'husbandry'];

export interface GatherJob {
  kind: 'gather';
  node: NodeKind;
  good: Good;
  radius: number;
  workTicks: number;
  tool: Tool;
  skill: Skill;
  /** Worker pauses when this many goods wait for pickup. */
  outputCap: number;
}

export interface PlantJob {
  kind: 'plant';
  radius: number;
  workTicks: number;
  tool: Tool;
  skill: Skill;
}

/** Turns an input good delivered by porters into an output good at the workplace. */
export interface ProcessJob {
  kind: 'process';
  input: Good;
  good: Good;
  workTicks: number;
  tool: Tool;
  skill: Skill;
  inputCap: number;
  outputCap: number;
  /** Leave at least this many of the input in storage for construction. */
  reserve: number;
}

export type JobDef = GatherJob | PlantJob | ProcessJob;

export interface BuildingDef {
  type: BuildingType;
  name: string;
  icon: string;
  blurb: string;
  cost: Partial<Record<Good, number>>;
  buildTicks: number;
  /** Footprint is size×size tiles; the entrance is the tile just south of the footprint's left column. */
  size: number;
  housing?: number;
  storage?: boolean;
  job?: JobDef;
  buildable: boolean;
  /** Locked until a settler reaches this trade tier (see trades.ts). */
  requires?: { skill: Skill; tier: number };
  /** Locked until the settlement reaches this rank (1 Hamlet, 2 Village, 3 Town). */
  rank?: number;
  /**
   * Influence radius (tiles) when finished. Land goes to whoever's influence is strongest,
   * so borders push and pull; land nobody contests stays with its holder.
   */
  claim?: number;
  /** Influence strength at the centre (falls to 0 at the edge of `claim`). Default 60. */
  power?: number;
  /** Towers: a builder family's Wanderlust widens their reach, and each one makes the next dearer. */
  frontier?: boolean;
  /** Builders who can work on the site at once (default 1). */
  crew?: number;
  /**
   * Great Works: one of each in the whole valley. The first settlement to finish it gets the
   * renown and the perk; anyone else's site is abandoned.
   */
  great?: { renown: number; perk: string };
  /** Fog lifted (radius in tiles) when finished. */
  reveal?: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  wagon: {
    type: 'wagon',
    name: 'Founders’ Wagon',
    icon: '🛒',
    blurb: 'Your first storehouse and the founding family’s camp.',
    cost: {},
    buildTicks: 1,
    size: 2,
    housing: 6,
    storage: true,
    buildable: false,
    claim: 11,
    power: 100,
    reveal: 15,
  },
  woodcutter: {
    type: 'woodcutter',
    name: 'Woodcutter',
    icon: '🪓',
    blurb: 'Fells nearby trees for logs. Its woodcutter grows into a Carpenter.',
    cost: { logs: 3 },
    buildTicks: secs(7),
    size: 2,
    job: { kind: 'gather', node: 'tree', good: 'logs', radius: 9, workTicks: BALANCE.treeFellTicks, tool: 'axe', skill: 'woodcraft', outputCap: 6 },
    buildable: true,
  },
  forager: {
    type: 'forager',
    name: 'Forager',
    icon: '🫐',
    blurb: 'Gathers berries to feed the settlement.',
    cost: { logs: 3 },
    buildTicks: secs(7),
    size: 2,
    job: { kind: 'gather', node: 'bush', good: 'berries', radius: 9, workTicks: BALANCE.pickTicks, tool: 'basket', skill: 'husbandry', outputCap: 8 },
    buildable: true,
  },
  fisher: {
    type: 'fisher',
    name: 'Fisher',
    icon: '🐟',
    blurb: 'Nets fish from rivers and lakes. Shoals never run dry. Needs a Journeyman Gatherer.',
    cost: { logs: 4 },
    buildTicks: secs(8),
    size: 2,
    job: { kind: 'gather', node: 'fish', good: 'fish', radius: 8, workTicks: secs(3), tool: 'basket', skill: 'husbandry', outputCap: 8 },
    buildable: true,
    requires: { skill: 'husbandry', tier: 1 },
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    icon: '⛏️',
    blurb: 'Breaks stone from nearby outcrops. Its quarrier grows into a Mason.',
    cost: { logs: 4 },
    buildTicks: secs(9),
    size: 2,
    job: { kind: 'gather', node: 'rock', good: 'stone', radius: 9, workTicks: BALANCE.mineTicks, tool: 'pick', skill: 'stonework', outputCap: 6 },
    buildable: true,
  },
  forester: {
    type: 'forester',
    name: 'Forester',
    icon: '🌱',
    blurb: 'Plants saplings so the woods never run out.',
    cost: { logs: 3 },
    buildTicks: secs(7),
    size: 2,
    job: { kind: 'plant', radius: 6, workTicks: BALANCE.plantTicks, tool: 'shovel', skill: 'woodcraft' },
    buildable: true,
  },
  hut: {
    type: 'hut',
    name: 'Family Hut',
    icon: '🛖',
    blurb: 'A home for one family. Empty homes attract newcomers when food is plentiful.',
    cost: { logs: 5, stone: 2 },
    buildTicks: secs(12),
    size: 2,
    housing: 4,
    buildable: true,
    claim: 4,
    power: 30,
  },
  lookout: {
    type: 'lookout',
    name: 'Lookout',
    icon: '🗼',
    blurb: 'Pushes your border outwards and reveals the land beyond. Build near the edge to reach discoveries.',
    // Logs only: expansion must never deadlock when the stone runs out.
    cost: { logs: 5 },
    buildTicks: secs(10),
    size: 2,
    buildable: true,
    claim: 8,
    power: 60,
    frontier: true,
    reveal: 14,
  },
  watchtower: {
    type: 'watchtower',
    name: 'Watchtower',
    icon: '🏰',
    blurb: 'A tall stone-footed tower that claims far more land and sees across the valley. Needs a Hamlet.',
    cost: { planks: 4, stone: 4 },
    buildTicks: secs(14),
    size: 2,
    buildable: true,
    rank: 1,
    claim: 12,
    power: 100,
    frontier: true,
    reveal: 20,
  },
  longhouse: {
    type: 'longhouse',
    name: 'Longhouse',
    icon: '🏠',
    blurb: 'A great timber hall where one family can grow to eight. Needs a Village.',
    cost: { planks: 6, stone: 4, logs: 4 },
    buildTicks: secs(16),
    size: 2,
    housing: 8,
    buildable: true,
    rank: 2,
    claim: 5,
    power: 40,
  },
  outpost: {
    type: 'outpost',
    name: 'Outpost',
    icon: '🏕️',
    blurb: 'A camp raised in the wilds by an Expedition: it holds the land around it.',
    cost: {},
    buildTicks: 1,
    size: 2,
    buildable: false,
    claim: 7,
    power: 70,
    reveal: 12,
  },
  henge: {
    type: 'henge',
    name: 'The Stone Circle',
    icon: '🗿',
    blurb: 'A Great Work: a ring of raised stones. Only one in the valley: race to finish it first.',
    cost: { stone: 80, planks: 12 },
    buildTicks: secs(75),
    size: 3,
    crew: 6,
    buildable: true,
    rank: 2,
    claim: 10,
    power: 120,
    reveal: 14,
    great: { renown: 100, perk: 'Landmarks you hold pay half as much renown again.' },
  },
  meadhall: {
    type: 'meadhall',
    name: 'The Mead Hall',
    icon: '🍺',
    blurb: 'A Great Work: a carved hall where the houses feast. Only one in the valley: race to finish it first.',
    cost: { planks: 40, logs: 40, stone: 15 },
    buildTicks: secs(75),
    size: 3,
    crew: 6,
    buildable: true,
    rank: 2,
    claim: 12,
    power: 140,
    reveal: 14,
    great: { renown: 100, perk: 'Family deeds recharge 30% faster.' },
  },
  granary: {
    type: 'granary',
    name: 'The Great Granary',
    icon: '🌾',
    blurb: 'A Great Work: a raised store for the whole valley’s harvest. Only one in the valley: race to finish it first.',
    cost: { planks: 25, stone: 30, berries: 40 },
    buildTicks: secs(75),
    size: 3,
    crew: 6,
    buildable: true,
    rank: 2,
    storage: true,
    claim: 10,
    power: 120,
    reveal: 14,
    great: { renown: 100, perk: 'Winter loses its bite: no extra hunger, no slower building, and bushes keep fruiting.' },
  },
  sawpit: {
    type: 'sawpit',
    name: 'Sawpit',
    icon: '🪚',
    blurb: 'Saws logs into planks, keeping 6 logs in store for building. Needs a Journeyman Carpenter.',
    cost: { logs: 4, stone: 2 },
    buildTicks: secs(9),
    size: 2,
    job: { kind: 'process', input: 'logs', good: 'planks', workTicks: secs(4), tool: 'saw', skill: 'woodcraft', inputCap: 3, outputCap: 6, reserve: 6 },
    buildable: true,
    requires: { skill: 'woodcraft', tier: 1 },
  },
  storehouse: {
    type: 'storehouse',
    name: 'Storehouse',
    icon: '🏚️',
    blurb: 'A second store, so carriers walk less. Needs a Journeyman Mason.',
    cost: { planks: 4, stone: 4 },
    buildTicks: secs(12),
    size: 2,
    storage: true,
    buildable: true,
    requires: { skill: 'stonework', tier: 1 },
  },
};

export const BUILD_MENU: BuildingType[] = ['woodcutter', 'forager', 'quarry', 'forester', 'hut', 'lookout', 'fisher', 'sawpit', 'storehouse', 'watchtower', 'longhouse', 'henge', 'meadhall', 'granary'];

export const GREAT_WORKS: BuildingType[] = ['henge', 'meadhall', 'granary'];

export const GOOD_INFO: Record<Good, { name: string; icon: string }> = {
  logs: { name: 'Logs', icon: '🪵' },
  planks: { name: 'Planks', icon: '🟫' },
  stone: { name: 'Stone', icon: '🪨' },
  berries: { name: 'Berries', icon: '🫐' },
  fish: { name: 'Fish', icon: '🐟' },
};

/** Settlement ranks, earned by completing the scenario's chapters (AoE-style age-ups). */
export const RANK_NAMES = ['Camp', 'Hamlet', 'Village', 'Town'] as const;

export function costTotal(cost: Partial<Record<Good, number>>): number {
  let n = 0;
  for (const g of GOODS) n += cost[g] ?? 0;
  return n;
}

/** Output good for a building's job (what porters collect from it), if any. */
export function outputGood(type: BuildingType): Good | undefined {
  const job = BUILDINGS[type].job;
  return job && job.kind !== 'plant' ? job.good : undefined;
}

/** Points of interest hidden in the fog. Whoever's border covers one first claims it. */
export type DiscoveryKind = 'cart' | 'ruins' | 'wanderers' | 'grove' | 'oakwood' | 'outcrop' | 'stones';

export interface DiscoveryDef {
  name: string;
  icon: string;
  blurb: string;
  /**
   * Landmarks are held, not spent: whoever's land covers one earns this much renown a minute,
   * and loses it when a rival's influence pushes the border over it.
   */
  renown?: number;
  /** A held landmark radiates influence of its own (radius, power), so it is easier to keep. */
  aura?: [number, number];
}

export const DISCOVERIES: Record<DiscoveryKind, DiscoveryDef> = {
  cart: { name: 'Abandoned Cart', icon: '🛞', blurb: 'A broken-down cart, still loaded with supplies.' },
  ruins: { name: 'Old Ruins', icon: '🏛️', blurb: 'Carvings left by an older folk. Studying them teaches everyone a craft.' },
  wanderers: { name: 'Wanderers’ Camp', icon: '⛺', blurb: 'A skilled family camping in the wilds, looking for a place to belong.' },
  grove: { name: 'Berry Grove', icon: '🫐', blurb: 'A sheltered meadow thick with laden bushes. A landmark: renown while you hold it.', renown: 2 },
  oakwood: { name: 'Old-Growth Oakwood', icon: '🌳', blurb: 'Ancient trees that each give three logs. A landmark: renown while you hold it.', renown: 2 },
  outcrop: { name: 'Rich Outcrop', icon: '🪨', blurb: 'Deep seams of stone that take an age to work out. A landmark: renown while you hold it.', renown: 4 },
  stones: { name: 'Standing Stones', icon: '🗿', blurb: 'A ring of old stones. The land around them follows whoever holds them. A great landmark.', renown: 5, aura: [7, 70] },
};
