import { BALANCE } from '../sim/balance';
import { BUILDINGS, GOOD_INFO } from '../sim/defs';
import type { Settler, World } from '../sim/world';

/** Plain-language description of what a settler is doing, for the info panel. */
export function describeSettler(world: World, s: Settler): string {
  const j = s.job;
  const name = (id: number) => {
    const b = world.buildings.get(id);
    return b ? BUILDINGS[b.type].name : 'somewhere';
  };
  switch (j.kind) {
    case 'idle':
      return s.child ? 'Playing near home' : 'Resting, ready for work';
    case 'arrive':
      return 'Arriving with their family';
    case 'build':
      return j.phase === 'toSite' ? `Walking to build a ${name(j.siteId)}` : `Building a ${name(j.siteId)}`;
    case 'haul':
      return j.phase === 'toSource'
        ? `Fetching ${GOOD_INFO[j.good].name.toLowerCase()} from the ${name(j.fromId)}`
        : `Carrying ${GOOD_INFO[j.good].name.toLowerCase()} to the ${name(j.toId)}`;
    case 'work': {
      const b = world.buildings.get(j.buildingId);
      const job = b && BUILDINGS[b.type].job;
      if (!job) return 'Working';
      if (j.phase === 'process') return 'Sawing logs into planks';
      if (j.phase === 'deliver') return s.carry ? `Hauling ${GOOD_INFO[s.carry].name.toLowerCase()} to the store (no carriers free)` : 'Hauling to the store';
      if (j.phase === 'harvest')
        return job.kind === 'plant' ? 'Planting a sapling' : job.kind === 'process' ? 'Working' : job.node === 'tree' ? 'Felling a tree' : job.node === 'rock' ? 'Breaking stone' : 'Picking berries';
      if (j.phase === 'return') return s.carry ? `Bringing ${GOOD_INFO[s.carry].name.toLowerCase()} home` : 'Heading back';
      if (j.phase === 'toNode') return job.kind === 'plant' ? 'Looking for a spot to plant' : 'Heading out to work';
      return `Works at the ${BUILDINGS[b!.type].name}`;
    }
  }
}

export function ageYears(s: Settler): string {
  return (s.age / BALANCE.yearTicks).toFixed(1);
}

export function formatTime(ticks: number): string {
  const s = Math.floor(ticks / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
