import { secs } from './balance';

export type Difficulty = 'relaxed' | 'normal' | 'hard';

/** Per-game rules chosen at New Game. Kept small: difficulty changes economy pressure, never the rules of play. */
export interface Rules {
  /** Multiplier on the wagon's starting stock. */
  startStock: number;
  /** Every settler eats 1 berry per `mealInterval` ticks. */
  mealInterval: number;
  /** Berries in store needed before newcomers will settle. */
  newcomerMinFood: number;
  /**
   * How often (ticks, a multiple of 10) the rival rethinks its plans: same rules, different
   * speed of thought. Measured against the scripted player over 16 seeds: 80 is an even
   * match, 160 lets a competent player win about 70%, 240 about 88%.
   */
  rivalThink: number;
}

export const DIFFICULTY: Record<Difficulty, Rules> = {
  relaxed: { startStock: 1.6, mealInterval: secs(85), newcomerMinFood: 4, rivalThink: 240 },
  normal: { startStock: 1, mealInterval: secs(60), newcomerMinFood: 6, rivalThink: 160 },
  hard: { startStock: 0.7, mealInterval: secs(45), newcomerMinFood: 9, rivalThink: 80 },
};

export const DIFFICULTY_INFO: Record<Difficulty, { name: string; blurb: string }> = {
  relaxed: { name: 'Relaxed', blurb: 'A well-stocked wagon, modest appetites and an unhurried rival.' },
  normal: { name: 'Normal', blurb: 'The intended pace: steady pressure at home and a rival who keeps up.' },
  hard: { name: 'Hardy', blurb: 'Lean supplies, hungry mouths and a sharp rival. Plan every log.' },
};
