import { BALANCE } from './balance';
import { BUILDINGS, DISCOVERIES, GOODS, SKILLS, type Good } from './defs';
import { spawnFamily } from './population';
import { addRenown, mootUnderway } from './renown';
import { greatWorkDone } from './works';
import { craftXp } from './settlers';
import { TRADES } from './trades';
import { playerMod } from './houses';
import { guardCounts } from './settlers';
import type { Building, Discovery, World } from './world';

/**
 * The frontier, Settlers-style: buildings radiate influence (towers most, the hall more as
 * the settlement rises, homes a little, more for families of Masters), and each tile goes to
 * whoever's influence there is strongest. Borders push and pull all game; land nobody
 * contests stays with its holder, and a building's own footprint is never lost. Fog lifts
 * around buildings and wherever settlers walk. Discoveries hidden in the fog are claimed by
 * whoever's border covers them first; landmarks among them are held, and can change hands.
 */

export const NO_OWNER = -1;

export function owns(world: World, owner: number, x: number, y: number): boolean {
  return world.inBounds(x, y) && world.territory[world.idx(x, y)] === owner;
}

export function isExplored(world: World, owner: number, x: number, y: number): boolean {
  return world.inBounds(x, y) && (world.explored[world.idx(x, y)] & (1 << owner)) !== 0;
}

/** Grant unowned land in a disc outright (tests and scripted rewards). Returns tiles gained. */
export function claimArea(world: World, owner: number, cx: number, cy: number, r: number): number {
  let gained = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = world.idx(x, y);
      if (world.territory[i] !== NO_OWNER) continue;
      world.territory[i] = owner;
      gained++;
    }
  if (gained) {
    world.territoryVersion++;
    world.emit({ type: 'territoryGrew', owner, tiles: gained, x: cx, y: cy });
    updateHoldings(world);
  }
  revealArea(world, owner, cx, cy, r + 2);
  return gained;
}

export interface InfluenceSource {
  owner: number;
  x: number;
  y: number;
  /** Radius in tiles and strength at the centre. */
  r: number;
  p: number;
}

/** Everything that radiates influence right now. */
export function influenceSources(world: World, skipId = 0): InfluenceSource[] {
  const out: InfluenceSource[] = [];
  for (const b of world.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (!b.done || !def.claim || b.id === skipId) continue;
    const size = def.size;
    let r = def.claim + b.reach;
    let p = def.power ?? 60;
    if (b.type === 'wagon') {
      const rank = world.players[b.owner]?.rank ?? 0;
      r += rank * 4;
      p += rank * 30;
    }
    const slots = def.garrison ?? 0;
    if (slots && (world.players[b.owner]?.rank ?? 0) >= 1 && b.guarded < slots) {
      // Every banner needs a spear: an unmanned post pushes with half its power and less reach.
      p = Math.floor((p * (1 + b.guarded)) / (1 + slots));
      r -= Math.ceil((BALANCE.unmannedReach * (slots - b.guarded)) / slots);
    }
    out.push({ owner: b.owner, x: b.x + Math.floor(size / 2), y: b.y + Math.floor(size / 2), r, p });
  }
  for (const site of world.sites) {
    const aura = DISCOVERIES[site.kind].aura;
    if (aura && site.heldBy !== NO_OWNER) out.push({ owner: site.heldBy, x: site.x, y: site.y, r: aura[0], p: aura[1] });
  }
  for (const pl of world.players) for (const b of pl.boosts) if (b.until > world.tick) out.push({ owner: pl.id, x: b.x, y: b.y, r: b.r, p: b.p });
  return out;
}

let scratch: Int32Array[] = [];
let lockedScratch: Int8Array = new Int8Array(0);

/**
 * Who would hold each tile given these influence sources (pure: reads the current border
 * for tie-breaks and the challenger's margin, writes nothing). Returns a shared scratch array.
 */
function settle(world: World, sources: InfluenceSource[], out: Int8Array, skipId = 0): Int8Array {
  const n = world.size * world.size;
  const players = world.players.length;
  if (scratch.length !== players || scratch[0]?.length !== n) scratch = world.players.map(() => new Int32Array(n));
  for (const a of scratch) a.fill(0);
  const barrier = world.barriers();
  const size = world.size;
  for (const src of sources) {
    const inf = scratch[src.owner];
    if (!inf) continue;
    const rr = src.r * src.r + src.r;
    const y0 = Math.max(0, src.y - src.r);
    const y1 = Math.min(size - 1, src.y + src.r);
    const x0 = Math.max(0, src.x - src.r);
    const x1 = Math.min(size - 1, src.x + src.r);
    // Open ground all round (the common case): no need to look for water or mountains in the way.
    let walled = false;
    for (let y = y0; y <= y1 && !walled; y++) for (let x = x0; x <= x1; x++) if (barrier[y * size + x]) { walled = true; break; }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - src.x) ** 2 + (y - src.y) ** 2;
        if (d2 > src.r * src.r) continue;
        let v = Math.floor((src.p * (rr - d2)) / rr);
        if (walled && v > 0) {
          // Count the water and mountain tiles on the straight line from the post to this tile.
          const dx = x - src.x;
          const dy = y - src.y;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          let blocked = 0;
          for (let k = 1; k < steps; k++) blocked += barrier[(src.y + Math.round((dy * k) / steps)) * size + src.x + Math.round((dx * k) / steps)];
          if (blocked) v = Math.floor((v * Math.max(0, 100 - blocked * BALANCE.barrierPct)) / 100);
        }
        inf[y * size + x] += v;
      }
  }
  // Footprints and entrances always belong to their building's owner.
  if (lockedScratch.length !== n) lockedScratch = new Int8Array(n);
  const locked = lockedScratch.fill(NO_OWNER);
  for (const b of world.buildings.values()) {
    if (b.id === skipId) continue;
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy <= size; dy++) for (let dx = 0; dx < size; dx++) if (world.inBounds(b.x + dx, b.y + dy)) locked[world.idx(b.x + dx, b.y + dy)] = b.owner;
  }
  for (let i = 0; i < n; i++) {
    const cur = world.territory[i];
    let next = cur;
    if (locked[i] !== NO_OWNER) next = locked[i];
    else {
      let best = NO_OWNER;
      let bestV = 0;
      for (let o = 0; o < players; o++) {
        const v = scratch[o][i];
        if (v > bestV) {
          bestV = v;
          best = o;
        } else if (v === bestV && v > 0) best = cur === o ? o : best === cur ? best : NO_OWNER;
      }
      if (best !== NO_OWNER && best !== cur) {
        const hold = cur === NO_OWNER ? 0 : scratch[cur][i] + BALANCE.influenceMargin;
        if (bestV > hold) next = best;
      }
    }
    out[i] = next;
  }
  return out;
}

let previewScratch: Int8Array = new Int8Array(0);

/**
 * What a new influence source would do, for placement previews: tiles gained (from the wild
 * and from the rival), and the landmarks and finds it would bring over. Changes nothing.
 */
export function previewInfluence(world: World, extra: InfluenceSource): { gained: number; fromRival: number; sites: Discovery[] } {
  const n = world.size * world.size;
  if (previewScratch.length !== n) previewScratch = new Int8Array(n);
  const next = settle(world, [...influenceSources(world), extra], previewScratch);
  let gained = 0;
  let fromRival = 0;
  for (let i = 0; i < n; i++)
    if (next[i] === extra.owner && world.territory[i] !== extra.owner) {
      gained++;
      if (world.territory[i] !== NO_OWNER) fromRival++;
    }
  const sites = world.sites.filter((s) => {
    const i = world.idx(s.x, s.y);
    return next[i] === extra.owner && world.territory[i] !== extra.owner && (s.claimedBy === NO_OWNER || DISCOVERIES[s.kind].renown);
  });
  return { gained, fromRival, sites };
}

/**
 * What burning a building would do, for raid previews: tiles its owner would lose (and how
 * many the raider would gain), and the landmarks that would change hands. Changes nothing.
 */
export function previewRemoval(world: World, id: number, raider: number): { lost: number; gained: number; sites: Discovery[] } {
  const b = world.buildings.get(id);
  if (!b) return { lost: 0, gained: 0, sites: [] };
  const n = world.size * world.size;
  if (previewScratch.length !== n) previewScratch = new Int8Array(n);
  const next = settle(world, influenceSources(world, id), previewScratch, id);
  let lost = 0;
  let gained = 0;
  for (let i = 0; i < n; i++) {
    if (world.territory[i] === b.owner && next[i] !== b.owner) lost++;
    if (next[i] === raider && world.territory[i] !== raider) gained++;
  }
  const sites = world.sites.filter((s) => DISCOVERIES[s.kind].renown && s.heldBy === b.owner && next[world.idx(s.x, s.y)] !== b.owner);
  return { lost, gained, sites };
}

let settleScratch: Int8Array = new Int8Array(0);

/**
 * Re-draw the borders from influence. A tile changes hands only when the challenger's
 * influence beats the holder's by a margin, so borders are stable until really pushed.
 */
export function recomputeTerritory(world: World): void {
  updateGarrisons(world);
  const n = world.size * world.size;
  if (settleScratch.length !== n) settleScratch = new Int8Array(n);
  const owners = settle(world, influenceSources(world), settleScratch);
  const players = world.players.length;
  const gained = world.players.map(() => ({ n: 0, x: 0, y: 0 }));
  const lost = world.players.map(() => 0);
  for (let i = 0; i < n; i++) {
    const cur = world.territory[i];
    const next = owners[i];
    if (next === cur) continue;
    world.territory[i] = next;
    if (next !== NO_OWNER) {
      const g = gained[next];
      g.n++;
      g.x += i % world.size;
      g.y += Math.floor(i / world.size);
    }
    if (cur !== NO_OWNER) lost[cur]++;
  }
  let changed = false;
  for (let o = 0; o < players; o++) {
    const g = gained[o];
    if (!g.n) continue;
    changed = true;
    world.emit({ type: 'territoryGrew', owner: o, tiles: g.n, x: Math.floor(g.x / g.n), y: Math.floor(g.y / g.n) });
  }
  for (let o = 0; o < players; o++) if (lost[o] >= BALANCE.landLostNotice) world.emit({ type: 'landLost', owner: o, tiles: lost[o] });
  if (changed) {
    world.territoryVersion++;
    updateHoldings(world);
  }
}

/**
 * The guards a post counts for its influence: new guards count at once, but a post loses
 * them one at a time (every 10 s), so a guard stepping down to work never makes borders flicker.
 */
export function updateGarrisons(world: World): void {
  const guards = guardCounts(world);
  const slow = world.tick % BALANCE.garrisonEase < 20;
  for (const b of world.buildings.values()) {
    const slots = BUILDINGS[b.type].garrison;
    if (!slots) continue;
    const n = Math.min(slots, guards.get(b.id) ?? 0);
    if (n > b.guarded) b.guarded = n;
    else if (n < b.guarded && slow) b.guarded--;
  }
}

export function revealArea(world: World, owner: number, cx: number, cy: number, r: number): void {
  const bit = 1 << owner;
  let changed = false;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = world.idx(x, y);
      if (world.explored[i] & bit) continue;
      world.explored[i] |= bit;
      changed = true;
      const t = world.territory[i];
      if (t !== NO_OWNER && t !== owner && !world.players[owner].rivalSeen) {
        world.players[owner].rivalSeen = true;
        if (owner === 0) world.emit({ type: 'rivalSighted', x, y });
      }
    }
  if (!changed) return;
  world.fogVersion++;
  for (const site of world.sites) {
    if (site.revealed & bit || !(world.explored[world.idx(site.x, site.y)] & bit)) continue;
    site.revealed |= bit;
    if (site.claimedBy !== NO_OWNER) continue;
    world.players[owner].rumourAt = world.tick + BALANCE.rumourDelay;
    world.emit({ type: 'discovered', siteId: site.id, kind: site.kind, owner });
  }
}

/** A finished building claims and reveals its surroundings. */
export function onBuildingComplete(world: World, b: Building): void {
  const def = BUILDINGS[b.type];
  const cx = b.x + Math.floor(def.size / 2);
  const cy = b.y + Math.floor(def.size / 2);
  if (def.frontier) b.reach = playerMod(world, b.owner, 'claim');
  revealArea(world, b.owner, cx, cy, Math.max(def.reveal ?? 4, (def.claim ?? 0) + b.reach + 2));
  if (def.claim) recomputeTerritory(world);
  greatWorkDone(world, b);
}

/** Settlers lift the fog a little wherever they walk. Runs about once a second. */
export function updateExploration(world: World): void {
  const r = BALANCE.settlerSight;
  for (const s of world.settlers.values()) revealArea(world, s.owner, s.x, s.y, r + playerMod(world, s.owner, 'sight'));
  // Manned posts keep watch: whatever comes into view of a guarded tower is seen.
  if (world.tick % 50 === 5)
    for (const b of world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (b.done && def.garrison && b.guarded && def.reveal) revealArea(world, b.owner, b.x + 1, b.y + 1, def.reveal);
    }
  for (const p of world.players) updateRumours(world, p.id);
}

/**
 * There is always somewhere new to head for: when nothing has been spotted or claimed for
 * a while (even if a known site is out of reach), a traveller tells of the nearest unseen
 * discovery and its spot is revealed through the fog.
 */
function updateRumours(world: World, owner: number): void {
  const player = world.players[owner];
  const bit = 1 << owner;
  if (world.tick < player.rumourAt) return;
  player.rumourAt = world.tick + BALANCE.rumourDelay;
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  if (!wagon) return;
  let best: Discovery | undefined;
  let bestD = Infinity;
  for (const site of world.sites) {
    if (site.claimedBy !== NO_OWNER || site.revealed & bit) continue;
    const d = (site.x - wagon.x) ** 2 + (site.y - wagon.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  if (!best) return;
  world.emit({ type: 'rumour', siteId: best.id, kind: best.kind, owner, dir: compass(best.x - wagon.x, best.y - wagon.y) });
  revealArea(world, owner, best.x, best.y, 3);
}

/** Compass direction in the game's view (north is up the screen, -y). */
function compass(dx: number, dy: number): string {
  const ns = dy < -Math.abs(dx) / 2 ? 'north' : dy > Math.abs(dx) / 2 ? 'south' : '';
  const ew = dx > Math.abs(dy) / 2 ? 'east' : dx < -Math.abs(dy) / 2 ? 'west' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'nearby';
}

/**
 * First claims pay a discovery's one-off reward; landmarks then follow the border, and
 * changing hands is news for both sides.
 */
export function updateHoldings(world: World): void {
  for (const site of world.sites) {
    const owner = world.territory[world.idx(site.x, site.y)];
    if (owner === NO_OWNER || !world.players[owner]) continue;
    if (site.claimedBy === NO_OWNER) {
      site.claimedBy = owner;
      world.players[owner].claimed++;
      world.players[owner].rumourAt = world.tick + BALANCE.rumourDelay;
      if (DISCOVERIES[site.kind].renown) site.heldBy = owner;
      const text = claimReward(world, site, owner);
      world.emit({ type: 'claimed', siteId: site.id, kind: site.kind, owner, text });
      addRenown(world, owner, BALANCE.renown.discovery, 'discoveries', site.x, site.y);
    } else if (DISCOVERIES[site.kind].renown && site.heldBy !== owner) {
      const from = site.heldBy;
      site.heldBy = owner;
      world.emit({ type: 'holdingChanged', siteId: site.id, kind: site.kind, owner, from });
      if (from !== NO_OWNER && !world.quietSeize) {
        // Taking a landmark is worth more the further behind you are, and double at the Moot.
        const taker = world.players[owner];
        const behind = Math.max(0, (world.players[from]?.renown ?? 0) - taker.renown);
        const prize = (BALANCE.renown.seized + Math.min(BALANCE.renown.seizedMax, Math.floor(behind / 8))) * (mootUnderway(world) ? 2 : 1);
        taker.taken++;
        addRenown(world, owner, prize, 'landmarks', site.x, site.y);
      }
    }
  }
}

/** Apply a discovery's reward. Returns a one-line description for the banner. */
function claimReward(world: World, site: Discovery, owner: number): string {
  switch (site.kind) {
    case 'cart': {
      const store = nearestStore(world, owner, site.x, site.y);
      const loot: Partial<Record<Good, number>> = { logs: 12, stone: 6, planks: 4, berries: 12 };
      if (store) for (const g of GOODS) store.stock[g] += loot[g] ?? 0;
      return '+12 logs, +6 stone, +4 planks and +12 berries';
    }
    case 'ruins': {
      // The carvings teach the craft your town knows least.
      const skill = weakestCraft(world, owner);
      craftXp(world, owner, skill, BALANCE.ruinsXp, site.x, site.y);
      return `Old carvings: ${TRADES[skill].name} +${BALANCE.ruinsXp}`;
    }
    case 'wanderers': {
      spawnFamily(world, world.players[owner], null, site.x, site.y, 4, BALANCE.wandererSkill);
      return 'A family of four joins you, and teaches your town their craft. Build them a hut!';
    }
    case 'barrow': {
      // The ancient's craft: whichever your town knows best, so the legend pays off at once.
      const crafts = world.players[owner].crafts;
      const skill = SKILLS.reduce((a, k) => (crafts[k] > crafts[a] ? k : a), SKILLS[0]);
      world.players[owner].legends.push({ name: 'The Ancient', surname: '', skill, tick: world.tick });
      addRenown(world, owner, BALANCE.renown.legend, 'legends', site.x, site.y);
      return `An ancient Master’s legend: ${TRADES[skill].name} is ${BALANCE.legendPct}% faster for good`;
    }
    case 'hermit': {
      // An old Master comes down from the hills to teach the craft your town knows least.
      const skill = weakestCraft(world, owner);
      craftXp(world, owner, skill, BALANCE.hermitXp, site.x, site.y);
      return `A hermit teaches your folk: ${TRADES[skill].name} +${BALANCE.hermitXp}`;
    }
    case 'hoard': {
      const store = nearestStore(world, owner, site.x, site.y);
      if (store) {
        store.stock.planks += 10;
        store.stock.stone += 10;
      }
      addRenown(world, owner, BALANCE.renown.hoard, 'discoveries', site.x, site.y);
      return `Silver and treasures: +${BALANCE.renown.hoard} renown, +10 planks and +10 stone`;
    }
    case 'shrine': {
      // The shrine's blessing: every Great House's power is ready at once.
      for (const seat of world.players[owner].seats) seat.ready = Math.min(seat.ready, world.tick);
      return `A landmark: +${DISCOVERIES.shrine.renown} renown a minute while you hold it, and the shrine's blessing makes every house power ready now`;
    }
    case 'stones':
      return `The land around the stones follows you now. +${DISCOVERIES.stones.renown} renown a minute while you hold them`;
    default:
      return DISCOVERIES[site.kind].renown ? `A landmark: +${DISCOVERIES[site.kind].renown} renown a minute while you hold it` : DISCOVERIES[site.kind].blurb;
  }
}

function weakestCraft(world: World, owner: number): (typeof SKILLS)[number] {
  const crafts = world.players[owner].crafts;
  return SKILLS.reduce((a, k) => (crafts[k] < crafts[a] ? k : a), SKILLS[0]);
}

function nearestStore(world: World, owner: number, x: number, y: number): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.storages(owner)) {
    const d = Math.max(Math.abs(b.x - x), Math.abs(b.y - y));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Bounding box of a player's land (cached per territory version), for searches and flood fills. */
export function territoryBox(world: World, owner: number): { x0: number; y0: number; x1: number; y1: number } {
  const cached = world.boxCache[owner];
  if (cached && cached.version === world.territoryVersion) return cached.box;
  let x0 = world.size;
  let y0 = world.size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < world.size; y++)
    for (let x = 0; x < world.size; x++)
      if (world.territory[y * world.size + x] === owner) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const box = { x0, y0, x1, y1 };
  world.boxCache[owner] = { version: world.territoryVersion, box };
  return box;
}
