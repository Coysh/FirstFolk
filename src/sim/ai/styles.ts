import type { OriginId } from '../origins';
import type { HouseId } from '../houses';

/**
 * Bot personalities: the same bot, the same rules, different priorities. They give the rival a
 * character (it follows its origin) and give the balance harness distinct strategies to pit
 * against each other, so a dominant strategy shows up as a lopsided win matrix.
 */
export type BotStyle = 'balanced' | 'expander' | 'builder' | 'raider' | 'warden';
export const BOT_STYLES: BotStyle[] = ['balanced', 'expander', 'builder', 'raider', 'warden'];

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
  /** Builds a Mustering Hall (from Village), and how keenly it raids: 0 never, 1 for a landmark or much land, 2 any post it can beat. */
  muster: boolean;
  raids: 0 | 1 | 2;
  /** The Great Houses it seats when offered a choice, favourite first. */
  houses: HouseId[];
}

export const STYLES: Record<BotStyle, StyleDef> = {
  balanced: { name: 'Balanced', towerPer: 8, towersFirst: false, towersOnlyWithAim: false, sellKeep: 100, stockades: true, muster: true, raids: 1, houses: ['plough', 'spear', 'shield', 'hammer', 'horn', 'hearth', 'axe'] },
  expander: { name: 'Expander', towerPer: 5, towersFirst: true, towersOnlyWithAim: false, sellKeep: 120, stockades: true, muster: false, raids: 0, houses: ['horn', 'shield', 'hearth', 'axe', 'plough', 'hammer', 'spear'] },
  builder: { name: 'Builder', towerPer: 16, towersFirst: false, towersOnlyWithAim: true, sellKeep: 60, stockades: true, muster: false, raids: 0, houses: ['hammer', 'shield', 'axe', 'plough', 'hearth', 'horn', 'spear'] },
  raider: { name: 'Raider', towerPer: 9, towersFirst: false, towersOnlyWithAim: false, sellKeep: 100, stockades: false, muster: true, raids: 2, houses: ['spear', 'shield', 'hammer', 'plough', 'axe', 'horn', 'hearth'] },
  warden: { name: 'Warden', towerPer: 12, towersFirst: false, towersOnlyWithAim: true, sellKeep: 80, stockades: true, muster: true, raids: 0, houses: ['shield', 'hearth', 'plough', 'hammer', 'axe', 'horn', 'spear'] },
};

/** The rival's character follows where it comes from (a classic start plays balanced). */
export function styleOf(origin: OriginId | ''): BotStyle {
  switch (origin) {
    case 'wayfarers':
      return 'expander';
    case 'hillclan':
      return 'builder';
    case 'woodfolk':
      return 'raider';
    case 'riverfolk':
      return 'warden';
    default:
      return 'balanced';
  }
}
