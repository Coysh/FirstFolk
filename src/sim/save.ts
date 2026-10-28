import { BUILDINGS, type NodeKind } from './defs';
import type { OmenId } from './omens';
import type { Difficulty } from './rules';
import type { ScenarioState } from './scenario';
import { World, type Building, type Discovery, type Family, type PlayerState, type ResourceNode, type Settler, type WorldStats } from './world';

/** Bump when the shape of saved state changes; older saves are refused rather than misread. */
export const SAVE_VERSION = 15;

const KINDS: NodeKind[] = ['tree', 'rock', 'bush', 'fish'];

export interface SaveData {
  version: number;
  seed: number;
  size: number;
  difficulty: Difficulty;
  scenario: string;
  tick: number;
  nextId: number;
  rng: [number, number, number, number];
  /** [id, kind, x, y, amount, max, growth, stump, regrow, reservedBy] */
  nodes: number[][];
  buildings: Building[];
  settlers: Settler[];
  families: Family[];
  players: PlayerState[];
  scenarioState: ScenarioState;
  stats: WorldStats;
  natureVersion: number;
  /** Run-length encoded [value, count, value, count, …]. */
  territory: number[];
  explored: number[];
  sites: Discovery[];
  omens: OmenId[];
  label: string;
  challenge: World['challenge'];
  nextChallengeAt: number;
  lastChallenge: string;
  warbands: World['warbands'];
}

function rle(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

function unrle(r: number[], into: Int8Array | Uint8Array): void {
  let k = 0;
  for (let i = 0; i < r.length; i += 2) into.fill(r[i], k, (k += r[i + 1]));
}

/** Snapshot the complete simulation state. The terrain is regenerated from the seed on load. */
export function serializeWorld(w: World): SaveData {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    version: SAVE_VERSION,
    seed: w.seed,
    size: w.size,
    difficulty: w.difficulty,
    scenario: w.scenario.id,
    tick: w.tick,
    nextId: w.nextId,
    rng: w.rng.getState(),
    nodes: [...w.nodes.values()].map((n) => [n.id, KINDS.indexOf(n.kind), n.x, n.y, n.amount, n.max, n.growth, n.stump, n.regrow, n.reservedBy]),
    buildings: clone([...w.buildings.values()]),
    settlers: clone([...w.settlers.values()]),
    families: clone([...w.families.values()]),
    players: clone(w.players),
    scenarioState: clone(w.scenarioState),
    stats: clone(w.stats),
    natureVersion: w.natureVersion,
    territory: rle(w.territory),
    explored: rle(w.explored),
    sites: clone(w.sites),
    omens: [...w.omens],
    label: w.label,
    challenge: clone(w.challenge),
    nextChallengeAt: w.nextChallengeAt,
    warbands: clone(w.warbands),
    lastChallenge: w.lastChallenge,
  };
}

export function deserializeWorld(d: SaveData): World {
  if (d.version !== SAVE_VERSION) throw new Error(`Save version ${d.version} is not compatible with this build (${SAVE_VERSION}).`);
  const w = new World({ seed: d.seed, size: d.size, difficulty: d.difficulty, scenario: d.scenario, blank: true, omens: d.omens, label: d.label });
  w.tick = d.tick;
  w.nextId = d.nextId;
  w.rng.setState(d.rng);
  for (const [id, kind, x, y, amount, max, growth, stump, regrow, reservedBy] of d.nodes) {
    const n: ResourceNode = { id, kind: KINDS[kind], x, y, amount, max, growth, stump, regrow, reservedBy };
    w.nodes.set(id, n);
    w.nodeAt[w.idx(x, y)] = id;
  }
  for (const b of d.buildings) {
    w.buildings.set(b.id, b);
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) w.buildingAt[w.idx(b.x + dx, b.y + dy)] = b.id;
  }
  for (const s of d.settlers) w.settlers.set(s.id, s);
  for (const f of d.families) w.families.set(f.id, f);
  w.players = d.players;
  w.scenarioState = d.scenarioState;
  w.stats = d.stats;
  w.natureVersion = d.natureVersion;
  unrle(d.territory, w.territory);
  unrle(d.explored, w.explored);
  w.sites = d.sites;
  w.challenge = d.challenge;
  w.nextChallengeAt = d.nextChallengeAt;
  w.warbands = d.warbands;
  w.lastChallenge = d.lastChallenge;
  if (w.scenario.rival && w.players[1]) w.addRival();
  return w;
}

/** A small summary for the Continue button, readable without restoring the world. */
export interface SaveSummary {
  savedAt: number;
  tick: number;
  population: number;
  families: number;
  seed: number;
  difficulty: Difficulty;
}

export function summarize(d: SaveData, savedAt: number): SaveSummary {
  return { savedAt, tick: d.tick, population: d.settlers.length, families: d.families.length, seed: d.seed, difficulty: d.difficulty };
}
