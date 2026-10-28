import { BALANCE, TICK_HZ } from './balance';
import type { Good } from './defs';
import { GOODS } from './defs';
import { callingTier } from './callings';
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

const GUARD_CHANCE = 4; // one Want in this many asks for a manned post, not goods

function postWant(world: World, s: Discovery): void {
  const st = s.st!;
  const char = STEADING_CHAR[st.char];
  const guard = world.rng.int(GUARD_CHANCE) === 0;
  const [good, lo, hi] = char.wants[world.rng.int(char.wants.length)];
  // Early Wants are small, so the first minutes have something a young town can answer; they grow to full size by about 15:00.
  const scale = 50 + Math.min(50, Math.floor(world.tick / (TICK_HZ * 18)));
  const n = guard ? Math.round(BALANCE.guardTicks / TICK_HZ) : Math.max(6, Math.floor((world.rng.range(lo, hi) * scale) / 100));
  st.want = { kind: guard ? 'guard' : 'goods', good, n, endsAt: world.tick + BALANCE.wantTicks, progress: new Array(world.players.length).fill(0) };
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
  addFavour(world, s, winner, BALANCE.wantWin);
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

/** Wants, favour, allegiance and gifts. Runs every 10 ticks. */
export function updateSteadings(world: World): void {
  if (world.tick % 10 !== 5) return;
  for (const s of steadingsOf(world)) {
    const st = s.st!;
    if (!st.want && world.tick >= st.nextWantAt) postWant(world, s);
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
  if (!world.sameRegion(world.entranceIdx(store), world.idx(s.x, s.y))) return 'No way there on foot: find a ford, or bridge the water';
  return '';
}

export const caravanMax = (world: World, owner: number) => BALANCE.caravanMax + (callingTier(world, owner, 'trader') >= 2 ? 1 : 0);

/** Load a cart at the store nearest the steading and send it (a Command). */
export function sendCaravan(world: World, owner: number, siteId: number, good: Good, n: number): void {
  n = Math.min(n, BALANCE.caravanLoad, world.stored(owner, good));
  if (caravanProblem(world, owner, siteId, good, n)) return;
  const s = world.sites.find((x) => x.id === siteId)!;
  const store = nearestStore(world, owner, s.x, s.y)!;
  const path = world.pathfinder.find(world.entranceIdx(store), world.idx(s.x, s.y));
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
  } else addFavour(world, s, c.owner, Math.min(BALANCE.giftFavour, Math.floor(c.n / 4)));
  world.emit({ type: 'caravanArrived', owner: c.owner, siteId: c.siteId, good: c.good, n: c.n, won });
}

/** Walk the carts; goods are handed over on arrival. */
export function updateCaravans(world: World): void {
  if (!world.caravans.length) return;
  for (const c of [...world.caravans]) {
    c.progress += BALANCE.caravanSpeed;
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
  return { good, n: Math.min(12, world.stored(owner, good)), wanted: false };
}
