import { BALANCE, secs } from './balance';

export type Good = 'logs' | 'stone' | 'berries' | 'planks' | 'fish' | 'grain' | 'bread' | 'ale' | 'ore' | 'tools';
export const GOODS: readonly Good[] = ['logs', 'planks', 'stone', 'berries', 'fish', 'grain', 'bread', 'ale', 'ore', 'tools'];
/** The goods the first town works with; the rest arrive with farms and forges (shown in the top bar once produced). */
export const BASIC_GOODS: readonly Good[] = ['logs', 'planks', 'stone', 'berries', 'fish'];
/** Goods settlers eat, in the order they reach for them. */
export const FOODS: readonly Good[] = ['bread', 'berries', 'fish'];
/** Meals in one unit of a food: a loaf feeds two. */
export const FOOD_VALUE: Partial<Record<Good, number>> = { bread: 2 };

export type NodeKind = 'tree' | 'rock' | 'bush' | 'fish';

export type BuildingType = 'wagon' | 'woodcutter' | 'forester' | 'quarry' | 'forager' | 'fisher' | 'hut' | 'longhouse' | 'lookout' | 'watchtower' | 'stockade' | 'musterhall' | 'sawpit' | 'storehouse' | 'outpost' | 'henge' | 'meadhall' | 'granary' | 'farm' | 'bakehouse' | 'brewhouse' | 'mine' | 'smithy' | 'hamlet';

export type Tool = 'axe' | 'pick' | 'basket' | 'hammer' | 'shovel' | 'saw' | 'spear';

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
  /** What porters bring to it; a farm or a mine works with none. */
  input?: Good;
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
  /** Counts against the settlement's frontier cap (towers, outposts and stockades). */
  capped?: boolean;
  /**
   * Guard posts. From Hamlet a post's influence follows its garrison: unmanned it pushes with
   * half its power and a shorter reach, so every banner needs a spear behind it.
   */
  garrison?: number;
  /** Strength (and radius) it adds to the defence of your buildings around it. */
  defence?: [number, number];
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
    capped: true,
    garrison: 1,
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
    capped: true,
    garrison: 2,
    // Its stone footing: harder to burn than a timber lookout.
    defence: [0, 10],
    reveal: 20,
  },
  musterhall: {
    type: 'musterhall',
    name: 'Mustering Hall',
    icon: '⚔️',
    blurb: 'Where huscarls drill. Send them to raid a rival tower, outpost or stockade: if they are stronger than its defenders it burns, and its land is open again. At home they turn out to defend any post close by. Needs a Hamlet; raids begin at 10:00.',
    cost: { planks: 8, logs: 10, stone: 6 },
    buildTicks: secs(16),
    size: 2,
    buildable: true,
    rank: 1,
    garrison: 4,
    reveal: 8,
  },
  hamlet: {
    type: 'hamlet',
    name: 'Daughter Hamlet',
    icon: '🏘️',
    blurb: 'Found a second hall far from the first. It claims wide land, homes eight, stores goods like a storehouse and lets your folk hold four more towers. The founding feast takes ale and the new folk take tools. It needs guards, 16 tiles of room from your other halls, and each one costs more. Needs a Village.',
    cost: { logs: 30, planks: 20, stone: 20, ale: 8, tools: 6 },
    buildTicks: secs(24),
    size: 2,
    housing: 8,
    storage: true,
    buildable: true,
    rank: 2,
    claim: 10,
    power: 90,
    garrison: 2,
    reveal: 14,
  },
  stockade: {
    type: 'stockade',
    name: 'Stockade',
    icon: '🛡️',
    blurb: 'A ring of sharpened stakes around a guardhouse. It claims little land but holds it hard, and its three guards shield your buildings nearby. Build one by a landmark to keep it. Needs a Hamlet.',
    cost: { logs: 10, stone: 6 },
    buildTicks: secs(14),
    size: 2,
    buildable: true,
    rank: 1,
    claim: 6,
    power: 110,
    capped: true,
    garrison: 3,
    defence: [7, 20],
    reveal: 10,
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
    capped: true,
    garrison: 1,
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
  farm: {
    type: 'farm',
    name: 'Farm',
    icon: '🌾',
    blurb: 'Fields of wheat tended by a farming family. Grain is for the bakehouse and the brewhouse. Needs a Journeyman Gatherer.',
    cost: { logs: 5, planks: 2 },
    buildTicks: secs(10),
    size: 2,
    job: { kind: 'process', good: 'grain', workTicks: secs(6), tool: 'basket', skill: 'husbandry', inputCap: 0, outputCap: 8, reserve: 0 },
    buildable: true,
    requires: { skill: 'husbandry', tier: 1 },
  },
  bakehouse: {
    type: 'bakehouse',
    name: 'Bakehouse',
    icon: '🍞',
    blurb: 'Bakes grain into bread, and a loaf feeds two. The cure for a hungry town. Needs a Journeyman Gatherer.',
    cost: { logs: 4, planks: 3, stone: 3 },
    buildTicks: secs(11),
    size: 2,
    job: { kind: 'process', input: 'grain', good: 'bread', workTicks: secs(4), tool: 'basket', skill: 'husbandry', inputCap: 4, outputCap: 8, reserve: 0 },
    buildable: true,
    requires: { skill: 'husbandry', tier: 1 },
  },
  brewhouse: {
    type: 'brewhouse',
    name: 'Brewhouse',
    icon: '🍺',
    blurb: 'Brews grain into ale. A town with bread and ale on its tables builds cottages. From Hamlet.',
    cost: { logs: 5, planks: 4, stone: 4 },
    buildTicks: secs(12),
    size: 2,
    job: { kind: 'process', input: 'grain', good: 'ale', workTicks: secs(5), tool: 'basket', skill: 'husbandry', inputCap: 4, outputCap: 8, reserve: 0 },
    buildable: true,
    rank: 1,
  },
  mine: {
    type: 'mine',
    name: 'Mine',
    icon: '⛓️',
    blurb: 'Digs ore from the hills. Ore is for the smithy. Needs a Journeyman Mason.',
    cost: { logs: 5, planks: 3, stone: 4 },
    buildTicks: secs(12),
    size: 2,
    job: { kind: 'process', good: 'ore', workTicks: secs(8), tool: 'pick', skill: 'stonework', inputCap: 0, outputCap: 8, reserve: 0 },
    buildable: true,
    requires: { skill: 'stonework', tier: 1 },
  },
  smithy: {
    type: 'smithy',
    name: 'Smithy',
    icon: '🔨',
    blurb: 'Forges ore into tools. A town with tools builds the finest homes. From Hamlet.',
    cost: { logs: 4, planks: 4, stone: 6 },
    buildTicks: secs(13),
    size: 2,
    job: { kind: 'process', input: 'ore', good: 'tools', workTicks: secs(7), tool: 'hammer', skill: 'stonework', inputCap: 4, outputCap: 8, reserve: 0 },
    buildable: true,
    rank: 1,
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

export const BUILD_MENU: BuildingType[] = ['woodcutter', 'forager', 'quarry', 'forester', 'hut', 'lookout', 'fisher', 'sawpit', 'farm', 'bakehouse', 'storehouse', 'watchtower', 'stockade', 'brewhouse', 'mine', 'smithy', 'musterhall', 'longhouse', 'henge', 'meadhall', 'granary', 'hamlet'];

export const GREAT_WORKS: BuildingType[] = ['henge', 'meadhall', 'granary'];

export const GOOD_INFO: Record<Good, { name: string; icon: string }> = {
  grain: { name: 'Grain', icon: '🌾' },
  bread: { name: 'Bread', icon: '🍞' },
  ale: { name: 'Ale', icon: '🍺' },
  ore: { name: 'Ore', icon: '⛓️' },
  tools: { name: 'Tools', icon: '🔨' },
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
export type DiscoveryKind = 'cart' | 'ruins' | 'wanderers' | 'grove' | 'oakwood' | 'outcrop' | 'stones' | 'barrow' | 'hermit' | 'spring' | 'shrine' | 'hoard' | 'starstone' | 'kingstone' | 'steading';

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
  barrow: { name: 'Barrow Mound', icon: '⚱️', blurb: 'The grave of an ancient Master. Their legend becomes yours: your best craft grows faster for good.' },
  hermit: { name: 'Hermit’s Hut', icon: '🛖', blurb: 'An old Master living alone in the wilds, who might be persuaded to teach your town their craft.' },
  hoard: { name: 'Buried Hoard', icon: '💰', blurb: 'Silver and fine things hidden long ago. Whoever digs it up is talked of for years.' },
  spring: { name: 'Healing Spring', icon: '💧', blurb: 'Clear, warm water that draws pilgrims from far away. A landmark: renown while you hold it.', renown: 3 },
  shrine: { name: 'Forest Shrine', icon: '🕯️', blurb: 'A carved shrine deep in the woods. A landmark: renown while you hold it, and a family is blessed when you first claim it.', renown: 3 },
  starstone: { name: 'Star-Stone', icon: '☄️', blurb: 'A fallen star, still warm, between the two settlements. The richest landmark in the valley, and it pulls the land around it.', renown: 6, aura: [6, 60] },
  steading: { name: 'Steading', icon: '🏘️', blurb: 'Folk who already live here. Win their favour with what your town makes, and they will stand with you: the Crown fills for whoever holds more of the valley.' },
  kingstone: { name: 'The Kingstone', icon: '👑', blurb: 'A fallen star lit the old crowning-hill. Keep a manned post beside it, alone, and the Crown fills: the first folk to fill it rule the valley.', renown: 8 },
  stones: { name: 'Standing Stones', icon: '🗿', blurb: 'A ring of old stones. The land around them follows whoever holds them. A great landmark.', renown: 5, aura: [7, 70] },
};
