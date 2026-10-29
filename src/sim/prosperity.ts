import { BALANCE, TICK_HZ } from './balance';
import { BUILDINGS } from './defs';
import { pay } from './events';
import type { Good } from './defs';
import { isHome } from './population';
import { callingTier } from './callings';
import type { World } from './world';

/**
 * A town grows up. Homes are levelled by what is on the tables, never by anything the player has to
 * click: a town with bread and ale builds *cottages* (every home holds one more), and one that also
 * has tools builds *hall-houses* (two more). The levels need an upkeep of ale and tools every minute
 * or two, so the chains must keep running, and they fall back when the goods run out. Prosperity is
 * what the town amounts to right now (people, how well they live, the folk who stand with you and
 * the Great Works): it is what raises the settlement's rank, and it can fall as well as rise.
 */

const homesOf = (world: World, owner: number): number => {
  let n = 0;
  for (const b of world.buildings.values()) if (b.owner === owner && b.done && isHome(b.type)) n++;
  return n;
};

const have = (world: World, owner: number, good: Good) => world.stored(owner, good) + world.waiting(owner, good);

/** What the town amounts to: people, homes' comfort, steadings that stand with it, Great Works. */
export function prosperity(world: World, owner: number): number {
  const p = world.players[owner];
  if (!p) return 0;
  let works = 0;
  let workshops = 0;
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || !b.done) continue;
    if (BUILDINGS[b.type].great) works++;
    // Fields, ovens, brewhouses, mines and smithies: a town that makes things is a richer town.
    else if (BUILDINGS[b.type].job?.kind === 'process') workshops++;
  }
  const friends = world.sites.filter((s) => s.st && s.st.ally === owner).length;
  const base = world.population(owner) + homesOf(world, owner) * p.homeLevel * 2 + friends * 12 + works * 25 + workshops * BALANCE.workshopProsperity;
  // Hearthfolk are the richer for it: a tenth more a tier.
  return Math.floor((base * (100 + BALANCE.hearthProsperityPct * callingTier(world, owner, 'hearth'))) / 100);
}

/** What stands between a town's homes and the next level: the goods on the tables against the goods asked for. */
export function homeNeeds(world: World, owner: number): { level: number; homes: number; goods: { good: Good; have: number; need: number }[] } {
  const p = world.players[owner];
  const homes = homesOf(world, owner);
  const need = { bread: Math.max(3, Math.ceil(homes / 3)), ale: Math.max(2, Math.ceil(homes / 5)), tools: Math.max(2, Math.ceil(homes / 6)) };
  const goods = (['bread', 'ale', 'tools'] as const).filter((g) => g !== 'tools' || (p?.homeLevel ?? 0) >= 1).map((good) => ({ good, have: have(world, owner, good), need: need[good] }));
  return { level: p?.homeLevel ?? 0, homes, goods };
}

/** Every ten seconds: level the homes up or down, and take the upkeep. */
export function updateProsperity(world: World): void {
  for (const p of world.players) {
    const homes = homesOf(world, p.id);
    if (!homes) continue;
    const bread = have(world, p.id, 'bread');
    const ale = have(world, p.id, 'ale');
    const tools = have(world, p.id, 'tools');
    const needBread = Math.max(3, Math.ceil(homes / 3));
    const needAle = Math.max(2, Math.ceil(homes / 5));
    const needTools = Math.max(2, Math.ceil(homes / 6));
    const was = p.homeLevel;
    if (p.homeLevel === 0 && bread >= needBread && ale >= needAle) p.homeLevel = 1;
    else if (p.homeLevel === 1 && bread >= needBread && ale >= needAle && tools >= needTools) p.homeLevel = 2;
    // Upkeep: ale every minute, tools every three. If it cannot be paid for a while, the homes fall back a level.
    let short = false;
    if (p.homeLevel >= 1 && world.tick % BALANCE.homeUpkeepAle === 0) {
      const n = Math.ceil(homes / 6);
      if (world.stored(p.id, 'ale') >= n) pay(world, p.id, { ale: n });
      else short = true;
    }
    if (p.homeLevel >= 2 && world.tick % BALANCE.homeUpkeepTools === 0) {
      const n = Math.ceil(homes / 8);
      if (world.stored(p.id, 'tools') >= n) pay(world, p.id, { tools: n });
      else short = true;
    }
    if (p.homeLevel >= 1 && bread < 1) short = true;
    p.homeLack = short ? p.homeLack + 1 : 0;
    if (p.homeLack >= 4 && p.homeLevel > 0) {
      p.homeLevel--;
      p.homeLack = 0;
    }
    if (p.homeLevel !== was) world.emit({ type: 'homesLevel', owner: p.id, level: p.homeLevel, was });
  }
}

export const homeLevelName = (level: number) => ['huts', 'cottages', 'hall-houses'][level] ?? 'huts';
void TICK_HZ;
