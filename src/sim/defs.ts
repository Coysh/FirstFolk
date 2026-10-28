import { BALANCE, secs } from './balance';

export type Good = 'logs' | 'stone' | 'berries' | 'planks' | 'fish';
export const GOODS: readonly Good[] = ['logs', 'planks', 'stone', 'berries', 'fish'];
/** Goods settlers eat, in the order they reach for them. */
export const FOODS: readonly Good[] = ['berries', 'fish'];

export type NodeKind = 'tree' | 'rock' | 'bush' | 'fish';

export type BuildingType = 'wagon' | 'woodcutter' | 'forester' | 'quarry' | 'forager' | 'fisher' | 'hut' | 'lookout' | 'sawpit' | 'storehouse';

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
  /** Land claimed (radius in tiles) when finished; claimed land is final. */
  claim?: number;
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
    reveal: 14,
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

export const BUILD_MENU: BuildingType[] = ['woodcutter', 'forager', 'quarry', 'forester', 'hut', 'lookout', 'fisher', 'sawpit', 'storehouse'];

export const GOOD_INFO: Record<Good, { name: string; icon: string }> = {
  logs: { name: 'Logs', icon: '🪵' },
  planks: { name: 'Planks', icon: '🟫' },
  stone: { name: 'Stone', icon: '🪨' },
  berries: { name: 'Berries', icon: '🫐' },
  fish: { name: 'Fish', icon: '🐟' },
};

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

export const DISCOVERIES: Record<DiscoveryKind, { name: string; icon: string; blurb: string }> = {
  cart: { name: 'Abandoned Cart', icon: '🛞', blurb: 'A broken-down cart, still loaded with supplies.' },
  ruins: { name: 'Old Ruins', icon: '🏛️', blurb: 'Carvings left by an older folk. Studying them teaches everyone a craft.' },
  wanderers: { name: 'Wanderers’ Camp', icon: '⛺', blurb: 'A skilled family camping in the wilds, looking for a place to belong.' },
  grove: { name: 'Berry Grove', icon: '🫐', blurb: 'A sheltered meadow thick with laden bushes.' },
  oakwood: { name: 'Old-Growth Oakwood', icon: '🌳', blurb: 'Ancient trees that each give three logs.' },
  outcrop: { name: 'Rich Outcrop', icon: '🪨', blurb: 'Deep seams of stone that take an age to work out.' },
  stones: { name: 'Standing Stones', icon: '🗿', blurb: 'A ring of old stones. Folk feel braver near them, and the land around becomes yours.' },
};
