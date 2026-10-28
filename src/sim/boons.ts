import { secs } from './balance';
import { SKILLS, type Skill } from './defs';
import type { Family, World } from './world';
import type { DeedId } from './deeds';

/**
 * Family Boons: Spore-style "pick your evolution" choices. When a family first reaches a
 * new trade tier (or the settlement earns one), the player picks one of three boons. Boons
 * belong to the family, pass down the generations, and are merged when families marry,
 * so each lineage becomes something the player shaped.
 *
 * Effects are plain numbers keyed by `Mod`, summed per family into `family.mods` and read
 * through `mod()`. No boon has special-case code.
 */
export type Mod =
  | 'speed.woodcraft'
  | 'speed.stonework'
  | 'speed.husbandry'
  | 'bonus.woodcraft'
  | 'bonus.stonework'
  | 'bonus.husbandry'
  | 'build'
  | 'walk'
  | 'xp'
  | 'birth'
  | 'twins'
  | 'appetite'
  | 'sight'
  | 'claim'
  | 'teach'
  | 'hardy';

export type BoonId =
  | 'axeSworn'
  | 'heartwood'
  | 'stoneSworn'
  | 'deepSeams'
  | 'masterBuilders'
  | 'brambleWise'
  | 'bountiful'
  | 'hearthKeepers'
  | 'bigHearts'
  | 'twins'
  | 'fleetFooted'
  | 'keenEyes'
  | 'wanderlust'
  | 'quickLearners'
  | 'goodTeachers'
  | 'hardy';

export interface BoonDef {
  id: BoonId;
  name: string;
  icon: string;
  blurb: string;
  /** The craft it belongs to (offered more often to families who know it). */
  skill?: Skill;
  mods: Partial<Record<Mod, number>>;
  /** Adjective for the family's title, e.g. "the Thornes, Fleet-footed Masons". */
  epithet: string;
  /** The family deed this boon brings (see deeds.ts); otherwise the deed follows the family's craft. */
  deed?: DeedId;
}

export const BOONS: Record<BoonId, BoonDef> = {
  axeSworn: { id: 'axeSworn', name: 'Axe-Sworn', icon: '🪓', blurb: 'Woodcraft work is 30% faster.', skill: 'woodcraft', mods: { 'speed.woodcraft': 30 }, epithet: 'Axe-sworn' },
  heartwood: { id: 'heartwood', name: 'Heartwood', icon: '🌳', blurb: '+25% chance of a bonus log or plank.', skill: 'woodcraft', mods: { 'bonus.woodcraft': 25 }, epithet: 'Heartwood' },
  stoneSworn: { id: 'stoneSworn', name: 'Stone-Sworn', icon: '⛏️', blurb: 'Quarrying is 30% faster.', skill: 'stonework', mods: { 'speed.stonework': 30 }, epithet: 'Stone-sworn' },
  deepSeams: { id: 'deepSeams', name: 'Deep Seams', icon: '🪨', blurb: '+25% chance of bonus stone.', skill: 'stonework', mods: { 'bonus.stonework': 25 }, epithet: 'Deep-delving' },
  masterBuilders: { id: 'masterBuilders', name: 'Master Builders', icon: '🔨', blurb: 'They raise buildings 40% faster.', skill: 'stonework', mods: { build: 40 }, epithet: 'Builder', deed: 'raise' },
  brambleWise: { id: 'brambleWise', name: 'Bramble-Wise', icon: '🫐', blurb: 'Foraging is 30% faster.', skill: 'husbandry', mods: { 'speed.husbandry': 30 }, epithet: 'Bramble-wise' },
  bountiful: { id: 'bountiful', name: 'Bountiful', icon: '🧺', blurb: '+30% chance of bonus berries.', skill: 'husbandry', mods: { 'bonus.husbandry': 30 }, epithet: 'Bountiful' },
  hearthKeepers: { id: 'hearthKeepers', name: 'Hearth-Keepers', icon: '🍲', blurb: 'The family eats 35% less.', skill: 'husbandry', mods: { appetite: 35 }, epithet: 'Hearth-keeping' },
  bigHearts: { id: 'bigHearts', name: 'Big Hearts', icon: '❤️', blurb: 'Children are born twice as often.', mods: { birth: 50 }, epithet: 'Big-hearted', deed: 'festival' },
  twins: { id: 'twins', name: 'Twins Run in the Family', icon: '👶', blurb: 'A 40% chance that a birth brings twins.', mods: { twins: 40 }, epithet: 'Twin-blessed', deed: 'festival' },
  fleetFooted: { id: 'fleetFooted', name: 'Fleet-Footed', icon: '👣', blurb: 'They walk and carry 25% faster.', mods: { walk: 25 }, epithet: 'Fleet-footed', deed: 'expedition' },
  keenEyes: { id: 'keenEyes', name: 'Keen Eyes', icon: '👁️', blurb: 'They see 4 tiles further through the fog.', mods: { sight: 4 }, epithet: 'Keen-eyed', deed: 'expedition' },
  wanderlust: { id: 'wanderlust', name: 'Wanderlust', icon: '🗺️', blurb: 'Lookouts they build claim 4 tiles more land.', mods: { claim: 4 }, epithet: 'Wandering', deed: 'expedition' },
  quickLearners: { id: 'quickLearners', name: 'Quick Learners', icon: '📜', blurb: 'They learn every craft 50% faster.', mods: { xp: 50 }, epithet: 'Quick-witted', deed: 'lessons' },
  goodTeachers: { id: 'goodTeachers', name: 'Good Teachers', icon: '🎓', blurb: 'Children inherit 80% of the family’s craft, not 40%.', mods: { teach: 40 }, epithet: 'Learned', deed: 'lessons' },
  hardy: { id: 'hardy', name: 'Hardy', icon: '💪', blurb: 'Hunger never slows them down.', mods: { hardy: 1 }, epithet: 'Hardy' },
};

export const BOON_IDS = Object.keys(BOONS) as BoonId[];
export const MAX_BOONS = 5;

/** A family's summed boon effect for one modifier (0 when none). */
export function mod(world: World, familyId: number, key: Mod): number {
  return world.families.get(familyId)?.mods[key] ?? 0;
}

export function recomputeMods(fam: Family): void {
  const mods: Partial<Record<Mod, number>> = {};
  for (const id of fam.boons) for (const [k, v] of Object.entries(BOONS[id].mods)) mods[k as Mod] = (mods[k as Mod] ?? 0) + v;
  fam.mods = mods;
}

export function addBoon(fam: Family, id: BoonId): void {
  if (fam.boons.includes(id) || fam.boons.length >= MAX_BOONS) return;
  fam.boons.push(id);
  recomputeMods(fam);
}

/** Draw three distinct boons the family lacks, favouring their best craft. Deterministic. */
export function drawBoons(world: World, fam: Family, n = 3): BoonId[] {
  const best = SKILLS.reduce((a, k) => (fam.skills[k] > fam.skills[a] ? k : a), SKILLS[0]);
  const pool = BOON_IDS.filter((id) => !fam.boons.includes(id));
  const out: BoonId[] = [];
  while (out.length < n && pool.length) {
    const weights = pool.map((id) => (BOONS[id].skill === best ? 3 : BOONS[id].skill ? 1 : 2));
    let r = world.rng.int(weights.reduce((a, b) => a + b, 0));
    let i = 0;
    while (r >= weights[i]) r -= weights[i++];
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

/**
 * Queue a choice of boons for a family. Only the front offer is live (its timer starts when
 * it's shown), and live offers are spaced out so choices stay special, never a chore.
 */
export function offerBoon(world: World, fam: Family, reason: string): void {
  const player = world.players[fam.owner];
  if (!player || fam.boons.length >= MAX_BOONS) return;
  if (player.offers.some((o) => o.familyId === fam.id) || player.offers.length >= 3) return;
  const choices = drawBoons(world, fam);
  if (!choices.length) return;
  player.offers.push({ id: world.newId(), familyId: fam.id, choices, reason, expires: 0 });
  activateNext(world, fam.owner);
}

export const BOON_TIMEOUT = secs(60);
/** Minimum quiet time between one boon choice and the next. */
export const BOON_GAP = secs(45);

function activateNext(world: World, owner: number): void {
  const player = world.players[owner];
  const o = player.offers[0];
  if (!o || o.expires > 0 || world.tick < player.nextOfferAt) return;
  const fam = world.families.get(o.familyId);
  if (!fam) {
    player.offers.shift();
    return activateNext(world, owner);
  }
  o.expires = world.tick + BOON_TIMEOUT;
  world.emit({ type: 'boonOffered', owner, offerId: o.id, familyId: fam.id, surname: fam.surname, reason: o.reason });
}

export function chooseBoon(world: World, owner: number, offerId: number, choice: number): void {
  const player = world.players[owner];
  const i = player?.offers.findIndex((o) => o.id === offerId) ?? -1;
  if (i < 0) return;
  const offer = player.offers[i];
  if (offer.expires === 0) return;
  player.offers.splice(i, 1);
  player.nextOfferAt = world.tick + BOON_GAP;
  const fam = world.families.get(offer.familyId);
  const id = offer.choices[Math.max(0, Math.min(offer.choices.length - 1, choice))];
  if (!fam || !id) return;
  addBoon(fam, id);
  world.emit({ type: 'boonChosen', owner, familyId: fam.id, surname: fam.surname, boon: id });
}

/** Offers left unanswered resolve themselves (first card) so the game never waits on the player. */
export function updateOffers(world: World): void {
  for (const p of world.players) {
    const o = p.offers[0];
    if (o && o.expires > 0 && world.tick >= o.expires) chooseBoon(world, p.id, o.id, 0);
    activateNext(world, p.id);
  }
}

/** "the Thornes, Fleet-footed Masons": a family title from its boons and best craft. */
export function familyTitle(fam: Family, craftTitle: string): string {
  const epithets = fam.boons.slice(0, 2).map((b) => BOONS[b].epithet);
  return epithets.length ? `${epithets.join(', ')} ${craftTitle}` : craftTitle;
}
