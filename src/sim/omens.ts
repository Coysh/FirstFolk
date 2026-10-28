import { Rng } from './rng';
import type { World } from './world';

/**
 * Omens (Battle Drones' mutators): every valley rolls two, so no two games play alike. Each
 * is a small, readable twist on the rules, shown before the game starts and on the HUD. The
 * effects are looked up with `hasOmen` at the one place each rule lives.
 */
export type OmenId = 'longWinters' | 'richSeams' | 'bountiful' | 'restless' | 'oldKingdom' | 'wanderersRoad' | 'goldenAge' | 'fertile' | 'reaverCoast';

export const OMENS: Record<OmenId, { name: string; icon: string; blurb: string }> = {
  longWinters: { name: 'Hard Winters', icon: '❄️', blurb: 'Winter bites twice as hard: folk eat half again as much and building crawls.' },
  richSeams: { name: 'Rich Seams', icon: '🪨', blurb: 'Every rock holds twice the stone.' },
  bountiful: { name: 'Bountiful Valley', icon: '🫐', blurb: 'Berry bushes regrow twice as fast.' },
  restless: { name: 'Restless Neighbours', icon: '⚔️', blurb: 'Your rival plans a quarter faster.' },
  oldKingdom: { name: 'The Old Kingdom', icon: '👑', blurb: 'Landmarks pay +1 renown a minute more.' },
  wanderersRoad: { name: 'Wanderers’ Road', icon: '🛤️', blurb: 'Newcomers arrive twice as often.' },
  goldenAge: { name: 'Golden Age', icon: '✨', blurb: 'Great Works are worth 50 more renown.' },
  fertile: { name: 'Fertile Folk', icon: '👶', blurb: 'Children are born a third more often.' },
  reaverCoast: { name: 'Reaver Coast', icon: '🛶', blurb: 'Reavers raid twice as often, and come even to a peaceful valley.' },
};

export const OMEN_IDS = Object.keys(OMENS) as OmenId[];

/** Two distinct omens from the seed. */
export function rollOmens(seed: number): OmenId[] {
  const rng = new Rng(seed ^ 0x0e1e);
  const pool = [...OMEN_IDS];
  const out: OmenId[] = [];
  while (out.length < 2) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}

export const hasOmen = (world: World, id: OmenId) => world.omens.includes(id);
