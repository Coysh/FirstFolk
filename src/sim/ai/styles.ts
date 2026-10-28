import type { OriginId } from '../origins';

/**
 * Bot personalities: the same bot, the same rules, different priorities. They give the rival a
 * character (it follows its origin) and give the balance harness distinct strategies to pit
 * against each other, so a dominant strategy shows up as a lopsided win matrix.
 */
export type BotStyle = 'balanced' | 'expander' | 'builder';
export const BOT_STYLES: BotStyle[] = ['balanced', 'expander', 'builder'];

export interface StyleDef {
  name: string;
  /** Wants another frontier tower while it has fewer than population / this (and nothing else to aim at). */
  towerPer: number;
  /** Towers are wanted before Great Works and the economy. */
  towersFirst: boolean;
  /** Pushes the border only towards something (a discovery, a landmark, a missing resource). */
  towersOnlyWithAim: boolean;
  /** Goods kept back before selling a lot on Market Day. */
  sellKeep: number;
  /** Raises a stockade by each contested landmark it holds. */
  stockades: boolean;
}

export const STYLES: Record<BotStyle, StyleDef> = {
  balanced: { name: 'Balanced', towerPer: 8, towersFirst: false, towersOnlyWithAim: false, sellKeep: 100, stockades: true },
  expander: { name: 'Expander', towerPer: 5, towersFirst: true, towersOnlyWithAim: false, sellKeep: 120, stockades: false },
  builder: { name: 'Builder', towerPer: 16, towersFirst: false, towersOnlyWithAim: true, sellKeep: 60, stockades: true },
};

/** The rival's character follows where it comes from (a classic start plays balanced). */
export function styleOf(origin: OriginId | ''): BotStyle {
  switch (origin) {
    case 'wayfarers':
    case 'kinfolk':
      return 'expander';
    case 'hillclan':
    case 'woodfolk':
      return 'builder';
    default:
      return 'balanced';
  }
}
