import { BUILDINGS, type BuildingType } from '../defs';
import type { World } from '../world';
import { NO_OWNER } from '../territory';
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
    while (this.opening.length && this.opening[0].at <= world.tick) {
      this.place(world, this.opening.shift()!.type);
    }
    if (this.opening.length || world.tick % 100 !== 0) return;

    const pop = world.population(this.owner);
    const sites = [...world.buildings.values()].filter((b) => b.owner === this.owner && !b.done).length;
    if (sites >= 2) return;
    const emptyHuts = [...world.buildings.values()].filter((b) => b.owner === this.owner && b.type === 'hut' && b.familyId === 0).length;
    const count = (t: BuildingType) => world.countBuildings(this.owner, t, true);

    const lookoutSites = [...world.buildings.values()].filter((b) => b.owner === this.owner && b.type === 'lookout' && !b.done).length;
    const target = this.frontierTarget(world);

    if (world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0) this.place(world, 'sawpit');
    else if (world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0 && this.affordable(world, 'storehouse')) this.place(world, 'storehouse');
    else if (world.stored(this.owner, 'berries') < 12 && count('forager') < Math.ceil(pop / 6)) this.place(world, 'forager');
    // Push the border: towards a seen discovery, or for room once the land fills up.
    else if (lookoutSites === 0 && this.affordable(world, 'lookout') && (target || count('lookout') < pop / 8)) this.place(world, 'lookout', target ?? undefined);
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

  private place(world: World, type: BuildingType, target?: { x: number; y: number }): void {
    const site = bestSite(world, this.owner, type, target);
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
  }
}
