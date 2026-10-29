import { BALANCE } from './balance';
import { BUILDINGS, FOODS, GOOD_INFO, outputGood, type GatherJob, type Good, type NodeKind, type Skill } from './defs';
import { addRenown } from './renown';
import { TRADES, tierOf, unlocksFor } from './trades';
import { playerMod } from './houses';
import { Terrain } from './mapgen';
import { onBuildingComplete } from './territory';
import { berryRegrow, type Building, type ResourceNode, type Settler, type World } from './world';
import { hasOmen } from './omens';
import { callingTier } from './callings';

export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function isMoving(s: Settler): boolean {
  return s.next >= 0 || s.path.length > 0;
}

/** Path the settler towards a tile. With `adjacent`, stop one tile short (to work on a tree or rock). */
export function walkTo(world: World, s: Settler, target: number, adjacent = false): boolean {
  const from = s.next >= 0 ? s.next : world.settlerTile(s);
  const path = world.pathfinder.find(from, target);
  if (!path) return false;
  if (adjacent && path.length > 0) path.pop();
  s.path = path;
  return true;
}

/** Drop whatever a settler is doing, undoing reservations. */
export function releaseJob(world: World, s: Settler): void {
  const j = s.job;
  if (j.kind === 'work') {
    const b = world.buildings.get(j.buildingId);
    if (b && b.workerId === s.id) b.workerId = 0;
    const node = world.nodes.get(j.nodeId);
    if (node && node.reservedBy === s.id) node.reservedBy = 0;
    if (j.phase === 'deliver' && s.carry) {
      const st = world.buildings.get(j.nodeId);
      if (st) st.incoming[s.carry]--;
    }
  } else if (j.kind === 'build') {
    const b = world.buildings.get(j.siteId);
    if (b && b.builderId === s.id) b.builderId = 0;
  } else if (j.kind === 'haul') {
    const from = world.buildings.get(j.fromId);
    const to = world.buildings.get(j.toId);
    if (j.phase === 'toSource' && from) from.reserved[j.good]--;
    if (to) to.incoming[j.good]--;
  }
  // Whatever they carried goes back into the nearest store.
  if (s.carry) {
    const store = world.storages(s.owner)[0];
    if (store) store.stock[s.carry]++;
    s.carry = null;
  }
  s.path = [];
  setIdle(s);
}

export function setIdle(s: Settler): void {
  s.job = { kind: 'idle', wait: 0 };
  s.tool = null;
  s.busy = 0;
  s.faceTile = -1;
}

function idleSettlers(world: World, owner: number, adultsOnly: boolean): Settler[] {
  const out: Settler[] = [];
  for (const s of world.settlers.values())
    if (s.owner === owner && s.job.kind === 'idle' && !(adultsOnly && s.child)) out.push(s);
  return out;
}

function nearest(world: World, candidates: Settler[], x: number, y: number, adultPenalty = 0): Settler | undefined {
  let best: Settler | undefined;
  let bestD = Infinity;
  for (const s of candidates) {
    const d = cheb(s.x, s.y, x, y) + (s.child ? 0 : adultPenalty);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  void world;
  return best;
}

/** Give idle adults jobs at buildings that need a worker or a builder. Runs every few ticks. */
export function assignJobs(world: World): void {
  // Builders per site (Great Works take a crew) and workers per workplace (more as its trade grows).
  const crews = new Map<number, number>();
  const hands = new Map<number, number>();
  const guards = guardCounts(world, true);
  for (const s of world.settlers.values()) {
    if (s.job.kind === 'build') crews.set(s.job.siteId, (crews.get(s.job.siteId) ?? 0) + 1);
    else if (s.job.kind === 'work') {
      hands.set(s.job.buildingId, (hands.get(s.job.buildingId) ?? 0) + 1);
      const b = world.buildings.get(s.job.buildingId);
      if (b && !world.settlers.has(b.workerId)) b.workerId = s.id;
    }
  }
  for (const player of world.players) {
    const idle = idleSettlers(world, player.id, true);
    // In order of need: builders and each workplace's first hand, then the watch, then extra crew.
    for (const b of world.buildings.values()) {
      if (b.owner !== player.id) continue;
      const def = BUILDINGS[b.type];
      const e = world.entrance(b);
      if (b.done && def.job && !hands.get(b.id)) {
        let s = nearest(world, idle, e.x, e.y);
        // The watch steps down to work: guards are the town's reserve of hands.
        if (s) idle.splice(idle.indexOf(s), 1);
        else s = recallGuard(world, guards, player.id, e.x, e.y);
        if (!s) {
          b.status = 'Needs a worker';
          b.alert = 'noWorker';
          continue;
        }
        b.alert = '';
        hire(world, b, s, hands);
      } else if (!b.done && (b.builderId === 0 || (crews.get(b.id) ?? 0) < (def.crew ?? 1)) && world.siteWorkAllowed(b) > b.work) {
        let s = nearest(world, idle, e.x, e.y);
        if (s) idle.splice(idle.indexOf(s), 1);
        else if (!anyBuilder(world, player.id)) s = recallGuard(world, guards, player.id, e.x, e.y) ?? recallWorker(world, player.id, e.x, e.y);
        if (!s) continue;
        b.builderId = s.id;
        crews.set(b.id, (crews.get(b.id) ?? 0) + 1);
        s.job = { kind: 'build', siteId: b.id, phase: 'toSite' };
        s.busy = 0;
        s.tool = 'hammer';
        walkTo(world, s, world.entranceIdx(b));
      }
    }
    // Guard posts, one guard per post before any gets a second. An empty post calls a spare
    // hand from a busy workplace's crew when nobody is free.
    // Free hands are the porters, so the watch never takes the town's carriers.
    let adults = 0;
    let carrying = 0;
    for (const s of world.settlers.values())
      if (s.owner === player.id && !s.child) {
        adults++;
        if (s.job.kind === 'haul') carrying++;
      }
    const porters = Math.ceil(adults / BALANCE.porterShare);
    let spare = idle.length - Math.max(0, porters - carrying);
    // The Mustering Hall's huscarls first (a deliberate investment), then the posts.
    const posts = [...world.buildings.values()].filter((b) => b.owner === player.id && b.done && BUILDINGS[b.type].garrison).sort((p, q) => (q.type === 'musterhall' ? 1 : 0) - (p.type === 'musterhall' ? 1 : 0));
    for (let k = 0; k < 4; k++)
      for (const b of posts) {
        if ((guards.get(b.id) ?? 0) !== k || k >= BUILDINGS[b.type].garrison!) continue;
        const e = world.entrance(b);
        let s = spare > 0 ? nearest(world, idle, e.x, e.y) : undefined;
        if (s) {
          idle.splice(idle.indexOf(s), 1);
          spare--;
        } else if (k === 0 || b.type === 'musterhall') s = spareHand(world, hands, player.id, e.x, e.y);
        if (!s) continue;
        guards.set(b.id, k + 1);
        s.job = { kind: 'guard', buildingId: b.id, phase: 'toPost' };
        s.busy = 0;
        s.tool = 'spear';
        walkTo(world, s, world.entranceIdx(b));
      }
    // A family business: extra hands come from the head worker's family when they can, but never the town's last carriers
    // (every workshop needs goods brought and taken away, and an over-staffed town starves its own chains).
    const carriers = Math.max(0, Math.ceil(adults / BALANCE.porterShare) - carrying);
    for (const b of world.buildings.values()) {
      if (idle.length <= carriers) break;
      const def = BUILDINGS[b.type];
      const working = hands.get(b.id) ?? 0;
      if (b.owner !== player.id || !b.done || !def.job || !working || working >= workSlots(b)) continue;
      const e = world.entrance(b);
      const s = nearest(world, idle, e.x, e.y)!;
      idle.splice(idle.indexOf(s), 1);
      hire(world, b, s, hands);
    }
  }
}

function hire(world: World, b: Building, s: Settler, hands: Map<number, number>): void {
  const working = hands.get(b.id) ?? 0;
  hands.set(b.id, working + 1);
  if (!working) b.workerId = s.id;
  s.job = { kind: 'work', buildingId: b.id, phase: 'toBuilding', nodeId: 0, tile: -1, extra: 0 };
  s.busy = 0;
  s.tool = BUILDINGS[b.type].job!.tool;
  walkTo(world, s, world.entranceIdx(b));
}

/** An extra crew hand (never a workplace's head worker, never mid-carry), freed to stand guard. */
function spareHand(world: World, hands: Map<number, number>, owner: number, x: number, y: number): Settler | undefined {
  const candidates: Settler[] = [];
  for (const s of world.settlers.values())
    if (s.owner === owner && s.job.kind === 'work' && !s.carry && (hands.get(s.job.buildingId) ?? 0) > 1 && world.buildings.get(s.job.buildingId)?.workerId !== s.id && s.job.phase !== 'harvest' && s.job.phase !== 'process' && s.job.phase !== 'deliver') candidates.push(s);
  const s = nearest(world, candidates, x, y);
  if (!s || s.job.kind !== 'work') return undefined;
  hands.set(s.job.buildingId, (hands.get(s.job.buildingId) ?? 1) - 1);
  const node = world.nodes.get(s.job.nodeId);
  if (node && node.reservedBy === s.id) node.reservedBy = 0;
  setIdle(s);
  s.path = [];
  return s;
}

/** Guards standing watch (or on their way) at each post; with `away`, huscarls out raiding too. */
export function guardCounts(world: World, away = false): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of world.settlers.values()) if (s.job.kind === 'guard' && (away || s.job.phase !== 'away')) out.set(s.job.buildingId, (out.get(s.job.buildingId) ?? 0) + 1);
  return out;
}

/** Take the nearest guard off watch to work (posts with the most guards give theirs up first). */
function recallGuard(world: World, guards: Map<number, number>, owner: number, x: number, y: number): Settler | undefined {
  let best: Settler | undefined;
  let bestD = Infinity;
  for (const s of world.settlers.values()) {
    if (s.owner !== owner || s.job.kind !== 'guard' || s.job.phase === 'away') continue;
    const d = cheb(s.x, s.y, x, y) - (guards.get(s.job.buildingId) ?? 0) * 8;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best || best.job.kind !== 'guard') return undefined;
  guards.set(best.job.buildingId, (guards.get(best.job.buildingId) ?? 1) - 1);
  setIdle(best);
  best.path = [];
  return best;
}

export { nearest as nearestSettler, idleSettlers };

/** Workers a workplace takes: one, plus one per trade tier it has grown to (up to three). */
export function workSlots(b: Building): number {
  return 1 + Math.min(2, b.tier);
}


/** Work teaches the town: every harvest adds to the settlement's craft. */
export function gainXp(world: World, s: Settler, skill: Skill, _b: Building): void {
  craftXp(world, s.owner, skill, BALANCE.xpPerHarvest, s.x, s.y);
}

/**
 * Add to a settlement's craft. Each new tier upgrades every workplace of that craft at once,
 * unlocks its buildings, and (at Master) makes the town famous. Returns the craft's tier.
 */
export function craftXp(world: World, owner: number, skill: Skill, amount: number, x = -1, y = -1): number {
  const player = world.players[owner];
  if (!player) return 0;
  const before = tierOf(player.crafts[skill]);
  player.crafts[skill] += amount;
  const after = tierOf(player.crafts[skill]);
  for (let tier = before + 1; tier <= after; tier++) {
    world.emit({ type: 'craftUp', owner, skill, tier });
    addRenown(world, owner, tier === 2 ? BALANCE.renown.master : BALANCE.renown.skilled, 'masters', x, y);
    for (const b of world.buildings.values()) if (b.owner === owner && BUILDINGS[b.type].job?.skill === skill && b.tier < tier) b.tier = tier;
    for (const t of unlocksFor(skill, tier)) {
      if (player.unlocked.includes(t)) continue;
      player.unlocked.push(t);
      world.emit({ type: 'unlocked', owner, buildingType: t });
    }
  }
  return after;
}

/** A settlement's tier in a craft (0 novice, 1 skilled, 2 masterly). */
export const craftTier = (world: World, owner: number, skill: Skill) => tierOf(world.players[owner]?.crafts[skill] ?? 0);

function workTicks(world: World, s: Settler, base: number, skill: Skill): number {
  let t = (base * TRADES[skill].speed[craftTier(world, s.owner, skill)] * 100) / (100 + playerMod(world, s.owner, `speed.${skill}`) + legendBonus(world, s.owner, skill));
  const player = world.players[s.owner];
  // Hunger slows everyone but food gatherers, who eat as they pick: a famine can't cripple its own cure.
  if (player.hungry && skill !== 'husbandry') t *= 1.4;
  // Deeds: a timber drive or a harvest home.
  if (skill === 'woodcraft' && player.buffs.timber > world.tick) t /= 3;
  if (skill === 'husbandry' && player.buffs.harvest > world.tick) t /= 2;
  if (skill === 'husbandry') t = (t * 100) / (100 + 8 * callingTier(world, s.owner, 'hearth'));
  // Masons work stone and timber a little faster.
  if (skill !== 'husbandry') t = (t * 100) / (100 + 8 * callingTier(world, s.owner, 'masons'));
  return Math.max(1, Math.round(t));
}

/** Legends of past Masters make the whole settlement better at their craft. */
export function legendBonus(world: World, owner: number, skill: Skill): number {
  let n = 0;
  for (const l of world.players[owner]?.legends ?? []) if (l.skill === skill) n++;
  return Math.min(BALANCE.legendCap, n) * BALANCE.legendPct;
}

function rollBonus(world: World, s: Settler, skill: Skill): number {
  return world.rng.int(100) < TRADES[skill].bonus[craftTier(world, s.owner, skill)] ? 1 : 0;
}

function anyBuilder(world: World, owner: number): boolean {
  for (const s of world.settlers.values()) if (s.owner === owner && s.job.kind === 'build') return true;
  return false;
}

/**
 * Construction must never stall completely: when no adult is free, borrow the nearest
 * gatherer who is not mid-carry. Their workplace is re-staffed once someone frees up.
 */
function recallWorker(world: World, owner: number, x: number, y: number): Settler | undefined {
  const candidates: Settler[] = [];
  for (const s of world.settlers.values())
    if (s.owner === owner && s.job.kind === 'work' && !s.carry && s.job.phase !== 'harvest' && s.job.phase !== 'process' && s.job.phase !== 'deliver') candidates.push(s);
  const s = nearest(world, candidates, x, y);
  if (!s || s.job.kind !== 'work') return undefined;
  const b = world.buildings.get(s.job.buildingId);
  if (b) {
    b.workerId = 0;
    b.status = 'Worker helping with construction';
    b.alert = 'noWorker';
  }
  const node = world.nodes.get(s.job.nodeId);
  if (node && node.reservedBy === s.id) node.reservedBy = 0;
  setIdle(s);
  s.path = [];
  return s;
}

/** Foragers and fishers on the job (see workTicks): hunger doesn't slow their walk either. */
function gathersFood(world: World, s: Settler): boolean {
  if (s.job.kind !== 'work') return false;
  const b = world.buildings.get(s.job.buildingId);
  const good = b && outputGood(b.type);
  return !!good && FOODS.includes(good);
}

function stepMove(world: World, s: Settler): void {
  if (s.next < 0) {
    if (!s.path.length) return;
    beginStep(world, s, s.path.shift()!);
  }
  let speed = s.child ? BALANCE.childSpeed : BALANCE.adultSpeed;
  if (world.players[s.owner].hungry && !gathersFood(world, s)) speed = Math.floor((speed * BALANCE.hungrySpeedPct) / 100);
  s.progress += speed;
  while (s.progress >= s.stepLen) {
    s.progress -= s.stepLen;
    s.x = s.next % world.size;
    s.y = (s.next - s.x) / world.size;
    if (s.path.length) beginStep(world, s, s.path.shift()!);
    else {
      s.next = -1;
      s.progress = 0;
      break;
    }
  }
}

function beginStep(world: World, s: Settler, next: number): void {
  const nx = next % world.size;
  const ny = (next - nx) / world.size;
  s.next = next;
  s.stepLen = nx !== s.x && ny !== s.y ? 1414 : 1000;
}

export function updateSettler(world: World, s: Settler): void {
  if (isMoving(s)) {
    s.anim = 'walk';
    stepMove(world, s);
    if (isMoving(s)) return;
    s.anim = 'idle';
  }
  if (s.busy > 0) {
    s.busy--;
    if (s.busy > 0) return;
  }
  think(world, s);
}

function think(world: World, s: Settler): void {
  const job = s.job;
  switch (job.kind) {
    case 'idle': {
      s.anim = 'idle';
      if (job.wait === 0) {
        job.wait = 1;
        s.busy = world.rng.range(20, 60);
        return;
      }
      job.wait = 0;
      const home = homeEntrance(world, s);
      const r = BALANCE.wanderRadius;
      const tx = home.x + world.rng.range(-r, r);
      const ty = home.y + world.rng.range(-r, r);
      if (world.inBounds(tx, ty) && world.walkable(world.idx(tx, ty))) walkTo(world, s, world.idx(tx, ty));
      return;
    }
    case 'arrive':
      setIdle(s);
      return;
    case 'build':
      return thinkBuild(world, s, job);
    case 'haul':
      return thinkHaul(world, s, job);
    case 'work':
      return thinkWork(world, s, job);
    case 'guard': {
      const b = world.buildings.get(job.buildingId);
      if (!b) return setIdle(s);
      if (job.phase === 'away') return;
      // On watch: stand by the post, now and then pacing a step or two along the stakes.
      job.phase = 'watch';
      s.anim = 'idle';
      s.tool = 'spear';
      s.busy = world.rng.range(40, 90);
      const e = world.entrance(b);
      const tx = e.x + world.rng.range(-1, 1);
      const ty = e.y + world.rng.range(0, 1);
      if (cheb(s.x, s.y, e.x, e.y) > 2 || world.rng.int(3) === 0) if (world.inBounds(tx, ty) && world.walkable(world.idx(tx, ty))) walkTo(world, s, world.idx(tx, ty));
      return;
    }
  }
}

function homeEntrance(world: World, s: Settler) {
  const fam = world.families.get(s.familyId);
  const home = fam && world.buildings.get(fam.homeId);
  if (home) return world.entrance(home);
  for (const b of world.buildings.values()) if (b.owner === s.owner && b.type === 'wagon') return world.entrance(b);
  return { x: s.x, y: s.y };
}

function thinkBuild(world: World, s: Settler, job: Extract<Settler['job'], { kind: 'build' }>): void {
  const site = world.buildings.get(job.siteId);
  if (!site || site.done) return setIdle(s);
  if (job.phase === 'toSite') {
    job.phase = 'build';
    s.faceTile = world.idx(site.x, site.y + BUILDINGS[site.type].size - 1);
  }
  const allowed = world.siteWorkAllowed(site);
  if (site.work >= allowed) {
    // Out of materials: free the builder to help haul; they will be reassigned when goods arrive.
    site.builderId = 0;
    site.status = 'Waiting for materials';
    site.alert = 'materials';
    return setIdle(s);
  }
  s.anim = 'work';
  site.status = 'Under construction';
  site.alert = '';
  let rate = world.players[s.owner].hungry ? Math.floor(BALANCE.buildRate * 0.6) : BALANCE.buildRate;
  rate = Math.floor((rate * (100 + playerMod(world, s.owner, 'build'))) / 100);
  if (world.winterBites(s.owner)) rate = Math.max(1, Math.floor((rate * (hasOmen(world, 'longWinters') ? 50 : BALANCE.winterBuildPct)) / 100));
  site.work = Math.min(site.workNeeded, site.work + rate);
  if (site.work >= site.workNeeded) {
    site.done = true;
    site.builtBy = s.familyId;
    site.builderId = 0;
    site.status = '';
    site.alert = '';
    world.stats.completions.push({ type: site.type, tick: world.tick });
    world.emit({ type: 'buildingComplete', owner: site.owner, id: site.id, buildingType: site.type });
    onBuildingComplete(world, site);
    return setIdle(s);
  }
  s.busy = 1;
}

function thinkHaul(world: World, s: Settler, job: Extract<Settler['job'], { kind: 'haul' }>): void {
  const from = world.buildings.get(job.fromId);
  const to = world.buildings.get(job.toId);
  if (job.phase === 'toSource') {
    if (!from || !to) return setIdle(s);
    from.stock[job.good]--;
    from.reserved[job.good]--;
    s.carry = job.good;
    job.phase = 'toDest';
    if (!walkTo(world, s, world.entranceIdx(to))) {
      from.stock[job.good]++;
      to.incoming[job.good]--;
      s.carry = null;
      setIdle(s);
    }
    return;
  }
  if (!to) return setIdle(s);
  if (to.done) to.stock[job.good]++;
  else to.delivered[job.good]++;
  to.incoming[job.good]--;
  world.emit({ type: 'delivered', owner: to.owner, buildingId: to.id, good: job.good });
  s.carry = null;
  setIdle(s);
}

/** Can the crew at `from` reach this node on foot (fish are worked from a bank beside the shoal)? */
function reachableNode(world: World, from: number, n: ResourceNode): boolean {
  const i = world.idx(n.x, n.y);
  if (world.walkableGround(i)) return world.sameRegion(from, i);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!world.inBounds(n.x + dx, n.y + dy)) continue;
    const j = world.idx(n.x + dx, n.y + dy);
    if (world.walkableGround(j) && world.sameRegion(from, j)) return true;
  }
  return false;
}

function findNode(world: World, b: Building, kind: NodeKind, radius: number): ResourceNode | undefined {
  const e = world.entrance(b);
  const from = world.entranceIdx(b);
  let best: ResourceNode | undefined;
  let bestD = Infinity;
  for (let y = e.y - radius; y <= e.y + radius; y++)
    for (let x = e.x - radius; x <= e.x + radius; x++) {
      if (!world.inBounds(x, y)) continue;
      const id = world.nodeAt[world.idx(x, y)];
      if (!id) continue;
      const n = world.nodes.get(id)!;
      if (n.kind !== kind || n.amount <= 0 || n.growth > 0 || n.stump > 0 || n.reservedBy !== 0) continue;
      const d = cheb(x, y, e.x, e.y);
      if (d >= bestD && !(d === bestD && n.id < best!.id)) continue;
      if (!reachableNode(world, from, n)) continue; // across the water: not for this crew
      if (d < bestD || (d === bestD && n.id < best!.id)) {
        bestD = d;
        best = n;
      }
    }
  return best;
}

const PLANTABLE = new Set<number>([Terrain.Grass, Terrain.Forest, Terrain.Meadow]);

function findPlantTile(world: World, b: Building, radius: number, self: Settler): number {
  const e = world.entrance(b);
  const candidates: number[] = [];
  for (let y = e.y - radius; y <= e.y + radius; y++)
    for (let x = e.x - radius; x <= e.x + radius; x++) {
      if (!world.inBounds(x, y) || cheb(x, y, e.x, e.y) < 2) continue;
      const i = world.idx(x, y);
      if (!PLANTABLE.has(world.map.terrain[i]) || world.nodeAt[i] || world.buildingAt[i]) continue;
      if (isNearEntrance(world, x, y)) continue;
      let taken = false;
      for (const o of world.settlers.values())
        if (o !== self && o.job.kind === 'work' && o.job.tile === i) taken = true;
      if (!taken) candidates.push(i);
    }
  return candidates.length ? candidates[world.rng.int(candidates.length)] : -1;
}

function isNearEntrance(world: World, x: number, y: number): boolean {
  for (const b of world.buildings.values()) {
    const e = world.entrance(b);
    if (cheb(e.x, e.y, x, y) <= 1) return true;
  }
  return false;
}

function thinkWork(world: World, s: Settler, job: Extract<Settler['job'], { kind: 'work' }>): void {
  const b = world.buildings.get(job.buildingId);
  if (!b) return setIdle(s);
  const def = BUILDINGS[b.type].job!;
  const player = world.players[s.owner];
  s.anim = 'idle';

  switch (job.phase) {
    case 'toBuilding':
    case 'rest':
      job.phase = 'seek';
      return;

    case 'seek': {
      if (def.kind !== 'plant' && b.stock[def.good] >= def.outputCap && selfDeliver(world, s, job, b, def.good)) return;
      if (def.kind === 'process') {
        if (b.stock[def.good] >= def.outputCap) return wait(b, s, 'Output full, waiting for carriers', 'full', 20);
        if (def.input && b.stock[def.input] - b.reserved[def.input] <= 0) {
          const scarce = world.stored(s.owner, def.input) <= def.reserve;
          const name = GOOD_INFO[def.input].name.toLowerCase();
          return wait(b, s, scarce ? `Saving ${name} for building (keeps ${def.reserve} in store)` : `Waiting for ${name}`, 'noInput', 15);
        }
        if (def.input) b.stock[def.input]--;
        s.busy = workTicks(world, s, def.workTicks, def.skill);
        s.anim = 'work';
        s.faceTile = world.idx(b.x + 1, b.y + BUILDINGS[b.type].size - 1);
        b.status = 'Working';
        b.alert = '';
        job.phase = 'process';
        return;
      }
      if (def.kind === 'gather') {
        if (b.stock[def.good] >= def.outputCap) return wait(b, s, 'Output full, waiting for carriers', 'full', 20);
        const node = findNode(world, b, def.node, def.radius);
        if (!node) return wait(b, s, `No ${nodeLabel(def)} in range`, 'noResource', 30);
        node.reservedBy = s.id;
        // Shoals sit in the water: fish from a bank tile beside them.
        const stand = world.walkable(world.idx(node.x, node.y)) ? -1 : bankTile(world, node.x, node.y);
        if (stand >= 0 ? !walkTo(world, s, stand) : !walkTo(world, s, world.idx(node.x, node.y), true)) {
          node.reservedBy = 0;
          s.busy = 10;
          return;
        }
        job.nodeId = node.id;
        job.tile = world.idx(node.x, node.y);
      } else {
        const tile = findPlantTile(world, b, def.radius, s);
        if (tile < 0 || !walkTo(world, s, tile, true)) return wait(b, s, 'No space to plant', 'noResource', 30);
        job.tile = tile;
      }
      b.status = 'Working';
      b.alert = '';
      job.phase = 'toNode';
      return;
    }

    case 'process': {
      if (def.kind !== 'process') return setIdle(s);
      const bonus = rollBonus(world, s, def.skill);
      b.stock[def.good] += 1 + bonus;
      player.produced[def.good] += 1 + bonus;
      world.emit({ type: 'produced', owner: b.owner, buildingId: b.id, good: def.good, bonus: bonus > 0 });
      gainXp(world, s, def.skill, b);
      job.phase = 'seek';
      return;
    }

    case 'toNode': {
      s.busy = workTicks(world, s, def.workTicks, def.skill);
      s.anim = 'work';
      s.faceTile = job.tile;
      job.phase = 'harvest';
      return;
    }

    case 'harvest': {
      s.faceTile = -1;
      if (def.kind === 'gather') {
        const node = world.nodes.get(job.nodeId);
        job.nodeId = 0;
        if (!node || node.amount <= 0) {
          job.phase = 'seek';
          return;
        }
        node.reservedBy = 0;
        harvest(world, node);
        s.carry = def.good;
        job.extra = rollBonus(world, s, def.skill);
        if (def.good === 'logs' && world.stats.firstLogsTick < 0) world.stats.firstLogsTick = world.tick;
      } else if (def.kind === 'plant') {
        const x = job.tile % world.size;
        const y = (job.tile - x) / world.size;
        if (!world.nodeAt[job.tile] && !world.buildingAt[job.tile]) {
          // A timber drive's saplings spring up fully grown.
          world.addNode('tree', x, y, player.buffs.timber > world.tick ? 0 : BALANCE.saplingGrowTicks);
          world.emit({ type: 'saplingPlanted', x, y });
          gainXp(world, s, def.skill, b);
        }
      }
      job.tile = -1;
      job.phase = 'return';
      walkTo(world, s, world.entranceIdx(b));
      return;
    }

    case 'deliver': {
      // Arrived at a store with our own output: drop it and head back to work.
      const store = world.buildings.get(job.nodeId);
      if (s.carry && store) {
        store.stock[s.carry]++;
        store.incoming[s.carry]--;
        world.emit({ type: 'delivered', owner: store.owner, buildingId: store.id, good: s.carry });
      }
      s.carry = null;
      job.nodeId = 0;
      job.phase = 'toBuilding';
      walkTo(world, s, world.entranceIdx(b));
      return;
    }

    case 'return': {
      if (def.kind === 'gather' && s.carry) {
        const n = 1 + job.extra;
        b.stock[s.carry] += n;
        player.produced[s.carry] += n;
        world.emit({ type: 'produced', owner: b.owner, buildingId: b.id, good: s.carry, bonus: job.extra > 0 });
        gainXp(world, s, def.skill, b);
        job.extra = 0;
        s.carry = null;
        job.phase = 'seek';
      } else {
        job.phase = 'rest';
        s.busy = 40;
      }
      return;
    }
  }
}

/**
 * When nobody collects a full workplace, the worker carries one load to the nearest store
 * themselves. Slower than having carriers, but the economy can never deadlock.
 */
function selfDeliver(world: World, s: Settler, job: Extract<Settler['job'], { kind: 'work' }>, b: Building, good: Good): boolean {
  if (b.stock[good] - b.reserved[good] <= 0) return false;
  let store: Building | undefined;
  let bestD = Infinity;
  const e = world.entrance(b);
  for (const st of world.storages(s.owner)) {
    const se = world.entrance(st);
    const d = cheb(se.x, se.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      store = st;
    }
  }
  if (!store || !walkTo(world, s, world.entranceIdx(store))) return false;
  b.stock[good]--;
  store.incoming[good]++;
  s.carry = good;
  job.nodeId = store.id;
  job.phase = 'deliver';
  b.status = 'No carriers free: the worker is hauling';
  b.alert = 'full';
  return true;
}

function wait(b: Building, s: Settler, status: string, alert: Building['alert'], ticks: number): void {
  b.status = status;
  b.alert = alert;
  s.busy = ticks;
}

function nodeLabel(def: GatherJob): string {
  return def.node === 'tree' ? 'trees' : def.node === 'rock' ? 'rocks' : def.node === 'fish' ? 'fish' : `${GOOD_INFO[def.good].name.toLowerCase()}`;
}

function bankTile(world: World, x: number, y: number): number {
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (world.inBounds(nx, ny) && world.walkable(world.idx(nx, ny))) return world.idx(nx, ny);
  }
  return -1;
}

function harvest(world: World, node: ResourceNode): void {
  node.amount--;
  world.natureVersion++;
  if (node.kind === 'tree') {
    if (node.amount <= 0) {
      node.stump = BALANCE.stumpDecayTicks;
      world.emit({ type: 'treeFelled', x: node.x, y: node.y });
    }
  } else if (node.kind === 'rock') {
    const depleted = node.amount <= 0;
    world.emit({ type: 'rockMined', x: node.x, y: node.y, depleted });
    if (depleted) world.removeNode(node);
  } else if (node.regrow <= 0) {
    node.regrow = node.kind === 'fish' ? BALANCE.fishRegrowTicks : berryRegrow(world);
  }
}
