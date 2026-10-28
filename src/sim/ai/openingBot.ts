import { BUILDINGS, DISCOVERIES, FOODS, GOODS, GREAT_WORKS, type BuildingType, type Good, type NodeKind } from '../defs';
import { council, deedCost, deedOf, deedWait, outpostSpot } from '../deeds';
import { workOwner } from '../works';
import { FAIR_LOT, FAIR_VALUE, fairPrice, marketOpen } from '../market';
import type { World } from '../world';
import { NO_OWNER } from '../territory';
import { BALANCE } from '../balance';
import { canAfford, eventDef } from '../events';
import { BOON_TIMEOUT } from '../boons';
import { isHome } from '../population';
import { bestSite } from './placement';

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
   */
  constructor(
    private owner = 0,
    private thinkEvery = 100,
    fromTick = 0,
  ) {
    this.opening = this.opening.filter((o) => o.at > fromTick || fromTick === 0);
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
    // Boons: take the first card a few seconds after it's offered, like a quick human.
    for (const o of world.players[this.owner].offers)
      if (o.expires > 0 && o.expires - world.tick < BOON_TIMEOUT - 60) world.enqueue({ type: 'chooseBoon', owner: this.owner, offerId: o.id, choice: 0 });
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
    if (this.trade(world)) return;
    const hungry = world.food(this.owner) < 12;
    const home: BuildingType = world.isUnlocked(this.owner, 'longhouse') && this.affordable(world, 'longhouse') ? 'longhouse' : 'hut';
    const tower: BuildingType = world.isUnlocked(this.owner, 'watchtower') && this.affordable(world, 'watchtower') ? 'watchtower' : 'lookout';
    const towerSites = [...world.buildings.values()].filter((b) => b.owner === this.owner && BUILDINGS[b.type].claim && !b.done).length;
    const work = this.nextWork(world);
    const idle = [...world.settlers.values()].filter((s) => s.owner === this.owner && !s.child && !s.elder && s.job.kind === 'idle').length;
    const idleJob: BuildingType = (['woodcutter', 'quarry', 'fisher', 'forager'] as BuildingType[])[(world.tick / this.thinkEvery) % 4 | 0];
    const want: NodeKind | undefined = hungry ? 'bush' : starving('quarry') ? 'rock' : starving('woodcutter') ? 'tree' : undefined;

    // Ordered ideas; the first one that is wanted, affordable and has a valid site is done.
    const ideas: [boolean, BuildingType, { x: number; y: number }?, NodeKind?][] = [
      [emptyHuts === 0 && pop >= world.housing(this.owner) - 2, home],
      // Like a player following the goals: the first Lookout as soon as there are homes.
      [count('lookout') === 0 && count('hut') >= 2, 'lookout', target ?? undefined],
      [world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0, 'sawpit'],
      [world.isUnlocked(this.owner, 'watchtower') && count('watchtower') === 0, 'watchtower', target ?? undefined],
      [world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0, 'storehouse'],
      // The late game's race: always have one Great Work under way.
      [!!work, work ?? 'hut'],
      [hungry && world.isUnlocked(this.owner, 'fisher') && count('fisher') < Math.ceil(pop / 10), 'fisher'],
      [hungry && count('forager') < Math.ceil(pop / 6), 'forager'],
      // Push the border: towards a seen discovery, for room, or towards what we lack.
      [towerSites === 0 && (!!target || count('lookout') < pop / 8 || !!want), tower, target ?? undefined, want],
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
      const keep = FOODS.includes(g) ? Math.max(60, world.population(this.owner)) : 100;
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

  /** Use one ready family deed, when it would help. */
  private useDeed(world: World, target: { x: number; y: number } | null): boolean {
    const pop = world.population(this.owner);
    for (const fam of council(world, this.owner)) {
      if (deedWait(world, fam) > 0) continue;
      const id = deedOf(fam)!;
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
        case 'lessons':
          at = { x: 0, y: 0 };
          break;
        case 'expedition':
          at = target && world.territory[world.idx(target.x, target.y)] !== this.owner && outpostSpot(world, this.owner, target.x, target.y) ? target : null;
          break;
        case 'festival': {
          const contested = world.sites.find((st) => DISCOVERIES[st.kind].renown && st.heldBy !== this.owner && st.heldBy !== NO_OWNER && st.revealed & (1 << this.owner));
          at = contested ? this.edgeToward(world, contested) : null;
          break;
        }
      }
      if (!at) continue;
      world.enqueue({ type: 'deed', owner: this.owner, familyId: fam.id, x: at.x, y: at.y });
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

  /** Three of our towers already stand near it and it's still not ours: try somewhere else. */
  private stuckOn(world: World, site: { x: number; y: number }): boolean {
    let near = 0;
    for (const b of world.buildings.values()) if (b.owner === this.owner && (BUILDINGS[b.type].frontier || b.type === 'outpost') && Math.max(Math.abs(b.x - site.x), Math.abs(b.y - site.y)) <= 16) near++;
    return near >= 3;
  }

  private place(world: World, type: BuildingType, target?: { x: number; y: number }, want?: NodeKind): boolean {
    const site = bestSite(world, this.owner, type, target, { want });
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
    return !!site;
  }
}
