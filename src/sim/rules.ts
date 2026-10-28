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
}

export const DIFFICULTY: Record<Difficulty, Rules> = {
  relaxed: { startStock: 1.6, mealInterval: secs(85), newcomerMinFood: 4 },
  normal: { startStock: 1, mealInterval: secs(60), newcomerMinFood: 6 },
  hard: { startStock: 0.7, mealInterval: secs(45), newcomerMinFood: 9 },
};

export const DIFFICULTY_INFO: Record<Difficulty, { name: string; blurb: string }> = {
  relaxed: { name: 'Relaxed', blurb: 'A well-stocked wagon and hearty appetites satisfied easily.' },
  normal: { name: 'Normal', blurb: 'The intended pace: steady pressure to feed and house your folk.' },
  hard: { name: 'Hardy', blurb: 'Lean supplies and hungry mouths. Plan every log.' },
};
