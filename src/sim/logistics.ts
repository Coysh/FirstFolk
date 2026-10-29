import { BUILDINGS, FOODS, GOODS, outputGood, type Good } from './defs';
import { cheb, idleSettlers, nearestSettler, walkTo } from './settlers';
import type { Building, Settler, World } from './world';

/**
 * Request board: construction sites request materials, producers offer output, and idle
 * settlers (children first) claim the nearest haul task. M1 replaces free walking with
 * the road/carrier network but keeps this request/offer model.
 */
export function updateLogistics(world: World): void {
  for (const player of world.players) {
    const porters = idleSettlers(world, player.id, false);
    if (!porters.length) continue;

    for (const site of world.buildings.values()) {
      if (site.owner !== player.id || site.done) continue;
      for (const g of GOODS) {
        while (porters.length && world.siteNeeds(site, g) > 0) {
          const src = nearestSource(world, player.id, g, site);
          if (!src || !dispatch(world, porters, g, src, site)) break;
        }
      }
    }

    // Workshops request their input (e.g. logs for the Sawpit).
    for (const b of world.buildings.values()) {
      if (b.owner !== player.id || !b.done) continue;
      const job = BUILDINGS[b.type].job;
      if (!job || job.kind !== 'process' || !job.input) continue;
      // Keep a reserve in store so workshops never starve construction.
      while (porters.length && b.stock[job.input] + b.incoming[job.input] < job.inputCap && world.stored(player.id, job.input) > job.reserve) {
        const src = nearestSource(world, player.id, job.input, b);
        if (!src || !dispatch(world, porters, job.input, src, b)) break;
      }
    }

    // Producer output → storage, round-robin so one busy producer cannot starve the rest.
    // Scarce goods (and food when stores run low) go first.
    const pop = world.population(player.id);
    const offers: { b: Building; good: Good; score: number }[] = [];
    for (const b of world.buildings.values()) {
      if (b.owner !== player.id || !b.done) continue;
      const good = outputGood(b.type);
      if (!good) continue;
      const avail = b.stock[good] - b.reserved[good];
      if (avail <= 0) continue;
      const stored = world.stored(player.id, good);
      let score = avail;
      if (stored < 6) score += 6;
      if (FOODS.includes(good) && world.food(player.id) < pop) score += 10;
      offers.push({ b, good, score });
    }
    offers.sort((a, b) => b.score - a.score || a.b.id - b.b.id);
    let progress = true;
    while (porters.length && progress) {
      progress = false;
      for (const o of offers) {
        if (!porters.length) break;
        if (o.b.stock[o.good] - o.b.reserved[o.good] <= 0) continue;
        const dest = nearestStorage(world, player.id, o.b);
        if (dest && dispatch(world, porters, o.good, o.b, dest)) progress = true;
      }
    }
  }
}

function dispatch(world: World, porters: Settler[], good: Good, from: Building, to: Building): boolean {
  const e = world.entrance(from);
  const p = nearestSettler(world, porters, e.x, e.y, 4);
  if (!p) return false;
  porters.splice(porters.indexOf(p), 1);
  if (!walkTo(world, p, world.entranceIdx(from))) return false;
  from.reserved[good]++;
  to.incoming[good]++;
  p.job = { kind: 'haul', good, fromId: from.id, toId: to.id, phase: 'toSource' };
  p.busy = 0;
  p.tool = null;
  return true;
}

function nearestSource(world: World, owner: number, good: Good, site: Building): Building | undefined {
  const se = world.entrance(site);
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || !b.done || b === site) continue;
    // Only stores and a producer's own output are fair game; never a workshop's input.
    if (!BUILDINGS[b.type].storage && outputGood(b.type) !== good) continue;
    if (b.stock[good] - b.reserved[good] <= 0) continue;
    const e = world.entrance(b);
    const d = cheb(e.x, e.y, se.x, se.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function nearestStorage(world: World, owner: number, from: Building): Building | undefined {
  const fe = world.entrance(from);
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.storages(owner)) {
    const e = world.entrance(b);
    const d = cheb(e.x, e.y, fe.x, fe.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
