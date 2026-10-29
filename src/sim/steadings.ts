import { BALANCE, TICK_HZ, secs } from './balance';
import type { Good } from './defs';
import { GOODS } from './defs';
import { callingTier } from './callings';
import { BUILDINGS } from './defs';
import { pay } from './events';
import { watched } from './renown';
import { STEADING_CHAR, steadingName } from './steadingDefs';
import { NO_OWNER, nearestStore } from './territory';
import type { Discovery, World } from './world';

/**
 * Steadings: neutral folk who already live in the valley. Four to a valley, as mirrored pairs.
 * Each posts one Want at a time, in plain sight of both settlements (so many planks, or a manned
 * post beside them), and the first to meet it wins a big swing of favour. A steading sides with
 * whoever it favours, sends them its gift and counts as a *voice* of the valley: the Crown fills for
 * whoever holds more voices (see crown.ts). Goods reach a steading by caravan.
 *
 * State: `site.st` on the steading's site (saved with the sites), and `world.caravans` (saved).
 */
export interface Want {
  kind: 'goods' | 'guard';
  good: Good;
  /** Goods asked for, or seconds of a manned post beside the steading. */
  n: number;
  endsAt: number;
  /** A Last Want (the finale): twice the size, worth more. */
  last?: boolean;
  /** Per player: goods delivered, or seconds a manned post has stood there. */
  progress: number[];
}

export interface SteadingState {
  char: string;
  name: string;
  /** Favour per player, 0..100, fading slowly. */
  favour: number[];
  /** Whom the steading stands with now, or NO_OWNER. */
  ally: number;
  want: Want | null;
  nextWantAt: number;
  giftAt: number;
  /** Wants won per player (the end report reads it). */
  won: number[];
}

export interface Caravan {
  id: number;
  owner: number;
  siteId: number;
  good: Good;
  n: number;
  /** Tiles to walk (there, then back), and how far along it is (a step costs 1000). */
  path: number[];
  step: number;
  progress: number;
  phase: 'out' | 'home';
  x: number;
  y: number;
}

/** The finale: a Crown is nearly full, or the clock is nearly out. Every steading then asks for something big. */
export function finaleOn(world: World): boolean {
  const c = world.crown;
  if (c && c.progress.some((p) => (p * 100) / BALANCE.crownNeed >= BALANCE.finalePct)) return true;
  const limit = world.scenario.timeLimit;
  return !!limit && world.tick >= limit - BALANCE.finaleBefore;
}

export const steadingsOf = (world: World): Discovery[] => world.sites.filter((s) => !!s.st);

/** Give every steading site its people and its first Want's time. Called once the sites exist. */
export function initSteadings(world: World, chars: (string | undefined)[]): void {
  let k = 0;
  world.sites.forEach((s, i) => {
    if (s.kind !== 'steading') return;
    const char = chars[i] ?? 'quarrymen';
    s.revealed = 0b11; // their smoke is seen from the first morning: something to head for
    s.st = {
      char,
      name: steadingName(char, k++),
      favour: [0, 0],
      ally: NO_OWNER,
      want: null,
      nextWantAt: BALANCE.wantFirst + (s.id % 5) * 100,
      giftAt: 0,
      won: [0, 0],
    };
  });
}

/** Friendly sizing for a new player count (a rival joins after the sites exist). */
export function ensureFavourSlots(world: World): void {
  for (const s of steadingsOf(world)) while (s.st!.favour.length < world.players.length) s.st!.favour.push(0), s.st!.won.push(0), s.st!.want?.progress.push(0);
}

const ADVANCED_WANTS: [Good, number, number][] = [['bread', 16, 28], ['ale', 8, 16], ['tools', 5, 10]];
/** Goods a grown-up town makes: a gift of them earns twice the favour. */
const FINE_GOODS: Good[] = ['bread', 'ale', 'tools'];
const GUARD_CHANCE = 4; // one Want in this many asks for a manned post, not goods

function postWant(world: World, s: Discovery): void {
  const st = s.st!;
  const char = STEADING_CHAR[st.char];
  const guard = world.rng.int(GUARD_CHANCE) === 0;
  // From ten minutes the folk ask for what a grown-up town makes, too.
  const pool = world.tick >= secs(10 * 60) && world.rng.int(2) === 0 ? ADVANCED_WANTS : char.wants;
  const [good, lo, hi] = pool[world.rng.int(pool.length)];
  // Early Wants are small, so the first minutes have something a young town can answer; they grow to full size by about 15:00.
  const scale = 50 + Math.min(50, Math.floor(world.tick / (TICK_HZ * 18)));
  const n = guard ? Math.round(BALANCE.guardTicks / TICK_HZ) : Math.max(6, Math.floor((world.rng.range(lo, hi) * scale) / 100));
  const last = finaleOn(world);
  st.want = { kind: guard ? 'guard' : 'goods', good, n: last && !guard ? n * 2 : n, endsAt: world.tick + (last ? BALANCE.wantTicks + secs(40) : BALANCE.wantTicks), progress: new Array(world.players.length).fill(0), ...(last ? { last: true } : {}) };
  world.emit({ type: 'wantPosted', siteId: s.id, kind: st.want.kind, good, n });
}

function endWant(world: World, s: Discovery, winner: number): void {
  const st = s.st!;
  const want = st.want!;
  st.want = null;
  st.nextWantAt = world.tick + world.rng.range(BALANCE.wantGap[0], BALANCE.wantGap[1]);
  if (winner === NO_OWNER) {
    world.emit({ type: 'wantExpired', siteId: s.id, kind: want.kind });
    return;
  }
  st.won[winner]++;
  addFavour(world, s, winner, want.last ? BALANCE.finaleFavour : BALANCE.wantWin);
  for (const p of world.players) if (p.id !== winner) addFavour(world, s, p.id, -BALANCE.wantSnub);
  world.emit({ type: 'wantWon', siteId: s.id, owner: winner, kind: want.kind, good: want.good, n: want.n });
}

export function addFavour(world: World, s: Discovery, owner: number, n: number): void {
  const st = s.st!;
  // Merchants are welcome everywhere: each tier of that calling earns a quarter more favour.
  if (n > 0) n = Math.floor((n * (100 + 25 * callingTier(world, owner, 'trader'))) / 100);
  st.favour[owner] = Math.max(0, Math.min(100, st.favour[owner] + n));
  settleAllegiance(world, s);
}

/** Who a steading stands with: whoever has the favour and a clear lead; once sworn, a looser grip keeps them. */
function settleAllegiance(world: World, s: Discovery): void {
  const st = s.st!;
  const was = st.ally;
  let ally = NO_OWNER;
  const f = st.favour;
  let top = 0;
  for (let o = 1; o < f.length; o++) if (f[o] > f[top]) top = o;
  const rest = Math.max(0, ...f.filter((_, o) => o !== top));
  if (was !== NO_OWNER && was === top && f[top] >= BALANCE.keepFavour && f[top] - rest >= BALANCE.keepLead) ally = was;
  else if (f[top] >= BALANCE.allyFavour && f[top] - rest >= BALANCE.allyLead) ally = top;
  else if (was !== NO_OWNER && f[was] >= BALANCE.keepFavour && f[was] - Math.max(0, ...f.filter((_, o) => o !== was)) >= BALANCE.keepLead) ally = was;
  if (ally === was) return;
  st.ally = ally;
  if (ally !== NO_OWNER) st.giftAt = world.tick + BALANCE.giftEvery;
  world.territoryVersion++;
  world.emit({ type: 'steadingAlly', siteId: s.id, owner: ally, was });
}

/** The Open Hands power: what a steading could be given right now (a Want we can meet from the stores), if anything. */
function openHandsPick(world: World, owner: number): { site: Discovery; n: number } | null {
  let best: { site: Discovery; n: number } | null = null;
  for (const s of steadingsOf(world)) {
    const w = s.st!.want;
    if (!(s.revealed & (1 << owner)) || !w || w.kind !== 'goods') continue;
    const n = Math.min(Math.max(1, w.n - w.progress[owner]), world.stored(owner, w.good), BALANCE.caravanLoad - 10);
    if (n >= 6 && (!best || n > best.n)) best = { site: s, n };
  }
  return best;
}

/** Can Open Hands do something worth doing right now? */
export const openHandsUseful = (world: World, owner: number) => !!openHandsPick(world, owner) || steadingsOf(world).some((s) => s.st!.ally !== owner && s.revealed & (1 << owner) && s.st!.favour[owner] < 60);

/** Hand a steading what it wants at once; or, with no Want to meet, win the least friendly one a little favour. */
export function openHands(world: World, owner: number): string | null {
  const pick = openHandsPick(world, owner);
  if (pick) {
    const w = pick.site.st!.want!;
    pay(world, owner, { [w.good]: pick.n });
    world.players[owner].caravanned += pick.n;
    w.progress[owner] += pick.n;
    if (w.progress[owner] >= w.n) endWant(world, pick.site, owner);
    else addFavour(world, pick.site, owner, Math.min(BALANCE.giftFavour, Math.floor(pick.n / 2)));
    return `${pick.site.st!.name} take ${pick.n} ${w.good} from your hands.`;
  }
  const poor = steadingsOf(world)
    .filter((s) => s.st!.ally !== owner && s.revealed & (1 << owner))
    .sort((a, b) => a.st!.favour[owner] - b.st!.favour[owner])[0];
  if (!poor) return null;
  addFavour(world, poor, owner, 12);
  return `${poor.st!.name} are warmed by your open hands: +12 favour.`;
}

/** Wants, favour, allegiance and gifts. Runs every 10 ticks. */
export function updateSteadings(world: World): void {
  if (world.tick % 10 !== 5) return;
  for (const s of steadingsOf(world)) {
    const st = s.st!;
    if (!st.want && world.tick >= st.nextWantAt) postWant(world, s);
    // When the finale begins, every steading lays aside whatever small Want it had and asks for the big one.
    if (st.want && !st.want.last && finaleOn(world)) {
      st.want = null;
      postWant(world, s);
    }
    const want = st.want;
    if (want) {
      let winner = NO_OWNER;
      if (want.kind === 'guard') {
        for (const p of world.players) if (watched(world, p.id, s.x, s.y)) want.progress[p.id]++;
        winner = world.players.find((p) => want.progress[p.id] >= want.n)?.id ?? NO_OWNER;
      }
      if (winner !== NO_OWNER) endWant(world, s, winner);
      else if (world.tick >= want.endsAt) endWant(world, s, NO_OWNER);
    }
    if (world.tick % BALANCE.favourFade === 5) for (const p of world.players) if (st.favour[p.id] > 0) addFavour(world, s, p.id, -1);
    if (st.ally !== NO_OWNER && world.tick >= st.giftAt) {
      st.giftAt = world.tick + BALANCE.giftEvery;
      const store = nearestStore(world, st.ally, s.x, s.y);
      const ch = STEADING_CHAR[st.char];
      if (store) {
        store.stock[ch.gift] += ch.giftN;
        world.emit({ type: 'steadingGift', siteId: s.id, owner: st.ally, good: ch.gift, n: ch.giftN });
      }
    }
  }
}

// ---- caravans -------------------------------------------------------------

/** Why a caravan can't go ('' when it can). */
export function caravanProblem(world: World, owner: number, siteId: number, good: Good, n: number): string {
  const s = world.sites.find((x) => x.id === siteId);
  if (!s?.st || !(s.revealed & (1 << owner))) return 'No steading there';
  if (!GOODS.includes(good) || n < 1) return 'Nothing to carry';
  if (world.caravans.filter((c) => c.owner === owner).length >= caravanMax(world, owner)) return `Your carts are all on the road (${caravanMax(world, owner)})`;
  if (world.stored(owner, good) < Math.min(n, 1)) return `No ${good} in store`;
  const store = nearestStore(world, owner, s.x, s.y);
  if (!store) return 'No store to load from';
  if (!world.routeOpen(world.entranceIdx(store), world.idx(s.x, s.y))) return 'No way there on foot: find a ford, or bridge the water';
  return '';
}

export const caravanMax = (world: World, owner: number) => BALANCE.caravanMax + (callingTier(world, owner, 'trader') >= 2 ? 1 : 0);

/** Load a cart at the store nearest the steading and send it (a Command). */
export function sendCaravan(world: World, owner: number, siteId: number, good: Good, n: number): void {
  n = Math.min(n, BALANCE.caravanLoad, world.stored(owner, good));
  if (caravanProblem(world, owner, siteId, good, n)) return;
  const s = world.sites.find((x) => x.id === siteId)!;
  const store = nearestStore(world, owner, s.x, s.y)!;
  const path = world.findRoute(world.entranceIdx(store), world.idx(s.x, s.y));
  if (!path || !path.length) return;
  pay(world, owner, { [good]: n });
  const e = world.entrance(store);
  world.caravans.push({ id: world.newId(), owner, siteId, good, n, path, step: 0, progress: 0, phase: 'out', x: e.x, y: e.y });
  world.emit({ type: 'caravanSent', owner, siteId, good, n });
}

function arrive(world: World, c: Caravan): void {
  const s = world.sites.find((x) => x.id === c.siteId);
  if (!s?.st) return;
  const st = s.st;
  const want = st.want;
  const p = world.players[c.owner];
  p.caravanned += c.n;
  let won = false;
  if (want && want.kind === 'goods' && want.good === c.good) {
    want.progress[c.owner] += c.n;
    if (want.progress[c.owner] >= want.n) {
      won = true;
      endWant(world, s, c.owner);
    }
  } else addFavour(world, s, c.owner, FINE_GOODS.includes(c.good) ? Math.min(BALANCE.giftFavour * 2, c.n) : Math.min(BALANCE.giftFavour, Math.floor(c.n / 2)));
  world.emit({ type: 'caravanArrived', owner: c.owner, siteId: c.siteId, good: c.good, n: c.n, won });
}

/** A manned post within `cheb` tiles of a point, belonging to anyone but `except` (or only to `only`). */
function mannedPost(world: World, x: number, y: number, range: number, test: (owner: number) => boolean): boolean {
  for (const b of world.buildings.values()) {
    if (!b.done || !test(b.owner) || !BUILDINGS[b.type].garrison || b.guarded < 1) continue;
    if (Math.max(Math.abs(b.x + 1 - x), Math.abs(b.y + 1 - y)) <= range) return true;
  }
  return false;
}

/**
 * Toll posts: a cart that passes close to a rival's manned post is stopped there and its goods scattered, unless one
 * of its own manned posts stands close by to escort it. Posts along the trade road matter as much as the road.
 */
function waylay(world: World): void {
  for (const c of [...world.caravans]) {
    if (c.phase !== 'out' || world.players[c.owner].buffs.timber > world.tick) continue;
    if (!mannedPost(world, c.x, c.y, BALANCE.tollRange, (o) => o !== c.owner && o >= 0)) continue;
    if (mannedPost(world, c.x, c.y, BALANCE.escortRange, (o) => o === c.owner)) continue;
    world.caravans.splice(world.caravans.indexOf(c), 1);
    world.emit({ type: 'caravanWaylaid', owner: c.owner, siteId: c.siteId, good: c.good, n: c.n, x: c.x, y: c.y });
  }
}

/** Would a cart sent to this steading be waylaid on the road? (Same rule as `waylay`, checked along the route.) */
const threatCache = new Map<string, { world: World; at: number; v: boolean }>();
export function routeThreat(world: World, owner: number, siteId: number): boolean {
  const key = `${owner}:${siteId}`;
  const hit = threatCache.get(key);
  if (hit && hit.world === world && world.tick - hit.at < 40 && world.tick >= hit.at) return hit.v;
  const v = computeThreat(world, owner, siteId);
  threatCache.set(key, { world, at: world.tick, v });
  return v;
}

function computeThreat(world: World, owner: number, siteId: number): boolean {
  const s = world.sites.find((x) => x.id === siteId);
  if (!s) return false;
  const store = nearestStore(world, owner, s.x, s.y);
  if (!store) return false;
  const path = world.findRoute(world.entranceIdx(store), world.idx(s.x, s.y));
  if (!path) return false;
  for (let k = 0; k < path.length; k += 2) {
    const x = path[k] % world.size;
    const y = (path[k] - x) / world.size;
    if (mannedPost(world, x, y, BALANCE.tollRange, (o) => o !== owner && o >= 0) && !mannedPost(world, x, y, BALANCE.escortRange, (o) => o === owner)) return true;
  }
  return false;
}

/** Walk the carts; goods are handed over on arrival. */
export function updateCaravans(world: World): void {
  if (!world.caravans.length) return;
  if (world.tick % 10 === 0) waylay(world);
  for (const c of [...world.caravans]) {
    c.progress += world.players[c.owner].buffs.timber > world.tick ? Math.floor((BALANCE.caravanSpeed * 3) / 2) : BALANCE.caravanSpeed;
    while (c.progress >= 1000 && c.step < c.path.length) {
      c.progress -= 1000;
      const i = c.path[c.step++];
      c.x = i % world.size;
      c.y = (i - c.x) / world.size;
    }
    if (c.step < c.path.length) continue;
    if (c.phase === 'out') {
      arrive(world, c);
      c.phase = 'home';
      c.path = [...c.path.slice(0, -1)].reverse();
      c.step = 0;
      c.progress = 0;
      if (!c.path.length) world.caravans.splice(world.caravans.indexOf(c), 1);
    } else {
      world.caravans.splice(world.caravans.indexOf(c), 1);
      world.emit({ type: 'caravanHome', owner: c.owner });
    }
  }
}

/** What to load for a steading: its Want's good (what is still missing, within what the store holds), else its gift's opposite. */
export function suggestLoad(world: World, owner: number, s: Discovery): { good: Good; n: number; wanted: boolean } | null {
  const st = s.st;
  if (!st) return null;
  const want = st.want;
  if (want && want.kind === 'goods') {
    const need = Math.max(1, want.n - want.progress[owner]);
    const have = world.stored(owner, want.good);
    return { good: want.good, n: Math.min(need, have, BALANCE.caravanLoad), wanted: true };
  }
  const ch = STEADING_CHAR[st.char];
  const [good] = ch.wants.reduce((a, w) => (world.stored(owner, w[0]) > world.stored(owner, a[0]) ? w : a), ch.wants[0]);
  // A grown-up town gifts what it makes: bread, ale and tools are worth more than raw goods.
  const fine = FINE_GOODS.reduce((a, g) => (world.stored(owner, g) > world.stored(owner, a) ? g : a), FINE_GOODS[0]);
  const pick = world.stored(owner, fine) >= 14 ? fine : good;
  return { good: pick, n: Math.min(12, world.stored(owner, pick)), wanted: false };
}
