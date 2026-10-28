import { bestSite } from '../src/sim/ai/placement';
import { secs } from '../src/sim/balance';
import type { BuildingType } from '../src/sim/defs';
import { World } from '../src/sim/world';

export function newWorld(seed = 1) {
  return new World({ seed });
}

export function place(world: World, type: BuildingType) {
  const site = bestSite(world, 0, type);
  if (!site) throw new Error(`no site for ${type}`);
  world.enqueue({ type: 'place', owner: 0, building: type, ...site });
  world.step();
  const b = [...world.buildings.values()].find((b) => b.type === type && b.x === site.x && b.y === site.y);
  if (!b) throw new Error(`placement of ${type} failed`);
  return b;
}

export function runSeconds(world: World, s: number) {
  world.run(secs(s));
}

export function wagon(world: World) {
  return [...world.buildings.values()].find((b) => b.type === 'wagon')!;
}
