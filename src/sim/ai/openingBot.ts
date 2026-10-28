import { BUILDINGS, DISCOVERIES, FOODS, GOODS, GREAT_WORKS, type BuildingType, type Good, type NodeKind } from '../defs';
import { deedCost, deedWait, outpostSpot } from '../deeds';
import { HOUSES, HOUSE_TIMEOUT } from '../houses';
import { workOwner } from '../works';
import { FAIR_LOT, FAIR_VALUE, fairPrice, marketOpen } from '../market';
import type { World } from '../world';
import { NO_OWNER } from '../territory';
import { BALANCE } from '../balance';
import { canAfford, eventDef } from '../events';
import { isHome } from '../population';
import { bestSite } from './placement';
import { STYLES, type BotStyle } from './styles';
import { defenceOf, hallOf, huscarls, raidProblem, raidStrength, raidable } from '../warfare';
import { previewRemoval } from '../territory';

type Idea = [boolean, BuildingType, { x: number; y: number }?, NodeKind?];

/**
 * A simple "competent player" used by headless playtests: a fixed opening, then
 * reactive expansion. It acts only through Commands, exactly like a human.
 */
export class OpeningBot {
  private opening: { at: number; type: BuildingType }[] = [
    { at: 0, type: 'woodcutter' },
    { at: 10, type: 'forager' },
    { at: 60, type: 'quarry' },
    { at: 150, type: 'hut' },
    { at: 600, type: 'forester' },
    { at: 900, type: 'hut' },
  ];

  /**
   * @param thinkEvery ticks between strategic decisions (the rival's difficulty knob)
   * @param fromTick skip opening moves already made (when restoring a save)
   * @param style its priorities (see styles.ts)
   */
  constructor(
    private owner = 0,
    private thinkEvery = 100,
    fromTick = 0,
    readonly style: BotStyle = 'balanced',
  ) {
    this.opening = this.opening.filter((o) => o.at >= fromTick);
  }

  update(world: World): void {
    if (world.tick % 10 !== 0) return;
    // Events: take the first option it can afford after a few seconds' thought.
    const ev = world.players[this.owner].event;
    if (ev && ev.expires - world.tick < BALANCE.eventTimeout - 60) {
      const def = eventDef(ev.def)!;
      const pick = def.options.findIndex((o) => canAfford(world, this.owner, o.cost));
      world.enqueue({ type: 'chooseEvent', owner: this.owner, eventId: ev.id, option: pick < 0 ? def.options.length - 1 : pick });
    }
    // A house letter: the house its style likes best, a few seconds after it's offered.
    const offer = world.players[this.owner].houseOffer;
    if (offer && offer.expires - world.tick < HOUSE_TIMEOUT - 60) {
      const prefs = STYLES[this.style].houses;
      const rank = (h: string) => (prefs.indexOf(h as never) + 100) % 100;
      const best = offer.choices.reduce((a, h, i) => (rank(h) < rank(offer.choices[a]) ? i : a), 0);
      world.enqueue({ type: 'chooseHouse', owner: this.owner, offerId: offer.id, choice: best });
    }
    while (this.opening.length && this.opening[0].at <= world.tick) {
      this.place(world, this.opening.shift()!.type);
    }
    if (this.opening.length || world.tick % this.thinkEvery !== 0) return;

    const pop = world.population(this.owner);
    const sites = [...world.buildings.values()].filter((b) => b.owner === this.owner && !b.done).length;
    if (sites >= 2) return;
    const emptyHuts = [...world.buildings.values()].filter((b) => b.owner === this.owner && isHome(b.type) && b.familyId === 0).length;
    const count = (t: BuildingType) => world.countBuildings(this.owner, t, true);

    const LOW: Partial<Record<BuildingType, [Good, number]>> = { quarry: ['stone', 12], woodcutter: ['logs', 20] };
    const starving = (t: BuildingType) =>
      world.stored(this.owner, LOW[t]![0]) < LOW[t]![1] && [...world.buildings.values()].some((b) => b.owner === this.owner && b.type === t && b.alert === 'noResource');
    // Like a tidy human: clear away a gatherer whose resources are gone (then keep thinking).
    for (const b of world.buildings.values())
      if (b.owner === this.owner && b.done && b.alert === 'noResource' && BUILDINGS[b.type].job?.kind === 'gather' && world.countBuildings(this.owner, b.type) > 1) {
        world.enqueue({ type: 'demolish', owner: this.owner, id: b.id });
        break;
      }
    const target = this.frontierTarget(world);
    if (this.useDeed(world, target)) return;
    if (this.raid(world)) return;
    if (this.trade(world)) return;
    const hungry = world.food(this.owner) < 12;
    const home: BuildingType = world.isUnlocked(this.owner, 'longhouse') && this.affordable(world, 'longhouse') ? 'longhouse' : 'hut';
    const tower: BuildingType = world.isUnlocked(this.owner, 'watchtower') && this.affordable(world, 'watchtower') ? 'watchtower' : 'lookout';
    const towerSites = [...world.buildings.values()].filter((b) => b.owner === this.owner && BUILDINGS[b.type].claim && !b.done).length;
    const work = this.nextWork(world);
    const idle = [...world.settlers.values()].filter((s) => s.owner === this.owner && !s.child && !s.elder && s.job.kind === 'idle').length;
    const idleJob: BuildingType = (['woodcutter', 'quarry', 'fisher', 'forager'] as BuildingType[])[(world.tick / this.thinkEvery) % 4 | 0];
    const want: NodeKind | undefined = hungry ? 'bush' : starving('quarry') ? 'rock' : starving('woodcutter') ? 'tree' : undefined;
    const st = STYLES[this.style];
    // Push the border: towards a seen discovery, for room, or towards what we lack.
    const towers = count('lookout') + (this.style === 'balanced' ? 0 : count('watchtower') + count('outpost'));
    const hold = this.landmarkToHold(world);
    const keep: Idea = [!!hold && st.stockades, 'stockade', hold ?? undefined];
    const muster: Idea = [st.muster && count('musterhall') === 0 && pop >= 24, 'musterhall'];
    const push: Idea = [towerSites === 0 && (!!target || !!want || (!st.towersOnlyWithAim && towers < pop / st.towerPer)), tower, target ?? undefined, want];

    // Ordered ideas; the first one that is wanted, affordable and has a valid site is done.
    const ideas: Idea[] = [
      [emptyHuts === 0 && pop >= world.housing(this.owner) - 2, home],
      // Like a player following the goals: the first Lookout as soon as there are homes.
      [count('lookout') === 0 && count('hut') >= 2, 'lookout', target ?? undefined],
      [world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0, 'sawpit'],
      [world.isUnlocked(this.owner, 'watchtower') && count('watchtower') === 0, 'watchtower', target ?? undefined],
      [world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0, 'storehouse'],
      ...(st.towersFirst ? [push, keep] : [keep]),
      ...(st.raids === 2 ? [muster] : []),
      // The late game's race: always have one Great Work under way.
      [!!work, work ?? 'hut'],
      [hungry && world.isUnlocked(this.owner, 'fisher') && count('fisher') < Math.ceil(pop / 10), 'fisher'],
      [hungry && count('forager') < Math.ceil(pop / 6), 'forager'],
      ...(st.towersFirst ? [] : [push]),
      ...(st.raids === 2 ? [] : [muster]),
      [starving('woodcutter') && count('forester') < count('woodcutter') / 2, 'forester'],
      [count('woodcutter') < Math.ceil(pop / 7) && world.stored(this.owner, 'logs') < 80, 'woodcutter'],
      [emptyHuts === 0, 'hut'],
      [count('quarry') < Math.ceil(pop / 12) && world.stored(this.owner, 'stone') < 60, 'quarry'],
      // Hands with nothing to do: put them to work, since everything sells on Market Day.
      [idle > 4 && count('sawpit') < 1 + count('woodcutter') / 4, 'sawpit'],
      [idle > 4, idleJob],
    ];
    for (const [wanted, type, tgt, w] of ideas) if (wanted && world.isUnlocked(this.owner, type) && this.affordable(world, type) && this.place(world, type, tgt, w)) return;
  }

  private affordable(world: World, type: BuildingType): boolean {
    // Great Works are begun with a good part in store; the rest arrives as it's gathered.
    if (BUILDINGS[type].great) return Object.entries(BUILDINGS[type].cost).every(([g, n]) => world.stored(this.owner, g as Good) * 10 >= (n ?? 0) * 4);
    return world.canAffordBuilding(this.owner, type);
  }

  /**
   * Where to push the border next: the nearest discovery seen but unclaimed, or a landmark
   * someone else holds (or nobody does). Distances are from the hall, so it fights for the
   * middle of the valley before the far side.
   */
  private frontierTarget(world: World): { x: number; y: number } | null {
    const wagon = [...world.buildings.values()].find((b) => b.owner === this.owner && b.type === 'wagon');
    if (!wagon) return null;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const site of world.sites) {
      if (!(site.revealed & (1 << this.owner))) continue;
      const open = site.claimedBy === NO_OWNER || (!!DISCOVERIES[site.kind].renown && site.heldBy !== this.owner);
      if (!open || this.stuckOn(world, site)) continue;
      // Landmarks are worth a longer reach.
      const d = Math.max(Math.abs(site.x - wagon.x), Math.abs(site.y - wagon.y)) - (DISCOVERIES[site.kind].renown ?? 0) * 2;
      if (d < bestD) {
        bestD = d;
        best = site;
      }
    }
    return best;
  }

  /** Sell a lot of whatever is piling up, if the market still pays. */
  private trade(world: World): boolean {
    if (!marketOpen(world, this.owner)) return false;
    for (const g of GOODS) {
      const keep = FOODS.includes(g) ? Math.max(60, world.population(this.owner)) : STYLES[this.style].sellKeep;
      if (world.stored(this.owner, g) - FAIR_LOT >= keep && fairPrice(world, this.owner, g) * 10 >= FAIR_VALUE[g] * 6) {
        world.enqueue({ type: 'sell', owner: this.owner, good: g });
        return true;
      }
    }
    return false;
  }

  /** A Great Work to begin: none under way, still unclaimed in the valley, the one we can best afford. */
  private nextWork(world: World): BuildingType | null {
    if (GREAT_WORKS.some((t) => world.countBuildings(this.owner, t, true) > world.countBuildings(this.owner, t))) return null;
    let best: BuildingType | null = null;
    let bestScore = -Infinity;
    for (const t of GREAT_WORKS) {
      if (!world.isUnlocked(this.owner, t) || workOwner(world, t) >= 0) continue;
      const cost = BUILDINGS[t].cost;
      const score = Object.entries(cost).reduce((n, [g, c]) => n + Math.min(1, world.stored(this.owner, g as Good) / (c ?? 1)), 0) / Object.keys(cost).length;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /** Call on one ready house power, when it would help. */
  private useDeed(world: World, target: { x: number; y: number } | null): boolean {
    const pop = world.population(this.owner);
    const seats = world.players[this.owner].seats;
    for (let k = 0; k < seats.length; k++) {
      if (deedWait(world, seats[k]) > 0) continue;
      const id = HOUSES[seats[k].house].power;
      if (!canAfford(world, this.owner, deedCost(world, this.owner, id))) continue;
      let at: { x: number; y: number } | null = null;
      switch (id) {
        case 'raise': {
          const sites = [...world.buildings.values()].filter((b) => b.owner === this.owner && !b.done);
          sites.sort((a, b) => (BUILDINGS[b.type].great ? 1 : 0) - (BUILDINGS[a.type].great ? 1 : 0) || a.id - b.id);
          at = sites[0] ?? null;
          break;
        }
        case 'timber':
          at = world.stored(this.owner, 'logs') < 80 ? { x: 0, y: 0 } : null;
          break;
        case 'harvest':
          at = world.food(this.owner) < pop ? { x: 0, y: 0 } : null;
          break;
        case 'warhorn':
          at = hallOf(world, this.owner) && !world.players[this.owner].warhorn && world.tick >= BALANCE.raidsFrom ? { x: 0, y: 0 } : null;
          break;
        case 'shieldwall': {
          // Where raiders or reavers are heading.
          const band = world.warbands.find((b) => b.phase === 'march' && world.buildings.get(b.targetId)?.owner === this.owner);
          const t = band && world.buildings.get(band.targetId);
          at = t ? { x: t.x, y: t.y } : null;
          break;
        }
        case 'expedition':
          at = target && world.territory[world.idx(target.x, target.y)] !== this.owner && outpostSpot(world, this.owner, target.x, target.y) ? target : null;
          break;
        case 'festival': {
          // A landmark we don't hold (a rival's, or nobody's yet) close to our border.
          const contested = world.sites.find((st) => DISCOVERIES[st.kind].renown && st.heldBy !== this.owner && st.revealed & (1 << this.owner) && this.edgeToward(world, st));
          at = contested ? this.edgeToward(world, contested) : null;
          break;
        }
      }
      if (!at) continue;
      world.enqueue({ type: 'deed', owner: this.owner, seat: k, x: at.x, y: at.y });
      return true;
    }
    return false;
  }

  /** Our land's nearest tile on the way from a point back to the hall (within 12 tiles of it). */
  private edgeToward(world: World, p: { x: number; y: number }): { x: number; y: number } | null {
    const wagon = [...world.buildings.values()].find((b) => b.owner === this.owner && b.type === 'wagon');
    if (!wagon) return null;
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const x = p.x + Math.round(((wagon.x - p.x) * i) / steps);
      const y = p.y + Math.round(((wagon.y - p.y) * i) / steps);
      if (world.territory[world.idx(x, y)] === this.owner) return Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 12 ? { x, y } : null;
    }
    return null;
  }

  /** Send the huscarls against the rival post that is worth most and that they can beat. */
  private raid(world: World): boolean {
    const st = STYLES[this.style];
    if (!st.raids) return false;
    const hall = hallOf(world, this.owner);
    const n = huscarls(world, hall);
    if (!hall || n < 2) return false;
    const attack = raidStrength(world, this.owner, n);
    let best: { id: number; value: number } | null = null;
    for (const b of world.buildings.values()) {
      if (b.owner === this.owner || !raidable(b) || raidProblem(world, this.owner, b.id)) continue;
      if (defenceOf(world, b) >= attack) continue;
      const pv = previewRemoval(world, b.id, this.owner);
      if (st.raids === 1 && !pv.sites.length && pv.gained < 25) continue;
      const value = pv.sites.length * 40 + pv.gained / 8 + (b.guarded ? 10 : 0) - Math.max(Math.abs(b.x - hall.x), Math.abs(b.y - hall.y)) / 4;
      if (!best || value > best.value) best = { id: b.id, value };
    }
    if (!best) return false;
    world.enqueue({ type: 'raid', owner: this.owner, targetId: best.id });
    return true;
  }

  /** A landmark we hold with the rival's land close by and no stockade guarding it yet. */
  private landmarkToHold(world: World): { x: number; y: number } | null {
    if (!world.isUnlocked(this.owner, 'stockade') || world.countBuildings(this.owner, 'stockade', true) > world.countBuildings(this.owner, 'stockade')) return null;
    for (const site of world.sites) {
      if (site.heldBy !== this.owner || !DISCOVERIES[site.kind].renown) continue;
      const guarded = [...world.buildings.values()].some((b) => b.owner === this.owner && b.type === 'stockade' && Math.max(Math.abs(b.x - site.x), Math.abs(b.y - site.y)) <= 7);
      if (guarded) continue;
      let threatened = false;
      for (let dy = -10; dy <= 10 && !threatened; dy += 2)
        for (let dx = -10; dx <= 10 && !threatened; dx += 2) {
          const x = site.x + dx;
          const y = site.y + dy;
          if (world.inBounds(x, y) && world.territory[world.idx(x, y)] !== NO_OWNER && world.territory[world.idx(x, y)] !== this.owner) threatened = true;
        }
      if (threatened) return site;
    }
    return null;
  }

  /** Three of our towers already stand right by it and it's still not ours: try somewhere else. */
  private stuckOn(world: World, site: { x: number; y: number }): boolean {
    let near = 0;
    for (const b of world.buildings.values()) if (b.owner === this.owner && (BUILDINGS[b.type].frontier || b.type === 'outpost') && Math.max(Math.abs(b.x - site.x), Math.abs(b.y - site.y)) <= 10) near++;
    return near >= 3;
  }

  private place(world: World, type: BuildingType, target?: { x: number; y: number }, want?: NodeKind): boolean {
    const site = bestSite(world, this.owner, type, target, { want });
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
    return !!site;
  }
}
