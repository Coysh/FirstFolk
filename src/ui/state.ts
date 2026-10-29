import { signal } from '@preact/signals';
import type { BuildingType } from '../sim/defs';

/**
 * Which overlay sheet is open. One at a time, by rule: the screen never carries two panels, so
 * opening the Valley closes the Town, and so on. Esc and a tap on the map close whatever is open.
 */
export type Sheet = 'valley' | 'town' | 'log' | 'goals';
export const sheet = signal<Sheet | null>(null);
export const toggleSheet = (s: Sheet) => (sheet.value = sheet.value === s ? null : s);

/** The build category open on the shelf. */
export type BuildCat = 'gather' | 'make' | 'home' | 'border' | 'wonders';
export const buildCat = signal<BuildCat>('gather');

/** What each category holds, in shelf order. Content is data: a new building is one more name here. */
export const BUILD_CATS: { id: BuildCat; name: string; icon: string; types: BuildingType[] }[] = [
  { id: 'gather', name: 'Gather', icon: '🪓', types: ['woodcutter', 'forager', 'fisher', 'quarry', 'forester', 'mine'] },
  { id: 'make', name: 'Make', icon: '🍞', types: ['sawpit', 'farm', 'bakehouse', 'brewhouse', 'smithy', 'storehouse'] },
  { id: 'home', name: 'Homes', icon: '🏠', types: ['hut', 'longhouse', 'hamlet'] },
  { id: 'border', name: 'Border', icon: '🛡️', types: ['lookout', 'watchtower', 'stockade', 'musterhall'] },
  { id: 'wonders', name: 'Wonders', icon: '🏛️', types: ['henge', 'meadhall', 'granary'] },
];

export const catOf = (type: BuildingType): BuildCat => BUILD_CATS.find((c) => c.types.includes(type))?.id ?? 'gather';
