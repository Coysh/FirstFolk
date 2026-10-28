import { BALANCE } from './balance';
import type { World } from './world';

/**
 * The year's rhythm: spring, summer and autumn to grow and stockpile, then winter. In winter
 * berry bushes sleep, folk eat more and building is slower; fishers still work. Winter is
 * announced ahead so the player can prepare, and each one survived is a milestone.
 */
export type Season = 0 | 1 | 2 | 3;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const WINTER: Season = 3;

export const seasonTicks = () => BALANCE.yearTicks / 4;

export function seasonOf(tick: number): Season {
  return (Math.floor(tick / seasonTicks()) % 4) as Season;
}

export const isWinter = (world: World) => seasonOf(world.tick) === WINTER;

/** Ticks until the next season begins. */
export function ticksToNextSeason(tick: number): number {
  return seasonTicks() - (tick % seasonTicks());
}

export function updateSeasons(world: World): void {
  const t = world.tick;
  if (t > 0 && t % seasonTicks() === 0) {
    const season = seasonOf(t);
    world.emit({ type: 'season', season });
    // A winter survived: spring arrives with folk still standing.
    if (season === 0) for (const p of world.players) if (world.population(p.id) > 0) p.winters++;
  }
  if (seasonOf(t) === 2 && ticksToNextSeason(t) === BALANCE.winterWarning) world.emit({ type: 'winterComing' });
}
