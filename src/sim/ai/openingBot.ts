import { BUILDINGS, type BuildingType } from '../defs';
import type { World } from '../world';
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

    if (world.isUnlocked(this.owner, 'sawpit') && count('sawpit') === 0) this.place(world, 'sawpit');
    else if (world.isUnlocked(this.owner, 'storehouse') && count('storehouse') === 0 && this.affordable(world, 'storehouse')) this.place(world, 'storehouse');
    else if (world.stored(this.owner, 'berries') < 12 && count('forager') < Math.ceil(pop / 6)) this.place(world, 'forager');
    else if (count('woodcutter') < Math.ceil(pop / 7)) this.place(world, 'woodcutter');
    else if (emptyHuts === 0 && this.affordable(world, 'hut')) this.place(world, 'hut');
    else if (count('quarry') < Math.ceil(pop / 12)) this.place(world, 'quarry');
  }

  private affordable(world: World, type: BuildingType): boolean {
    const cost = BUILDINGS[type].cost;
    return Object.entries(cost).every(([g, n]) => world.stored(this.owner, g as never) >= (n ?? 0));
  }

  private place(world: World, type: BuildingType): void {
    const site = bestSite(world, this.owner, type);
    if (site) world.enqueue({ type: 'place', owner: this.owner, building: type, ...site });
  }
}
