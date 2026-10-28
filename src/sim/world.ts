import { BALANCE } from './balance';
import { BUILDINGS, FOODS, GOODS, SKILLS, costTotal, type BuildingType, type DiscoveryKind, type Good, type NodeKind, type Skill, type Tool } from './defs';
import { generateMap, isWalkableTerrain, type MapData } from './mapgen';
import { PathFinder } from './path';
import { Rng } from './rng';
import type { Command } from './commands';
import { applyCommand } from './commands';
import { updateLogistics } from './logistics';
import { updateSettler, assignJobs } from './settlers';
import { updatePopulation, createFamily } from './population';
import { evaluateScenario, SCENARIOS, type Scenario, type ScenarioState } from './scenario';
import { DIFFICULTY, type Difficulty, type Rules } from './rules';
import { NO_OWNER, onBuildingComplete, updateExploration } from './territory';
import { offerBoon, updateOffers, type BoonId, type Mod } from './boons';

export type Stock = Record<Good, number>;
export const emptyStock = (): Stock => ({ logs: 0, planks: 0, stone: 0, berries: 0, fish: 0 });
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
}

export interface Discovery {
  id: number;
  kind: DiscoveryKind;
  x: number;
  y: number;
  /** Bitmask of players who have seen it. */
  revealed: number;
  /** Owner who claimed it, or -1. */
  claimedBy: number;
}

export type BuildingAlert = '' | 'noWorker' | 'noResource' | 'full' | 'noInput' | 'materials';

export interface Family {
  id: number;
  owner: number;
  surname: string;
  color: number;
  homeId: number;
  /** Best XP any member has reached per skill: the family's knowledge, inherited by children. */
  skills: Skills;
  /** Ticks until the family can next have a child. */
  birthCooldown: number;
  /** Family boons (see boons.ts) and their summed effects. */
  boons: BoonId[];
  mods: Partial<Record<Mod, number>>;
  /** Families this household was founded from by marriage. */
  parents: number[];
}

export type Job =
  | { kind: 'idle'; wait: number }
  | { kind: 'arrive' }
  | { kind: 'work'; buildingId: number; phase: 'toBuilding' | 'seek' | 'toNode' | 'harvest' | 'return' | 'rest' | 'process' | 'deliver'; nodeId: number; tile: number; extra: number }
  | { kind: 'build'; siteId: number; phase: 'toSite' | 'build' }
  | { kind: 'haul'; good: Good; fromId: number; toId: number; phase: 'toSource' | 'toDest' };

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
  skills: Skills;
  /** Husband or wife (0 = unmarried). */
  spouseId: number;
}

export type SimEvent =
  | { type: 'treeFelled'; x: number; y: number }
  | { type: 'rockMined'; x: number; y: number; depleted: boolean }
  | { type: 'saplingPlanted'; x: number; y: number }
  | { type: 'buildingPlaced'; id: number; buildingType: BuildingType }
  | { type: 'buildingComplete'; id: number; buildingType: BuildingType }
  | { type: 'familyApproaching'; familyId: number; surname: string; size: number; skill: Skill }
  | { type: 'cameOfAge'; settlerId: number; name: string; surname: string }
  | { type: 'born'; settlerId: number; name: string; surname: string }
  | { type: 'hungry' }
  | { type: 'fed' }
  | { type: 'objectiveComplete'; label: string }
  | { type: 'chapterComplete'; chapter: string; next: string }
  | { type: 'tierUp'; settlerId: number; buildingId: number; skill: Skill; tier: number }
  | { type: 'unlocked'; buildingType: BuildingType }
  | { type: 'produced'; buildingId: number; good: Good; bonus: boolean }
  | { type: 'delivered'; buildingId: number; good: Good }
  | { type: 'territoryGrew'; owner: number; tiles: number; x: number; y: number }
  | { type: 'discovered'; siteId: number; kind: DiscoveryKind; owner: number }
  | { type: 'claimed'; siteId: number; kind: DiscoveryKind; owner: number; text: string }
  | { type: 'rumour'; siteId: number; kind: DiscoveryKind; owner: number; dir: string }
  | { type: 'boonOffered'; owner: number; offerId: number; familyId: number; surname: string; reason: string }
  | { type: 'boonChosen'; owner: number; familyId: number; surname: string; boon: BoonId }
  | { type: 'married'; owner: number; a: number; b: number; familyId: number; surname: string; buildingId: number }
  | { type: 'familySettled'; familyId: number; surname: string; buildingId: number }
  | { type: 'victory'; scenario: string };

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
  /** Boon choices waiting for the player. */
  offers: BoonOffer[];
}

export interface BoonOffer {
  id: number;
  familyId: number;
  choices: BoonId[];
  reason: string;
  expires: number;
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
  /** Runtime cache for territoryBox(); not saved. */
  boxCache: { version: number; box: { x0: number; y0: number; x1: number; y1: number } }[] = [];

  readonly pathfinder: PathFinder;

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    this.scenario = typeof opts.scenario === 'string' ? SCENARIOS[opts.scenario] : (opts.scenario ?? SCENARIOS.landfall);
    this.difficulty = opts.difficulty ?? 'normal';
    this.rules = DIFFICULTY[this.difficulty];
    this.map = generateMap(opts.seed, opts.size);
    this.size = this.map.size;
    this.rng = new Rng(opts.seed);
    this.nodeAt = new Int32Array(this.size * this.size);
    this.buildingAt = new Int32Array(this.size * this.size);
    this.territory = new Int8Array(this.size * this.size).fill(NO_OWNER);
    this.explored = new Uint8Array(this.size * this.size);
    this.pathfinder = new PathFinder(this.size, (i) => this.walkable(i));

    if (opts.blank) return;
    for (const n of this.map.nodes) this.addNode(n.kind, n.x, n.y, 0, n.max);
    for (const site of this.map.sites) this.sites.push({ id: this.newId(), ...site, revealed: 0, claimedBy: NO_OWNER });
    this.setupPlayer(0, this.map.starts[0]);
  }

  // ---- geometry helpers -------------------------------------------------

  idx(x: number, y: number): number {
    return y * this.size + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  walkable(i: number): boolean {
    return isWalkableTerrain(this.map.terrain[i]) && this.buildingAt[i] === 0;
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
    if (e.type !== 'hungry' && e.type !== 'fed') {
      this.stats.longestQuiet = Math.max(this.stats.longestQuiet, this.tick - this.stats.lastEventTick);
      this.stats.lastEventTick = this.tick;
    }
    if (MAJOR_EVENTS.has(e.type) && (!('owner' in e) || e.owner === 0)) {
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
    };
    this.buildings.set(b.id, b);
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
      skills: emptySkills(),
      spouseId: 0,
    };
    this.settlers.set(s.id, s);
    return s;
  }

  private setupPlayer(owner: number, start: { x: number; y: number }): void {
    this.players[owner] = { id: owner, hungry: false, mealAccum: 0, newcomerCooldown: 0, produced: emptyStock(), unlocked: [], claimed: 0, rumourAt: BALANCE.rumourDelay, offers: [] };
    const wagon = this.addBuilding('wagon', owner, start.x - 1, start.y - 1, true);
    onBuildingComplete(this, wagon);
    for (const g of GOODS) wagon.stock[g] = Math.round((BALANCE.startStock[g] ?? 0) * this.rules.startStock);
    const fam = createFamily(this, owner, wagon.id);
    wagon.familyId = fam.id;
    const e = this.entrance(wagon);
    // Founders: two adults and two children, the elder of whom comes of age within the first few minutes.
    const ages = [2, 2.2, 1.0, 0.6];
    const folk = ages.map((age, i) => this.addSettler(owner, fam.id, this.randomName(), age, e.x + (i % 2) - 1 + (i > 1 ? 2 : 0), e.y + (i > 1 ? 1 : 0)));
    folk[0].spouseId = folk[1].id;
    folk[1].spouseId = folk[0].id;
    // The very first choice: what kind of folk are the founders?
    offerBoon(this, fam, 'The founders set out');
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
    for (const g of FOODS) n += this.stored(owner, g);
    return n;
  }

  population(owner: number): number {
    let n = 0;
    for (const s of this.settlers.values()) if (s.owner === owner) n++;
    return n;
  }

  housing(owner: number): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === owner && b.done) n += BUILDINGS[b.type].housing ?? 0;
    return n;
  }

  countBuildings(owner: number, type: BuildingType, includeSites = false): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === owner && b.type === type && (b.done || includeSites)) n++;
    return n;
  }

  /** Construction materials still needed for a site. */
  siteNeeds(b: Building, good: Good): number {
    return (BUILDINGS[b.type].cost[good] ?? 0) - b.delivered[good] - b.incoming[good];
  }

  /** Work allowed so far given delivered materials (construction rises as goods arrive). */
  siteWorkAllowed(b: Building): number {
    const cost = BUILDINGS[b.type].cost;
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
    for (const cmd of this.pendingCommands) {
      this.commandLog.push({ tick: this.tick, cmd });
      applyCommand(this, cmd);
    }
    this.pendingCommands.length = 0;

    if (this.tick % 10 === 0) this.updateNature();
    if (this.tick % 10 === 5) {
      updateExploration(this);
      updateOffers(this);
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

  private updateAges(): void {
    const adult = comeOfAgeTicks();
    for (const s of this.settlers.values()) {
      s.age += 10;
      if (s.child && s.age >= adult) {
        s.child = false;
        const fam = this.families.get(s.familyId);
        // Inheritance: a new adult starts with part of the family's knowledge.
        const pct = BALANCE.inheritPct + (fam?.mods.teach ?? 0);
        if (fam) for (const k of SKILLS) s.skills[k] = Math.max(s.skills[k], Math.floor((fam.skills[k] * pct) / 100));
        this.emit({ type: 'cameOfAge', settlerId: s.id, name: s.name, surname: fam?.surname ?? '' });
      }
    }
  }

  isUnlocked(owner: number, type: BuildingType): boolean {
    return !BUILDINGS[type].requires || this.players[owner].unlocked.includes(type);
  }

  private updateNature(): void {
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
      } else if ((node.kind === 'bush' || node.kind === 'fish') && node.amount < node.max) {
        node.regrow -= 10;
        if (node.regrow <= 0) {
          node.amount++;
          node.regrow = node.kind === 'fish' ? BALANCE.fishRegrowTicks : BALANCE.berryRegrowTicks;
          this.natureVersion++;
        }
      }
    }
  }
}

const MAJOR_EVENTS = new Set<SimEvent['type']>(['discovered', 'rumour', 'boonOffered', 'married', 'claimed', 'unlocked', 'tierUp', 'chapterComplete', 'familyApproaching', 'familySettled']);

export const comeOfAgeTicks = () => Math.round(BALANCE.comeOfAgeYears * BALANCE.yearTicks);

export const FIRST_NAMES = [
  'Alfric', 'Edith', 'Osric', 'Hilda', 'Wulf', 'Edyth', 'Godwin', 'Mildred', 'Oswin', 'Elfgiva',
  'Bertha', 'Cuthbert', 'Leofwin', 'Wynn', 'Sigrid', 'Ulf', 'Astrid', 'Bjorn', 'Aldith', 'Eadric',
  'Freya', 'Hereward', 'Ingrid', 'Leofric', 'Maud', 'Odo', 'Rowena', 'Sweyn', 'Thora', 'Wilfred',
];
