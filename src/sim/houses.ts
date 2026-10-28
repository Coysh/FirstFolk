import { secs } from './balance';
import type { DeedId } from './deeds';
import { RANK_NAMES } from './defs';
import type { World } from './world';

/**
 * The Great Houses: three seats on your council, and you choose who fills them. The first is
 * your origin; a second is offered when the camp becomes a Hamlet and a third at Village. Each
 * house gives the whole settlement one plain passive and one power to call on, with the
 * numbers written on the card, so a choice of house is a choice of how to play: wide, tall,
 * raiding, or building. A real family in town carries each house's banner, but the player
 * never needs to look.
 *
 * Passives are plain numbers keyed by `Mod`, summed into `player.mods` and read through
 * `playerMod()` where each rule lives. No house has special-case code outside its power.
 */
export type Mod =
  | 'speed.woodcraft'
  | 'speed.stonework'
  | 'speed.husbandry'
  | 'build'
  | 'birth'
  | 'sight'
  | 'claim'
  /** Strength each huscarl adds on top of the usual 10. */
  | 'husc'
  /** Guards' defence, percent extra. */
  | 'guard'
  /** Stockades cost this much (percent) less. */
  | 'stockade';

export type HouseId = 'axe' | 'hammer' | 'plough' | 'horn' | 'hearth' | 'spear' | 'shield';

export interface HouseDef {
  id: HouseId;
  name: string;
  icon: string;
  /** The banner colour flown over the house's home. */
  color: number;
  /** One line each: what it always does, and the power it lends. */
  passive: string;
  mods: Partial<Record<Mod, number>>;
  power: DeedId;
  /** Who it suits, for the card. */
  suits: string;
}

export const HOUSES: Record<HouseId, HouseDef> = {
  axe: { id: 'axe', name: 'House of the Axe', icon: '🪓', color: 0x6b8e23, passive: 'Woodcutting and sawing are 40% faster.', mods: { 'speed.woodcraft': 40 }, power: 'timber', suits: 'Builders: timber for Great Works and towers' },
  hammer: { id: 'hammer', name: 'House of the Hammer', icon: '🔨', color: 0x8d6e63, passive: 'Everything is built 40% faster, and quarrying is 20% faster.', mods: { build: 40, 'speed.stonework': 20 }, power: 'raise', suits: 'Builders: race the Great Works' },
  plough: { id: 'plough', name: 'House of the Plough', icon: '🧺', color: 0xd4a017, passive: 'Foraging and fishing are 15% faster.', mods: { 'speed.husbandry': 15 }, power: 'harvest', suits: 'Growers: a big, well-fed town' },
  horn: { id: 'horn', name: 'House of the Horn', icon: '🧭', color: 0x2e86c1, passive: 'Towers claim 3 tiles further, and your folk see 4 tiles further.', mods: { claim: 3, sight: 4 }, power: 'expedition', suits: 'Expanders: wide land and far landmarks' },
  hearth: { id: 'hearth', name: 'House of the Hearth', icon: '❤️', color: 0xc0392b, passive: 'Children are born a third more often.', mods: { birth: 25 }, power: 'festival', suits: 'Growers: more folk for every post and workshop' },
  spear: { id: 'spear', name: 'House of the Spear', icon: '⚔️', color: 0x7b241c, passive: 'Each huscarl fights at 15, not 10.', mods: { husc: 5 }, power: 'warhorn', suits: 'Raiders: burn the rival’s towers' },
  shield: { id: 'shield', name: 'House of the Shield', icon: '🛡️', color: 0x34495e, passive: 'Guards defend 50% harder, and Stockades cost 30% less.', mods: { guard: 50, stockade: 30 }, power: 'shieldwall', suits: 'Wardens: hold a few landmarks for good' },
};

export const HOUSE_IDS = Object.keys(HOUSES) as HouseId[];
/** Houses an origin can found (the war houses are earned later). */
export const FOUNDING_HOUSES: HouseId[] = ['axe', 'hammer', 'plough', 'horn', 'hearth'];
export const MAX_SEATS = 3;

export interface Seat {
  house: HouseId;
  /** The family flying its banner (0 if none yet). */
  familyId: number;
  /** Tick its power is next ready. */
  ready: number;
}

export interface HouseOffer {
  id: number;
  choices: HouseId[];
  reason: string;
  expires: number;
}

/** A seat's power is ready this long after the house is seated. */
export const FIRST_POWER_WAIT = secs(20);
/** An unanswered house letter is settled (first card) after this long. */
export const HOUSE_TIMEOUT = secs(120);

/** The settlement's summed house passive for one modifier (0 when none). */
export function playerMod(world: World, owner: number, key: Mod): number {
  return world.players[owner]?.mods[key] ?? 0;
}

function recomputeMods(world: World, owner: number): void {
  const mods: Partial<Record<Mod, number>> = {};
  for (const seat of world.players[owner].seats) for (const [k, v] of Object.entries(HOUSES[seat.house].mods)) mods[k as Mod] = (mods[k as Mod] ?? 0) + v;
  world.players[owner].mods = mods;
}

/** Seat a house (origins, letters, dynasties). */
export function seatHouse(world: World, owner: number, house: HouseId): void {
  const p = world.players[owner];
  if (p.seats.length >= MAX_SEATS || p.seats.some((s) => s.house === house)) return;
  p.seats.push({ house, familyId: 0, ready: world.tick + FIRST_POWER_WAIT });
  recomputeMods(world, owner);
  updateBanners(world, owner);
  const fam = world.families.get(p.seats.at(-1)!.familyId);
  world.emit({ type: 'houseSeated', owner, house, surname: fam?.surname ?? '' });
}

/**
 * Offer a seat: three houses not yet seated, always including one of the war houses (if any is
 * left) so the military path is always on the table. Deterministic.
 */
export function offerHouse(world: World, owner: number, reason: string, pool: HouseId[] = HOUSE_IDS): void {
  const p = world.players[owner];
  if (p.seats.length >= MAX_SEATS || p.houseOffer) return;
  const open = pool.filter((h) => !p.seats.some((s) => s.house === h));
  const war = open.filter((h) => h === 'spear' || h === 'shield');
  const choices: HouseId[] = [];
  if (war.length && pool === HOUSE_IDS) choices.push(war[world.rng.int(war.length)]);
  while (choices.length < 3) {
    const rest = open.filter((h) => !choices.includes(h));
    if (!rest.length) break;
    choices.push(rest[world.rng.int(rest.length)]);
  }
  if (!choices.length) return;
  p.houseOffer = { id: world.newId(), choices, reason, expires: world.tick + HOUSE_TIMEOUT };
  world.emit({ type: 'houseOffered', owner, offerId: p.houseOffer.id, reason });
}

/** The player picks a house from the letter (a Command). */
export function chooseHouse(world: World, owner: number, offerId: number, choice: number): void {
  const p = world.players[owner];
  const o = p?.houseOffer;
  if (!o || o.id !== offerId) return;
  p.houseOffer = null;
  seatHouse(world, owner, o.choices[Math.max(0, Math.min(o.choices.length - 1, choice))]);
}

/** Letters left unanswered settle themselves (first card), so the game never waits. */
export function updateHouses(world: World): void {
  for (const p of world.players) {
    if (p.houseOffer && world.tick >= p.houseOffer.expires) chooseHouse(world, p.id, p.houseOffer.id, 0);
    updateBanners(world, p.id);
  }
}

/** A new rank brings a new seat at Hamlet and Village. */
export function rankSeat(world: World, owner: number, rank: number): void {
  if (rank === 1 || rank === 2) offerHouse(world, owner, `Your camp is now a ${RANK_NAMES[rank]}: a family rises to the council`);
}

/**
 * Each house's banner flies over the largest family without one. When that family dies out
 * the banner passes on, so a seat is never empty while the town has families.
 */
function updateBanners(world: World, owner: number): void {
  const p = world.players[owner];
  if (!p.seats.length) return;
  const sizes = new Map<number, number>();
  for (const s of world.settlers.values()) if (s.owner === owner) sizes.set(s.familyId, (sizes.get(s.familyId) ?? 0) + 1);
  for (const seat of p.seats) {
    if (seat.familyId && sizes.has(seat.familyId)) continue;
    let best = 0;
    for (const [id, n] of sizes) if (!p.seats.some((o) => o.familyId === id) && (n > (sizes.get(best) ?? 0) || (n === sizes.get(best) && id < best))) best = id;
    seat.familyId = best;
  }
}

/** "the Thornes, House of the Axe" for a seat. */
export function houseTitle(world: World, seat: Seat): string {
  const fam = world.families.get(seat.familyId);
  return fam ? `${HOUSES[seat.house].name} (the ${fam.surname} family)` : HOUSES[seat.house].name;
}

/** The house a dynasty carried, from an older save that remembered boons instead. */
export function houseFromBoons(boons: string[], skill: string | null): HouseId {
  const map: Record<string, HouseId> = { axeSworn: 'axe', heartwood: 'axe', masterBuilders: 'hammer', stoneSworn: 'hammer', deepSeams: 'hammer', bountiful: 'plough', brambleWise: 'plough', hearthKeepers: 'plough', wanderlust: 'horn', keenEyes: 'horn', fleetFooted: 'horn', bigHearts: 'hearth', twins: 'hearth' };
  for (const b of boons) if (map[b]) return map[b];
  return skill === 'woodcraft' ? 'axe' : skill === 'stonework' ? 'hammer' : skill === 'husbandry' ? 'plough' : 'hearth';
}
