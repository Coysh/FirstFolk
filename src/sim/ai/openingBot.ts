import { BUILDINGS, type BuildingType, type Good, type NodeKind } from '../defs';
import type { World } from '../world';
import { NO_OWNER } from '../territory';
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

  constructor(private owner = 0) {}

  update(world: World): void {
    if (world.tick % 10 !== 0) return;
    // Boons: take the first card a few seconds after it's offered, like a quick human.
    for (const o of world.players[this.owner].offers)
      if (o.expires - world.tick < 550) world.enqueue({ type: 'chooseBoon', owner: this.owner, offerId: o.id, choice: 0 });
    while (this.opening.length && this.opening[0].at <= world.tick) {
      this.place(world, this.opening.shift()!.type);
    }
    if (this.opening.length || world.tick % 100 !== 0) return;

    const pop = world.population(this.owner);
    const sites = [...world.buildings.values()].filter((b) => b.owner === this.owner && !b.done).length;
    if (sites >= 2) return;
    const emptyHuts = [...world.buildings.values()].filter((b) => b.owner === this.owner && isHome(b.type) && b.familyId === 0).length;
    const count = (t: BuildingType) => world.countBuildings(this.owner, t, true);

    const LOW: Partial<Record<BuildingType, [Good, number]>> = { quarry: ['stone', 12], woodcutter: ['logs', 20] };
    const starving = (t: BuildingType) =>
      world.stored(this.owner, LOW[t]![0]) < LOW[t]![1] && [...world.buildings.values()].some((b) => b.owner === this.owner && b.type === t && b.alert === 'noResource');
    // Like a tidy human: clear away gatherers whose resources are gone.
    for (const b of world.buildings.values())
      if (b.owner === this.owner && b.done && b.alert === 'noResource' && BUILDINGS[b.type].job?.kind === 'gather' && world.countBuildings(this.owner, b.type) > 1) {
        world.enqueue({ type: 'demolish', owner: this.owner, id: b.id });
        return;
      }
    const target = this.frontierTarget(world);

    const home: BuildingType = world.isUnlocked(this.owner, 'longhouse') && this.affordable(world, 'longhouse') ? 'longhouse' : 'hut';
    const tower: BuildingType = world.isUnlocked(this.owner, 'watchtower') && this.affordable(world, 'watchtower') ? 'watchtower' : 'lookout';
    const lookoutSites = [...world.buildings.values()].filter((b) => b.owner === this.owner && BUILDINGS[b.type].claim && !b.done).length;
    if (emptyHuts === 0 && pop >= world.housing(this.owner) - 2 && this.affordable(world, home)) this.place(world, home);
    else if (world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0) this.place(world, 'sawpit');
    else if (world.isUnlocked(this.owner, 'watchtower') && count('watchtower') === 0 && this.affordable(world, 'watchtower')) this.place(world, 'watchtower', target ?? undefined);
    else if (world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0 && this.affordable(world, 'storehouse')) this.place(world, 'storehouse');
    else if (world.food(this.owner) < 12 && world.isUnlocked(this.owner, 'fisher') && count('fisher') < Math.ceil(pop / 10) && bestSite(world, this.owner, 'fisher')) this.place(world, 'fisher');
    else if (world.food(this.owner) < 12 && count('forager') < Math.ceil(pop / 6)) this.place(world, 'forager');
    // Push the border: towards a seen discovery, or for room once the land fills up.
    else if (lookoutSites === 0 && this.affordable(world, 'lookout') && (target || count('lookout') < pop / 8 || starving('quarry') || starving('woodcutter')))
      this.place(world, tower, target ?? undefined, starving('quarry') ? 'rock' : starving('woodcutter') ? 'tree' : undefined);
    else if (starving('woodcutter') && count('forester') < count('woodcutter') / 2) this.place(world, 'forester');
    else if (count('woodcutter') < Math.ceil(pop / 7)) this.place(world, 'woodcutter');
    else if (emptyHuts === 0 && this.affordable(world, 'hut')) this.place(world, 'hut');
    else if (count('quarry') < Math.ceil(pop / 12)) this.place(world, 'quarry');
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

  private place(world: World, type: BuildingType, target?: { x: number; y: number }, want?: NodeKind): void {
    const site = bestSite(world, this.owner, type, target, { want });
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
  }
}
