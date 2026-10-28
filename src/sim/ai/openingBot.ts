import { BUILDINGS, type BuildingType, type Good, type NodeKind } from '../defs';
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
    const hungry = world.food(this.owner) < 12;
    const home: BuildingType = world.isUnlocked(this.owner, 'longhouse') && this.affordable(world, 'longhouse') ? 'longhouse' : 'hut';
    const tower: BuildingType = world.isUnlocked(this.owner, 'watchtower') && this.affordable(world, 'watchtower') ? 'watchtower' : 'lookout';
    const towerSites = [...world.buildings.values()].filter((b) => b.owner === this.owner && BUILDINGS[b.type].claim && !b.done).length;
    const want: NodeKind | undefined = hungry ? 'bush' : starving('quarry') ? 'rock' : starving('woodcutter') ? 'tree' : undefined;

    // Ordered ideas; the first one that is wanted, affordable and has a valid site is done.
    const ideas: [boolean, BuildingType, { x: number; y: number }?, NodeKind?][] = [
      [emptyHuts === 0 && pop >= world.housing(this.owner) - 2, home],
      [world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0, 'sawpit'],
      [world.isUnlocked(this.owner, 'watchtower') && count('watchtower') === 0, 'watchtower', target ?? undefined],
      [world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0, 'storehouse'],
      [hungry && world.isUnlocked(this.owner, 'fisher') && count('fisher') < Math.ceil(pop / 10), 'fisher'],
      [hungry && count('forager') < Math.ceil(pop / 6), 'forager'],
      // Push the border: towards a seen discovery, for room, or towards what we lack.
      [towerSites === 0 && (!!target || count('lookout') < pop / 8 || !!want), tower, target ?? undefined, want],
      [starving('woodcutter') && count('forester') < count('woodcutter') / 2, 'forester'],
      [count('woodcutter') < Math.ceil(pop / 7), 'woodcutter'],
      [emptyHuts === 0, 'hut'],
      [count('quarry') < Math.ceil(pop / 12), 'quarry'],
    ];
    for (const [wanted, type, tgt, w] of ideas) if (wanted && world.isUnlocked(this.owner, type) && this.affordable(world, type) && this.place(world, type, tgt, w)) return;
  }

  private affordable(world: World, type: BuildingType): boolean {
    const cost = BUILDINGS[type].cost;
    return Object.entries(cost).every(([g, n]) => world.stored(this.owner, g as never) >= (n ?? 0));
  }

  /** Nearest discovery this player has seen but nobody has claimed. */
  private frontierTarget(world: World): { x: number; y: number } | null {
    const wagon = [...world.buildings.values()].find((b) => b.owner === this.owner && b.type === 'wagon');
    if (!wagon) return null;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const site of world.sites) {
      if (site.claimedBy !== NO_OWNER || !(site.revealed & (1 << this.owner))) continue;
      const d = Math.max(Math.abs(site.x - wagon.x), Math.abs(site.y - wagon.y));
      if (d < bestD) {
        bestD = d;
        best = site;
      }
    }
    return best;
  }

  private place(world: World, type: BuildingType, target?: { x: number; y: number }, want?: NodeKind): boolean {
    const site = bestSite(world, this.owner, type, target, { want });
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
    return !!site;
  }
}
