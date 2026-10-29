import { BALANCE } from './balance';
import { BUILDINGS, FOODS, FOOD_VALUE, GOODS, costTotal, outputGood, type BuildingType, type DiscoveryKind, type Good, type NodeKind, type Skill, type Tool } from './defs';
import { Terrain, generateMap, isWalkableTerrain, type MapData } from './mapgen';
import { PathFinder } from './path';
import { Rng } from './rng';
import type { Command } from './commands';
import { applyCommand } from './commands';
import { updateLogistics } from './logistics';
import { updateSettler, assignJobs } from './settlers';
import { TIER_XP } from './trades';
import { updatePopulation, createFamily } from './population';
import { evaluateScenario, SCENARIOS, type Scenario, type ScenarioState } from './scenario';
import { DIFFICULTY, type Difficulty, type Rules } from './rules';
import { NO_OWNER, onBuildingComplete, recomputeTerritory, updateExploration } from './territory';
import { updateRenown, type RenownSource } from './renown';
import type { DeedId } from './deeds';
import { updateProsperity } from './prosperity';
import { initSteadings, updateCaravans, updateSteadings, type Caravan, type SteadingState } from './steadings';
import { emptyCalling, updateCallings, callingTier, type CallingId } from './callings';
import { updateBridges, type Bridge } from './bridges';
import { updateCrown, type Crown } from './crown';
import { updateScouts, type Scout } from './scouts';
import { updateSaga } from './saga';
import { updateHappenings } from './happenings';
import { FOUNDING_HOUSES, offerHouse, playerMod, seatHouse, updateHouses, type HouseId, type HouseOffer, type Mod, type Seat } from './houses';
import { ORIGINS, rivalOrigin, type Dynasty, type OriginId } from './origins';
import { hasOmen, type OmenId } from './omens';
import { unlocksFor } from './trades';
import { isWinter, updateSeasons, type Season } from './seasons';
import { updateValleyEvents } from './events';
import { OpeningBot } from './ai/openingBot';
import { styleOf, type BotStyle } from './ai/styles';
import { updateReavers, updateWarbands, type Warband } from './warfare';

export type Stock = Record<Good, number>;
export const emptyStock = (): Stock => ({ logs: 0, planks: 0, stone: 0, berries: 0, fish: 0, grain: 0, bread: 0, ale: 0, ore: 0, tools: 0 });
export type Skills = Record<Skill, number>;
export const emptySkills = (): Skills => ({ woodcraft: 0, stonework: 0, husbandry: 0 });

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  amount: number;
  max: number;
  /** Ticks until a sapling is grown (trees only); 0 when mature. */
  growth: number;
  /** Ticks until a felled stump disappears; 0 when not a stump. */
  stump: number;
  /** Ticks until the next berry regrows. */
  regrow: number;
  reservedBy: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  owner: number;
  x: number;
  y: number;
  done: boolean;
  /** Construction work done / needed (work units). */
  work: number;
  workNeeded: number;
  delivered: Stock;
  incoming: Stock;
  /** Storage contents, or finished output waiting for pickup. */
  stock: Stock;
  /** Units of `stock` already promised to a porter. */
  reserved: Stock;
  workerId: number;
  builderId: number;
  familyId: number;
  status: string;
  /** Short machine-readable problem for status bubbles ('' when fine). */
  alert: BuildingAlert;
  /** Trade tier the workplace has been transformed to (never decreases). */
  tier: number;
  /** Family of the settler who finished building it (0 = none). */
  builtBy: number;
  /** Extra influence radius (a Wanderlust builder's towers reach further). */
  reach: number;
  /** Materials this building costs (frontier towers get dearer the more you have). */
  cost: Partial<Record<Good, number>>;
  /** Guards counted for its influence: rises at once, falls one at a time (see territory.ts). */
  guarded: number;
}

export interface Discovery {
  id: number;
  kind: DiscoveryKind;
  x: number;
  y: number;
  /** Bitmask of players who have seen it. */
  revealed: number;
  /** Owner who first claimed it (and got its reward), or -1. */
  claimedBy: number;
  /** Landmarks: who holds it now (follows the border), or -1. */
  heldBy: number;
  /** Steadings only (see steadings.ts): the people, favour, Want and allegiance. */
  st?: SteadingState;
}

export type BuildingAlert = '' | 'noWorker' | 'noResource' | 'full' | 'noInput' | 'materials';

export interface Family {
  id: number;
  owner: number;
  surname: string;
  color: number;
  homeId: number;
  /** Ticks until the family can next have a child. */
  birthCooldown: number;
  /** Families this household was founded from by marriage. */
  parents: number[];
}

export type Job =
  | { kind: 'idle'; wait: number }
  | { kind: 'arrive' }
  | { kind: 'work'; buildingId: number; phase: 'toBuilding' | 'seek' | 'toNode' | 'harvest' | 'return' | 'rest' | 'process' | 'deliver'; nodeId: number; tile: number; extra: number }
  | { kind: 'build'; siteId: number; phase: 'toSite' | 'build' }
  | { kind: 'haul'; good: Good; fromId: number; toId: number; phase: 'toSource' | 'toDest' }
  /** Standing watch at a guard post ('away' while marching with a warband). */
  | { kind: 'guard'; buildingId: number; phase: 'toPost' | 'watch' | 'away' };

export interface Settler {
  id: number;
  owner: number;
  familyId: number;
  name: string;
  child: boolean;
  /** Age in ticks. */
  age: number;
  x: number;
  y: number;
  /** Tile index being walked towards, or -1 when standing still. */
  next: number;
  progress: number;
  stepLen: number;
  path: number[];
  job: Job;
  /** Ticks left on the current timed action (working / waiting). */
  busy: number;
  carry: Good | null;
  tool: Tool | null;
  anim: 'idle' | 'walk' | 'work';
  /** Tile the settler faces while working, or -1. */
  faceTile: number;
  /** Husband or wife (0 = unmarried). */
  spouseId: number;
}

export type SimEvent =
  | { type: 'treeFelled'; x: number; y: number }
  | { type: 'rockMined'; x: number; y: number; depleted: boolean }
  | { type: 'saplingPlanted'; x: number; y: number }
  | { type: 'buildingPlaced'; owner: number; id: number; buildingType: BuildingType }
  | { type: 'calling'; owner: number; calling: CallingId | ''; tier: number; was: CallingId | ''; wasTier: number }
  | { type: 'bridgePlaced'; owner: number; id: number; x: number; y: number }
  | { type: 'bridgeBuilt'; owner: number; id: number; x: number; y: number; len: number }
  | { type: 'buildingComplete'; owner: number; id: number; buildingType: BuildingType }
  | { type: 'familyApproaching'; owner: number; familyId: number; surname: string; size: number; skill: Skill }
  | { type: 'born'; owner: number; settlerId: number; name: string; surname: string }
  | { type: 'hungry'; owner: number }
  | { type: 'fed'; owner: number }
  | { type: 'objectiveComplete'; owner: number; label: string }
  | { type: 'chapterComplete'; owner: number; chapter: string; next: string }
  /** A settlement's craft reaches a new tier (see trades.ts). */
  | { type: 'craftUp'; owner: number; skill: Skill; tier: number }
  | { type: 'unlocked'; owner: number; buildingType: BuildingType }
  | { type: 'produced'; owner: number; buildingId: number; good: Good; bonus: boolean }
  | { type: 'delivered'; owner: number; buildingId: number; good: Good }
  | { type: 'territoryGrew'; owner: number; tiles: number; x: number; y: number }
  | { type: 'discovered'; siteId: number; kind: DiscoveryKind; owner: number }
  | { type: 'claimed'; siteId: number; kind: DiscoveryKind; owner: number; text: string }
  | { type: 'rumour'; siteId: number; kind: DiscoveryKind; owner: number; dir: string }
  | { type: 'houseOffered'; owner: number; offerId: number; reason: string }
  | { type: 'houseSeated'; owner: number; house: HouseId; surname: string }
  | { type: 'married'; owner: number; a: number; b: number; familyId: number; surname: string; buildingId: number }
  | { type: 'season'; season: Season }
  | { type: 'winterComing' }
  | { type: 'rankUp'; owner: number; rank: number; unlocks: BuildingType[] }
  | { type: 'valleyEvent'; owner: number; eventId: number; def: string }
  | { type: 'eventResolved'; owner: number; def: string; choice: string; text: string }
  | { type: 'familySettled'; owner: number; familyId: number; surname: string; buildingId: number }
  | { type: 'rivalSighted'; x: number; y: number }
  | { type: 'holdingChanged'; siteId: number; kind: DiscoveryKind; owner: number; from: number }
  | { type: 'landLost'; owner: number; tiles: number }
  | { type: 'renown'; owner: number; amount: number; source: RenownSource; x: number; y: number }
  | { type: 'deed'; owner: number; seat: number; house: HouseId; surname: string; deed: DeedId; x: number; y: number; text: string }
  | { type: 'clashBegan'; bandId: number; owner: number; defender: number; targetId: number; buildingType: BuildingType; x: number; y: number; attack: number; defence: number }
  | { type: 'clashRally'; owner: number; bandId: number; targetId: number; kind: 'rally' | 'surge' | 'hire'; n: number; strength: number; x: number; y: number }
  | { type: 'sagaBeat'; beat: number }
  | { type: 'scoutSent'; owner: number; x: number; y: number }
  | { type: 'scoutSpotted'; owner: number; seer: number; x: number; y: number }
  | { type: 'scoutHome'; owner: number; found: number }
  | { type: 'crownKeeper'; keeper: number; was: number; x: number; y: number }
  | { type: 'crownQuarter'; owner: number; quarter: number }
  | { type: 'hearthHeld'; owner: number; was: number }
  | { type: 'wantPosted'; siteId: number; kind: 'goods' | 'guard'; good: Good; n: number }
  | { type: 'wantWon'; siteId: number; owner: number; kind: 'goods' | 'guard'; good: Good; n: number }
  | { type: 'wantExpired'; siteId: number; kind: 'goods' | 'guard' }
  | { type: 'steadingAlly'; siteId: number; owner: number; was: number }
  | { type: 'steadingGift'; siteId: number; owner: number; good: Good; n: number }
  | { type: 'caravanSent'; owner: number; siteId: number; good: Good; n: number }
  | { type: 'caravanArrived'; owner: number; siteId: number; good: Good; n: number; won: boolean }
  | { type: 'caravanHome'; owner: number; good?: Good; n?: number }
  | { type: 'freeze'; on: boolean }
  | { type: 'caravanWaylaid'; owner: number; siteId: number; good: Good; n: number; x: number; y: number }
  | { type: 'homesLevel'; owner: number; level: number; was: number }
  | { type: 'starfall'; siteId: number; x: number; y: number }
  | { type: 'workBegun'; owner: number; buildingType: BuildingType }
  | { type: 'workLost'; owner: number; buildingType: BuildingType; winner: number }
  | { type: 'raidLaunched'; owner: number; defender: number; targetId: number; buildingType: BuildingType; x: number; y: number; strength: number; eta: number }
  | { type: 'raidResolved'; owner: number; defender: number; won: boolean; buildingType: BuildingType; x: number; y: number; attack: number; defence: number; renown: number }
  | { type: 'razed'; owner: number; id: number; buildingType: BuildingType; x: number; y: number }
  | { type: 'victory'; scenario: string; winner: number; byTime: boolean; crowned?: boolean; acclaim?: boolean };

export interface PlayerState {
  id: number;
  hungry: boolean;
  mealAccum: number;
  newcomerCooldown: number;
  /** Cumulative goods gathered/produced, for objectives and stats. */
  produced: Stock;
  /** Buildings unlocked through trades. */
  unlocked: BuildingType[];
  /** Discoveries claimed. */
  claimed: number;
  /** Tick after which a rumour reveals the next discovery (if none is in sight). */
  rumourAt: number;
  /** The Great Houses on the council (see houses.ts), their summed passives, and a seat on offer. */
  seats: Seat[];
  mods: Partial<Record<Mod, number>>;
  houseOffer: HouseOffer | null;
  /** Winters survived. */
  winters: number;
  /** Settlement rank: 0 Camp, 1 Hamlet, 2 Village, 3 Town. */
  rank: number;
  /** The valley event awaiting a choice (see events.ts), and when the next one comes. */
  event: { id: number; def: string; expires: number; data: number[] } | null;
  nextEventAt: number;
  lastEvent: string;
  /** Story events already told to this settlement (they come once). */
  onceEvents: string[];
  /** Has this player's exploration reached another settlement's land yet? */
  rivalSeen: boolean;
  /** The score (see renown.ts), where it came from, and payout remainders. */
  renown: number;
  renownBy: Partial<Record<RenownSource, number>>;
  renownFrac: [number, number, number];
  /** What the town has become (see callings.ts): re-read every couple of seconds. */
  calling: { id: CallingId | ''; tier: number };
  /** Landmarks taken from another settlement. */
  taken: number;
  /** Goods this settlement has carried to steadings by caravan (the Merchants calling reads it). */
  caravanned: number;
  /** Half a loaf left over from a meal (a loaf feeds two). */
  breadCredit: number;
  /** Consecutive checks the homes' upkeep could not be paid (see prosperity.ts). */
  homeLack: number;
  /** How well the homes live: 0 huts, 1 cottages (bread and ale on the tables), 2 hall-houses (and tools). See prosperity.ts. */
  homeLevel: number;
  /** Families build their own huts when there's room and timber (see population.ts). */
  autoHomes: boolean;
  /** The furthest this player has trailed the leader in renown (for comeback honours). */
  maxDeficit: number;
  /** Temporary influence (festivals and the like). */
  boosts: { x: number; y: number; r: number; p: number; until: number }[];
  /** Ancient legends (from barrow mounds): each makes the settlement better at a craft, for good. */
  legends: Legend[];
  /** The settlement's crafts: XP from all work, shared by everyone (see trades.ts). */
  crafts: Skills;
  /** Founding origin ('' when the founders chose a boon instead). */
  origin: OriginId | '';
  /** Deed effects running until a tick. */
  buffs: { timber: number; harvest: number };
  deedsUsed: number;
  /** How this settlement's bot plays when one runs it (the rival; see ai/styles.ts). */
  style: BotStyle;
  /** Raids (see warfare.ts): when the huscarls can march again, raids won, raids driven off. */
  raidReady: number;
  /** When this settlement can rally a besieged post again (see warfare.ts). */
  rallyReady: number;
  /** When this settlement's scout can go out again (see scouts.ts). */
  scoutReady: number;
  /** The War-Horn has sounded: the next raid strikes half as hard again. */
  warhorn: boolean;
  /** A Shield Wall raised by the House of the Shield. */
  shieldWall: { x: number; y: number; until: number } | null;
  raidsWon: number;
  repelled: number;
}

export interface Legend {
  name: string;
  surname: string;
  skill: Skill;
  tick: number;
}

export interface WorldStats {
  firstLogsTick: number;
  idleAdultTicks: number;
  adultTicks: number;
  completions: { type: BuildingType; tick: number }[];
  arrivals: number[];
  lastEventTick: number;
  longestQuiet: number;
  /** Gaps between "major" beats: discoveries, unlocks, tier-ups, chapters, arrivals. */
  lastMajorTick: number;
  longestMajorGap: number;
  firstDiscoveryTick: number;
}

export interface WorldOptions {
  seed: number;
  size?: number;
  scenario?: Scenario | string;
  difficulty?: Difficulty;
  /** Skip initial setup (used when restoring a save). */
  blank?: boolean;
  /** The player's founding origin (see origins.ts); without one, the founders choose a boon at 0:00. */
  origin?: OriginId;
  /** With origin 'dynasty': the house carried over from a won valley. */
  dynasty?: Dynasty;
  /** Rule twists for this valley (see omens.ts). */
  omens?: OmenId[];
  /** A tag for special games, e.g. 'daily-20261028'. */
  label?: string;
  /** The rival's personality (balance harness); by default it follows the rival's origin. */
  rivalStyle?: BotStyle;
  /** "Watch a valley": both towns are played by bots (the player's side gets this style). */
  spectate?: BotStyle;
}

export class World {
  readonly seed: number;
  readonly map: MapData;
  readonly size: number;
  readonly rng: Rng;
  readonly scenario: Scenario;
  readonly difficulty: Difficulty;
  readonly rules: Rules;
  tick = 0;
  nextId = 1;

  nodes = new Map<number, ResourceNode>();
  /** Node id per tile (0 = none). */
  nodeAt: Int32Array;
  buildings = new Map<number, Building>();
  /** Building id whose footprint covers each tile (0 = none). */
  buildingAt: Int32Array;
  settlers = new Map<number, Settler>();
  families = new Map<number, Family>();

  players: PlayerState[] = [];
  /** Bumps whenever resource nodes change, so renderers can rebuild instances lazily. */
  natureVersion = 0;
  pendingCommands: Command[] = [];
  commandLog: { tick: number; cmd: Command }[] = [];
  events: SimEvent[] = [];
  scenarioState: ScenarioState = { done: [], winner: -1 };
  stats: WorldStats = {
    firstLogsTick: -1,
    idleAdultTicks: 0,
    adultTicks: 0,
    completions: [],
    arrivals: [],
    lastEventTick: 0,
    longestQuiet: 0,
    lastMajorTick: 0,
    longestMajorGap: 0,
    firstDiscoveryTick: -1,
  };
  /** Owner per tile (-1 = unclaimed). */
  territory: Int8Array;
  /** Per-tile bitmask of players who have explored it. */
  explored: Uint8Array;
  territoryVersion = 0;
  fogVersion = 0;
  sites: Discovery[] = [];
  /** Bridges (saved), and the deck map built from them: 1 = walkable plank, 2 = planned (see bridges.ts). */
  bridges: Bridge[] = [];
  deck: Uint8Array;
  /** Caches for the bridge search (see bridges.ts): the shoreline, and each owner's reach from home. */
  shoreCache: Int32Array | null = null;
  bridgeReach: ({ version: number; seen: Uint8Array } | undefined)[] = [];
  /** Caravans on the road to steadings (see steadings.ts). */
  caravans: Caravan[] = [];
  /** How many beats of the valley's story have been told (see saga.ts). */
  saga = 0;
  /** Scouts out across the fog (see scouts.ts). */
  scouts: Scout[] = [];
  /** The Crown (see crown.ts): null until it opens. */
  crown: Crown | null = null;
  /** Raiding parties on the march (see warfare.ts), and when reavers next come ashore. */
  warbands: Warband[] = [];
  nextReaversAt = BALANCE.reaversFrom;
  /** Set while a raid burns a post, so landmarks it frees don't also pay the seizing prize. */
  quietSeize = false;
  /** AI players (the rival), driven through Commands exactly like a human. */
  ais: OpeningBot[] = [];
  /** Bumps when buildings are added or removed (runtime only, for path caches). */
  buildingsVersion = 0;
  reachCache: { version: number; seen: Uint8Array } | null = null;
  /** Runtime cache for territoryBox(); not saved. */
  boxCache: { version: number; box: { x0: number; y0: number; x1: number; y1: number } }[] = [];

  readonly pathfinder: PathFinder;
  readonly omens: OmenId[];
  readonly label: string;

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    this.omens = opts.omens ?? [];
    this.label = opts.label ?? '';
    this.scenario = typeof opts.scenario === 'string' ? SCENARIOS[opts.scenario] : (opts.scenario ?? SCENARIOS.landfall);
    this.difficulty = opts.difficulty ?? 'normal';
    this.rules = DIFFICULTY[this.difficulty];
    this.map = generateMap(opts.seed, opts.size);
    this.size = this.map.size;
    this.rng = new Rng(opts.seed);
    this.nodeAt = new Int32Array(this.size * this.size);
    this.buildingAt = new Int32Array(this.size * this.size);
    this.deck = new Uint8Array(this.size * this.size);
    this.territory = new Int8Array(this.size * this.size).fill(NO_OWNER);
    this.explored = new Uint8Array(this.size * this.size);
    this.pathfinder = new PathFinder(this.size, (i) => this.walkable(i), 12000, (a, b) => this.sameRegion(a, b));

    if (opts.blank) return;
    const seams = hasOmen(this, 'richSeams') ? 2 : 1;
    for (const n of this.map.nodes) this.addNode(n.kind, n.x, n.y, 0, n.kind === 'rock' ? (n.max ?? BALANCE.rockStone) * seams : n.max);
    for (const { char: _c, ...site } of this.map.sites) this.sites.push({ id: this.newId(), ...site, revealed: 0, claimedBy: NO_OWNER, heldBy: NO_OWNER });
    initSteadings(this, this.map.sites.map((s) => s.char));
    this.setupPlayer(0, this.map.starts[0], opts.origin, opts.dynasty);
    if (this.scenario.rival) this.addRival(opts.rivalStyle);
    if (opts.spectate) {
      this.players[0].style = opts.spectate;
      this.ais.push(new OpeningBot(0, this.rules.rivalThink, 0, opts.spectate));
    }
  }

  // ---- geometry helpers -------------------------------------------------

  idx(x: number, y: number): number {
    return y * this.size + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  /** 1 where water or a mountain stands between lands (a finished bridge deck is not a barrier); see territory.ts. */
  barrierMap: Uint8Array | null = null;
  barriers(): Uint8Array {
    if (this.barrierMap) return this.barrierMap;
    const b = new Uint8Array(this.size * this.size);
    for (let i = 0; i < b.length; i++) b[i] = !isWalkableTerrain(this.map.terrain[i]) && this.deck[i] !== 1 ? 1 : 0;
    return (this.barrierMap = b);
  }

  /** Connected regions of walkable ground (buildings ignored), rebuilt when a bridge opens a new way. */
  regionLabels: Int32Array | null = null;
  private buildRegions(): Int32Array {
    const labels = new Int32Array(this.size * this.size);
    let next = 0;
    const stack: number[] = [];
    for (let s = 0; s < labels.length; s++) {
      if (labels[s] || !this.walkableGround(s)) continue;
      labels[s] = ++next;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % this.size;
        for (const j of [x + 1 < this.size ? i + 1 : -1, x > 0 ? i - 1 : -1, i + this.size, i - this.size]) {
          if (j < 0 || j >= labels.length || labels[j] || !this.walkableGround(j)) continue;
          labels[j] = next;
          stack.push(j);
        }
      }
    }
    return (this.regionLabels = labels);
  }
  /** Can anyone walk from a to b at all? (Ground only: a building in the way can still block a path.) */
  sameRegion(a: number, b: number): boolean {
    if (this.iceOk) return true;
    const labels = this.regionLabels ?? this.buildRegions();
    return !labels[a] || !labels[b] || labels[a] === labels[b];
  }

  /** Winter has frozen the water: every river and lake is walkable ice (see seasons.ts). Derived from the tick, never saved. */
  frozen = false;
  /** Ground a person can stand on: dry land, or a finished bridge deck. Settlers never use the ice: it is for the long road. */
  walkableGround(i: number): boolean {
    return isWalkableTerrain(this.map.terrain[i]) || this.deck[i] === 1;
  }
  /** Set while a route is planned over the ice. */
  private iceOk = false;
  /** Freeze or thaw the water (see seasons.ts). */
  setFrozen(on: boolean): void {
    this.frozen = on;
  }
  /**
   * A route for the folk who travel the long road (carts, scouts, warbands): in winter the frozen water
   * is a road too, so a ford is no longer the only way across. Settlers at their daily work still keep to the land.
   */
  findRoute(from: number, to: number): number[] | null {
    if (!this.frozen) return this.pathfinder.find(from, to);
    const dry = this.pathfinder.find(from, to);
    if (dry) return dry;
    this.iceOk = true;
    try {
      return this.pathfinder.find(from, to);
    } finally {
      this.iceOk = false;
    }
  }
  /** Can a cart, scout or warband get from a to b right now (over the ice if it is winter)? */
  routeOpen(a: number, b: number): boolean {
    return this.frozen || this.sameRegion(a, b);
  }
  walkable(i: number): boolean {
    return (this.walkableGround(i) || (this.iceOk && this.map.terrain[i] === Terrain.Water)) && this.buildingAt[i] === 0;
  }
  cornerHeight(x: number, y: number): number {
    return this.map.heights[y * (this.size + 1) + x];
  }
  entrance(b: { type: BuildingType; x: number; y: number }): { x: number; y: number } {
    return { x: b.x, y: b.y + BUILDINGS[b.type].size };
  }
  entranceIdx(b: Building): number {
    const e = this.entrance(b);
    return this.idx(e.x, e.y);
  }
  settlerTile(s: Settler): number {
    return this.idx(s.x, s.y);
  }

  newId(): number {
    return this.nextId++;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    const mine = !('owner' in e) || e.owner === 0 || (e.type === 'holdingChanged' && e.from === 0);
    if (e.type !== 'hungry' && e.type !== 'fed' && mine) {
      this.stats.longestQuiet = Math.max(this.stats.longestQuiet, this.tick - this.stats.lastEventTick);
      this.stats.lastEventTick = this.tick;
    }
    if (MAJOR_EVENTS.has(e.type) && mine) {
      this.stats.longestMajorGap = Math.max(this.stats.longestMajorGap, this.tick - this.stats.lastMajorTick);
      this.stats.lastMajorTick = this.tick;
      if (e.type === 'discovered' && this.stats.firstDiscoveryTick < 0) this.stats.firstDiscoveryTick = this.tick;
    }
  }

  /** Remove and return all events emitted since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---- entities ---------------------------------------------------------

  addNode(kind: NodeKind, x: number, y: number, growth = 0, maxOverride?: number): ResourceNode {
    const max = maxOverride ?? (kind === 'tree' ? BALANCE.treeLogs : kind === 'rock' ? BALANCE.rockStone : kind === 'fish' ? BALANCE.shoalFish : BALANCE.bushBerries);
    const node: ResourceNode = {
      id: this.newId(),
      kind,
      x,
      y,
      amount: growth > 0 ? 0 : max,
      max,
      growth,
      stump: 0,
      regrow: 0,
      reservedBy: 0,
    };
    this.nodes.set(node.id, node);
    this.nodeAt[this.idx(x, y)] = node.id;
    this.natureVersion++;
    return node;
  }

  removeNode(node: ResourceNode): void {
    this.nodes.delete(node.id);
    if (this.nodeAt[this.idx(node.x, node.y)] === node.id) this.nodeAt[this.idx(node.x, node.y)] = 0;
    this.natureVersion++;
  }

  addBuilding(type: BuildingType, owner: number, x: number, y: number, done = false): Building {
    const def = BUILDINGS[type];
    const b: Building = {
      id: this.newId(),
      type,
      owner,
      x,
      y,
      done,
      work: done ? 1 : 0,
      workNeeded: done ? 1 : Math.round((def.buildTicks * BALANCE.buildRate * BALANCE.buildTimePct) / 100),
      delivered: emptyStock(),
      incoming: emptyStock(),
      stock: emptyStock(),
      reserved: emptyStock(),
      workerId: 0,
      builderId: 0,
      familyId: 0,
      status: done ? '' : 'Waiting for materials',
      alert: done ? '' : 'materials',
      tier: 0,
      builtBy: 0,
      reach: 0,
      cost: this.buildCost(owner, type),
      guarded: 0,
    };
    this.buildings.set(b.id, b);
    this.buildingsVersion++;
    for (let dy = 0; dy < def.size; dy++)
      for (let dx = 0; dx < def.size; dx++) {
        const i = this.idx(x + dx, y + dy);
        this.buildingAt[i] = b.id;
        const nodeId = this.nodeAt[i];
        if (nodeId) {
          const node = this.nodes.get(nodeId);
          if (node) this.removeNode(node);
        }
      }
    return b;
  }

  addSettler(owner: number, familyId: number, name: string, ageYears: number, x: number, y: number): Settler {
    const age = Math.round(ageYears * BALANCE.yearTicks);
    const s: Settler = {
      id: this.newId(),
      owner,
      familyId,
      name,
      child: age < comeOfAgeTicks(),
      age,
      x,
      y,
      next: -1,
      progress: 0,
      stepLen: 1000,
      path: [],
      job: { kind: 'idle', wait: 0 },
      busy: 0,
      carry: null,
      tool: null,
      anim: 'idle',
      faceTile: -1,
      spouseId: 0,
    };
    this.settlers.set(s.id, s);
    return s;
  }

  private setupPlayer(owner: number, start: { x: number; y: number }, originId?: OriginId, dynasty?: Dynasty): void {
    this.players[owner] = { id: owner, hungry: false, mealAccum: 0, newcomerCooldown: 0, produced: emptyStock(), unlocked: [], claimed: 0, rumourAt: BALANCE.rumourDelay, seats: [], mods: {}, houseOffer: null, winters: 0, rank: 0, event: null, nextEventAt: BALANCE.firstEvent, lastEvent: '', onceEvents: [], rivalSeen: false, renown: 0, renownBy: {}, renownFrac: [0, 0, 0], calling: emptyCalling(), taken: 0, maxDeficit: 0, caravanned: 0, breadCredit: 0, homeLevel: 0, homeLack: 0, autoHomes: false, boosts: [], legends: [], crafts: emptySkills(), buffs: { timber: 0, harvest: 0 }, deedsUsed: 0, origin: originId ?? '', style: 'balanced', raidReady: 0, rallyReady: 0, scoutReady: 0, raidsWon: 0, repelled: 0, warhorn: false, shieldWall: null };
    const wagon = this.addBuilding('wagon', owner, start.x - 1, start.y - 1, true);
    onBuildingComplete(this, wagon);
    for (const g of GOODS) wagon.stock[g] = Math.round((BALANCE.startStock[g] ?? 0) * this.rules.startStock);
    const fam = createFamily(this, owner, wagon.id, dynasty?.surname);
    wagon.familyId = fam.id;
    const e = this.entrance(wagon);
    const origin = originId ? ORIGINS[originId] : null;
    // Founders: two adults and two children (more for Kinfolk), the elder of whom comes of age within the first few minutes.
    const ages = [2, 2.2, 1.0, 0.6, 0.4, 0.2].slice(0, 4 + (origin?.children ?? 0));
    const folk = ages.map((age, i) => this.addSettler(owner, fam.id, this.randomName(), age, e.x + (i % 2) - 1 + (i > 1 ? 2 : 0), e.y + (i > 1 ? 1 : 0)));
    folk[0].spouseId = folk[1].id;
    folk[1].spouseId = folk[0].id;
    if (!origin) {
      // The very first choice: which house founds the settlement?
      offerHouse(this, owner, 'Who leads your founders?', FOUNDING_HOUSES);
      return;
    }
    // An origin is that choice made before the clock starts: a founding house, a craft, supplies.
    for (const g of GOODS) wagon.stock[g] += origin.stock[g] ?? 0;
    const skill = dynasty ? dynasty.skill : origin.skill;
    seatHouse(this, owner, dynasty ? dynasty.house : origin.house);
    if (skill) {
      // The founders arrive skilled in their craft (a dynasty a little more with each generation).
      this.players[owner].crafts[skill] = TIER_XP[1] + (dynasty ? Math.min(4, dynasty.generation - 1) * 150 : 0);
      for (const t of unlocksFor(skill, 1)) this.players[owner].unlocked.push(t);
    }
  }

  /** Player 1 at the mirrored start, played by the bot at a difficulty-set pace. */
  addRival(style?: BotStyle): void {
    if (!this.players[1]) {
      this.setupPlayer(1, this.map.starts[1], this.players[0]?.origin ? rivalOrigin(this.seed) : undefined);
      const rival = this.players[1] as PlayerState;
      rival.style = style ?? styleOf(rival.origin);
    }
    const think = hasOmen(this, 'restless') ? Math.round((this.rules.rivalThink * 3) / 40) * 10 : this.rules.rivalThink;
    this.ais = [new OpeningBot(1, think, this.tick, this.players[1].style)];
  }

  randomName(): string {
    return this.rng.pick(FIRST_NAMES);
  }

  // ---- queries ----------------------------------------------------------

  storages(owner: number): Building[] {
    const out: Building[] = [];
    for (const b of this.buildings.values()) if (b.owner === owner && b.done && BUILDINGS[b.type].storage) out.push(b);
    return out;
  }

  /** Goods in storage (excluding producer output waiting for pickup). */
  stored(owner: number, good: Good): number {
    let n = 0;
    for (const b of this.storages(owner)) n += b.stock[good];
    return n;
  }

  /** All edible goods in storage. */
  food(owner: number): number {
    let n = 0;
    for (const g of FOODS) n += this.stored(owner, g) * (FOOD_VALUE[g] ?? 1);
    return n;
  }

  /** One food good at the gatherers' huts, waiting for carriers (not reserved for a haul). */
  waiting(owner: number, good: Good): number {
    let n = 0;
    for (const b of this.buildings.values()) {
      if (b.owner !== owner || !b.done || BUILDINGS[b.type].storage || outputGood(b.type) !== good) continue;
      n += Math.max(0, b.stock[good] - b.reserved[good]);
    }
    return n;
  }

  /**
   * Food the town can actually eat: what is in the stores plus what gatherers have piled up at their
   * huts. A starving town must never sit beside a full basket just because the carriers are busy.
   */
  larder(owner: number): number {
    let n = this.food(owner);
    for (const g of FOODS) n += this.waiting(owner, g) * (FOOD_VALUE[g] ?? 1);
    return n + (this.players[owner]?.breadCredit ?? 0);
  }

  /** Mouths to feed: everyone, with guards on a post counting extra (see BALANCE.guardAppetitePct). */
  eaters(owner: number): number {
    let n = 0;
    for (const s of this.settlers.values()) if (s.owner === owner) n += s.job.kind === 'guard' ? 1 + (BALANCE.guardAppetitePct * (3 - callingTier(this, owner, 'stronghold'))) / 300 : 1;
    return Math.round(n);
  }

  population(owner: number): number {
    let n = 0;
    for (const s of this.settlers.values()) if (s.owner === owner) n++;
    return n;
  }

  housing(owner: number): number {
    let n = 0;
    const level = this.players[owner]?.homeLevel ?? 0;
    for (const b of this.buildings.values()) if (b.owner === owner && b.done) n += (BUILDINGS[b.type].housing ?? 0) + (b.type === 'wagon' || !BUILDINGS[b.type].housing ? 0 : level);
    return n;
  }

  /**
   * What a new building of this type costs a player. Every frontier building you already have
   * (Lookouts, Watchtowers and Outposts together) adds a quarter to a tower's price: borders
   * are pushed with care, not spam.
   */
  buildCost(owner: number, type: BuildingType): Partial<Record<Good, number>> {
    const def = BUILDINGS[type];
    if (type === 'stockade') {
      // The House of the Shield builds stockades cheaply.
      const pct = 100 - playerMod(this, owner, 'stockade');
      const out: Partial<Record<Good, number>> = {};
      for (const g of GOODS) if (def.cost[g]) out[g] = Math.ceil((def.cost[g]! * pct) / 100);
      return out;
    }
    if (def.great) {
      // Masons build the Great Works for less.
      const pct = 100 - 15 * callingTier(this, owner, 'masons');
      const out: Partial<Record<Good, number>> = {};
      for (const g of GOODS) if (def.cost[g]) out[g] = Math.ceil((def.cost[g]! * pct) / 100);
      return out;
    }
    if (!def.frontier) return { ...def.cost };
    const pct = 100 + BALANCE.towerCostPct * this.frontierCount(owner);
    const out: Partial<Record<Good, number>> = {};
    for (const g of GOODS) if (def.cost[g]) out[g] = Math.ceil((def.cost[g]! * pct) / 100);
    return out;
  }

  /** How many frontier buildings this settlement's rank lets it hold. */
  frontierCap(owner: number): number {
    // A stronghold holds more posts: one at the second tier of the Wardens' calling, two at the third.
    return BALANCE.frontierCap[Math.min(BALANCE.frontierCap.length - 1, this.players[owner]?.rank ?? 0)] + Math.max(0, callingTier(this, owner, 'stronghold') - 1);
  }

  /** Frontier buildings a player has, standing or under way: towers, outposts and stockades. */
  frontierCount(owner: number): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === owner && BUILDINGS[b.type].capped) n++;
    return n;
  }

  canAffordBuilding(owner: number, type: BuildingType): boolean {
    return Object.entries(this.buildCost(owner, type)).every(([g, n]) => this.stored(owner, g as Good) >= (n ?? 0));
  }

  /** Does this player hold a landmark of this kind right now? */
  holds(owner: number, kind: DiscoveryKind): boolean {
    return this.sites.some((s) => s.kind === kind && s.heldBy === owner);
  }

  /** Does this player own a finished Great Work of this type? */
  hasWork(owner: number, type: BuildingType): boolean {
    for (const b of this.buildings.values()) if (b.owner === owner && b.type === type && b.done) return true;
    return false;
  }

  /** Winter's bite (hunger, slow building) is lifted by the Great Granary. */
  winterBites(owner: number): boolean {
    return isWinter(this) && !this.hasWork(owner, 'granary');
  }

  countBuildings(owner: number, type: BuildingType, includeSites = false): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === owner && b.type === type && (b.done || includeSites)) n++;
    return n;
  }

  /** Construction materials still needed for a site. */
  siteNeeds(b: Building, good: Good): number {
    return (b.cost[good] ?? 0) - b.delivered[good] - b.incoming[good];
  }

  /** Work allowed so far given delivered materials (construction rises as goods arrive). */
  siteWorkAllowed(b: Building): number {
    const cost = b.cost;
    const total = costTotal(cost);
    if (total === 0) return b.workNeeded;
    let delivered = 0;
    for (const g of GOODS) delivered += Math.min(b.delivered[g], cost[g] ?? 0);
    return Math.floor((b.workNeeded * delivered) / total);
  }

  // ---- simulation -------------------------------------------------------

  enqueue(cmd: Command): void {
    this.pendingCommands.push(cmd);
  }

  step(): void {
    for (const ai of this.ais) ai.update(this);
    updateBridges(this);
    if (this.tick % 20 === 7) updateCallings(this);
    if (this.tick % 20 === 9) updateSaga(this);
    if (this.tick % 100 === 35) updateProsperity(this);
    for (const cmd of this.pendingCommands) {
      this.commandLog.push({ tick: this.tick, cmd });
      applyCommand(this, cmd);
    }
    this.pendingCommands.length = 0;
    updateWarbands(this);
    updateCrown(this);
    updateScouts(this);
    updateCaravans(this);

    updateSeasons(this);
    if (this.tick % 10 === 0) this.updateNature();
    if (this.tick % 20 === 15) {
      recomputeTerritory(this);
    }
    if (this.tick % BALANCE.renownTick === 55) updateRenown(this);
    if (this.tick % 10 === 5) {
      updateExploration(this);
      updateHappenings(this);
      updateSteadings(this);
      updateReavers(this);
      updateHouses(this);
      updateValleyEvents(this);
    }
    if (this.tick % 5 === 0) {
      assignJobs(this);
      updateLogistics(this);
    }
    for (const s of this.settlers.values()) updateSettler(this, s);
    updatePopulation(this);
    if (this.tick % 10 === 0) this.updateAges();
    if (this.tick % 10 === 0) evaluateScenario(this);

    for (const s of this.settlers.values()) {
      if (s.child) continue;
      this.stats.adultTicks++;
      if (s.job.kind === 'idle') this.stats.idleAdultTicks++;
    }
    this.tick++;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Children grow up (folk no longer age past that: the town is the story, not its people). */
  private updateAges(): void {
    const adult = comeOfAgeTicks();
    for (const s of this.settlers.values()) {
      if (!s.child) continue;
      s.age += 10;
      if (s.age >= adult) s.child = false;
    }
  }

  isUnlocked(owner: number, type: BuildingType): boolean {
    const def = BUILDINGS[type];
    if (def.rank && this.players[owner].rank < def.rank) return false;
    return !def.requires || this.players[owner].unlocked.includes(type);
  }

  private granaryLand(node: ResourceNode): boolean {
    const t = this.territory[this.idx(node.x, node.y)];
    return t >= 0 && this.hasWork(t, 'granary');
  }

  private updateNature(): void {
    // Berry bushes sleep through winter; fish keep swimming.
    const winter = isWinter(this);
    for (const node of this.nodes.values()) {
      if (node.kind === 'tree') {
        if (node.growth > 0) {
          node.growth = Math.max(0, node.growth - 10);
          if (node.growth === 0) {
            node.amount = node.max;
            this.natureVersion++;
          }
        } else if (node.stump > 0) {
          node.stump = Math.max(0, node.stump - 10);
          if (node.stump === 0) this.removeNode(node);
        }
      } else if ((node.kind === 'fish' || (node.kind === 'bush' && (!winter || this.granaryLand(node)))) && node.amount < node.max) {
        node.regrow -= 10;
        if (node.regrow <= 0) {
          node.amount++;
          node.regrow = node.kind === 'fish' ? BALANCE.fishRegrowTicks : berryRegrow(this);
          this.natureVersion++;
        }
      }
    }
  }
}

const MAJOR_EVENTS = new Set<SimEvent['type']>(['raidLaunched', 'raidResolved', 'wantPosted', 'wantWon', 'steadingAlly', 'caravanArrived', 'homesLevel', 'starfall', 'crownKeeper', 'crownQuarter', 'hearthHeld', 'deed', 'craftUp', 'workBegun', 'holdingChanged', 'rivalSighted', 'discovered', 'rumour', 'houseOffered', 'houseSeated', 'married', 'season', 'rankUp', 'valleyEvent', 'claimed', 'unlocked', 'chapterComplete', 'familyApproaching', 'familySettled']);

/** Ticks for a berry to regrow (a Bountiful Valley halves it). */
export const berryRegrow = (w: World) => (hasOmen(w, 'bountiful') ? BALANCE.berryRegrowTicks / 2 : BALANCE.berryRegrowTicks);

export const comeOfAgeTicks = () => Math.round(BALANCE.comeOfAgeYears * BALANCE.yearTicks);

/** Each settler's own span of years (deterministic from their id): somewhere in a year and a half. */

export const FIRST_NAMES = [
  'Alfric', 'Edith', 'Osric', 'Hilda', 'Wulf', 'Edyth', 'Godwin', 'Mildred', 'Oswin', 'Elfgiva',
  'Bertha', 'Cuthbert', 'Leofwin', 'Wynn', 'Sigrid', 'Ulf', 'Astrid', 'Bjorn', 'Aldith', 'Eadric',
  'Freya', 'Hereward', 'Ingrid', 'Leofric', 'Maud', 'Odo', 'Rowena', 'Sweyn', 'Thora', 'Wilfred',
];
