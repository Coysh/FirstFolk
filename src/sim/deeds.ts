import { BALANCE, secs } from './balance';
import { BOONS } from './boons';
import { BUILDINGS, SKILLS, type Good, type Skill } from './defs';
import { canAfford, pay } from './events';
import { isWalkableTerrain } from './mapgen';
import { addRenown } from './renown';
import { grantXp } from './settlers';
import { NO_OWNER, onBuildingComplete, recomputeTerritory } from './territory';
import { tierOf } from './trades';
import type { Building, Family, World } from './world';

/**
 * Family Deeds: your greatest houses are your heroes. The four most prestigious families sit
 * on the council, and each lends the settlement its deed: a call-down power with a cooldown,
 * shaped by what that family has become (its craft and its boons) and stronger the more
 * Masters it has. Breeding a family of Wanderers gives you Expeditions; a line of Masons
 * raises buildings in an instant. Pure data plus one `apply` per deed.
 */
export type DeedId = 'raise' | 'timber' | 'harvest' | 'expedition' | 'festival' | 'lessons';

export interface DeedDef {
  id: DeedId;
  name: string;
  icon: string;
  blurb: string;
  /** Targeted deeds need a tile (chosen on the map). */
  target: boolean;
  cooldown: number;
  cost?: Partial<Record<Good | 'food', number>>;
  /** Do it. Returns the news line, or null if it cannot be done (nothing is spent). */
  apply(world: World, fam: Family, power: number, x: number, y: number): string | null;
}

/** The family's deed: from its boons first (a boon can carry a deed), else from its best craft. */
export function deedOf(fam: Family): DeedId | null {
  for (const id of fam.boons) {
    const d = BOONS[id].deed;
    if (d) return d;
  }
  const best = bestCraft(fam);
  if (tierOf(fam.skills[best]) < 1) return null;
  return CRAFT_DEEDS[best];
}

const CRAFT_DEEDS: Record<Skill, DeedId> = { woodcraft: 'timber', stonework: 'raise', husbandry: 'harvest' };

export function bestCraft(fam: Family): Skill {
  return SKILLS.reduce((a, k) => (fam.skills[k] > fam.skills[a] ? k : a), SKILLS[0]);
}

/** 1 for Journeymen, 2 with a Master in the family's best craft: deeds get stronger. */
export function deedPower(fam: Family): number {
  return Math.max(1, tierOf(fam.skills[bestCraft(fam)]));
}

/** How great a house is: its size, its skill, and its deeds and legends. */
export function prestige(world: World, fam: Family): number {
  let p = fam.glory * 4;
  for (const s of world.settlers.values()) {
    if (s.familyId !== fam.id) continue;
    p += 2;
    if (!s.child) p += 6 * Math.max(...SKILLS.map((k) => tierOf(s.skills[k])));
  }
  return p;
}

/**
 * The council: each deed is lent by the most prestigious family that has it, and the four
 * greatest of those sit. Different kinds of family mean different powers, so it pays to raise
 * a varied people. Ties go to the elder house.
 */
export function council(world: World, owner: number): Family[] {
  const fams = [...world.families.values()].filter((f) => f.owner === owner && deedOf(f));
  const score = new Map(fams.map((f) => [f.id, prestige(world, f)]));
  fams.sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.id - b.id);
  const seen = new Set<DeedId>();
  const out: Family[] = [];
  for (const f of fams) {
    const d = deedOf(f)!;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(f);
    if (out.length >= BALANCE.councilSize) break;
  }
  return out;
}

/** What a deed costs right now: every frontier building you have makes the next Expedition dearer. */
export function deedCost(world: World, owner: number, id: DeedId): Partial<Record<Good | 'food', number>> {
  const cost = { ...DEEDS[id].cost };
  if (id === 'expedition') cost.logs = (cost.logs ?? 0) + 2 * world.frontierCount(owner);
  return cost;
}

/** Ticks until a family's deed is ready (0 = ready). */
export function deedWait(world: World, fam: Family): number {
  return Math.max(0, fam.deedReady - world.tick);
}

export const DEEDS: Record<DeedId, DeedDef> = {
  raise: {
    id: 'raise',
    name: 'Raise',
    icon: '🔨',
    blurb: 'The family’s builders finish a construction site in an instant (a quarter of a Great Work). Masters raise two.',
    target: true,
    cooldown: secs(110),
    apply(world, fam, power, x, y) {
      const sites = [...world.buildings.values()].filter((b) => b.owner === fam.owner && !b.done);
      if (!sites.length) return null;
      sites.sort((a, b) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) - Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) || a.id - b.id);
      const raised: string[] = [];
      for (const site of sites.slice(0, power)) {
        const def = BUILDINGS[site.type];
        if (def.great) {
          site.work = Math.min(site.workNeeded - 1, site.work + Math.ceil(site.workNeeded / 4));
          // Their own hands and stores supply what the quarter needs.
          for (const g of Object.keys(site.cost) as Good[]) site.delivered[g] = Math.max(site.delivered[g], Math.min(site.cost[g]!, Math.ceil((site.cost[g]! * site.work) / site.workNeeded)));
          raised.push(`a quarter of the ${def.name}`);
          continue;
        }
        for (const g of Object.keys(site.cost) as Good[]) site.delivered[g] = site.cost[g]!;
        site.work = site.workNeeded;
        completeSite(world, site, fam.id);
        raised.push(`the ${def.name}`);
      }
      return `The ${fam.surname} builders raise ${raised.join(' and ')} overnight.`;
    },
  },
  timber: {
    id: 'timber',
    name: 'Timber Drive',
    icon: '🪓',
    blurb: 'For 45 seconds all woodcraft is three times as fast and saplings spring up fully grown. Masters drive for 70.',
    target: false,
    cooldown: secs(140),
    apply(world, fam, power) {
      world.players[fam.owner].buffs.timber = world.tick + secs(power > 1 ? 70 : 45);
      return `The ${fam.surname} axes ring out: a timber drive!`;
    },
  },
  harvest: {
    id: 'harvest',
    name: 'Harvest Home',
    icon: '🧺',
    blurb: 'Bring in a great harvest: food for everyone, and every forager and fisher works twice as fast for 45 seconds.',
    target: false,
    cooldown: secs(140),
    apply(world, fam, power) {
      const n = 15 + world.population(fam.owner) / 3 + (power > 1 ? 15 : 0);
      const store = world.storages(fam.owner)[0];
      if (store) store.stock.berries += Math.floor(n);
      world.players[fam.owner].buffs.harvest = world.tick + secs(45);
      return `The ${plural(fam.surname)} lead the harvest home: +${Math.floor(n)} food.`;
    },
  },
  expedition: {
    id: 'expedition',
    name: 'Expedition',
    icon: '🧭',
    blurb: 'Send the family’s scouts beyond the border to raise an Outpost: new land (and maybe a landmark) far from home.',
    target: true,
    cooldown: secs(170),
    cost: { logs: 8, food: 6 },
    apply(world, fam, power, x, y) {
      if (world.territory[world.idx(x, y)] === fam.owner || world.frontierCount(fam.owner) >= world.frontierCap(fam.owner)) return null;
      const spot = outpostSpot(world, fam.owner, x, y);
      if (!spot) return null;
      const b = world.addBuilding('outpost', fam.owner, spot.x, spot.y, true);
      b.builtBy = fam.id;
      b.reach = (power > 1 ? 2 : 0) + (fam.mods.claim ? 2 : 0);
      world.emit({ type: 'buildingComplete', owner: fam.owner, id: b.id, buildingType: b.type });
      onBuildingComplete(world, b);
      return `The ${fam.surname} scouts raise an outpost in the wilds.`;
    },
  },
  festival: {
    id: 'festival',
    name: 'Festival',
    icon: '🎪',
    blurb: 'Hold a great gathering: for a minute your influence surges around it (push your border over a rival’s landmark!). +5 renown.',
    target: true,
    cooldown: secs(150),
    cost: { food: 12 },
    apply(world, fam, power, x, y) {
      if (!world.inBounds(x, y) || !nearOwnLand(world, fam.owner, x, y, 4)) return null;
      world.players[fam.owner].boosts.push({ x, y, r: 10 + power * 2, p: 110 + power * 30, until: world.tick + secs(60) });
      recomputeTerritory(world);
      addRenown(world, fam.owner, BALANCE.renown.festival, 'deeds', x, y);
      return `The ${plural(fam.surname)} hold a festival. Folk come from all around!`;
    },
  },
  lessons: {
    id: 'lessons',
    name: 'Lessons',
    icon: '📜',
    blurb: 'The family teaches its craft: every adult who knows it learns 60 XP (90 from a Master).',
    target: false,
    cooldown: secs(160),
    apply(world, fam, power) {
      const skill = bestCraft(fam);
      const xp = power > 1 ? 90 : 60;
      let n = 0;
      for (const s of world.settlers.values())
        if (s.owner === fam.owner && !s.child && (s.skills[skill] > 0 || s.familyId === fam.id)) {
          grantXp(world, s, skill, xp);
          n++;
        }
      return `The ${plural(fam.surname)} teach ${n} folk their craft.`;
    },
  },
};

const plural = (surname: string) => (/(s|sh|ch|x|z)$/.test(surname) ? `${surname}es` : `${surname}s`);

function nearOwnLand(world: World, owner: number, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (world.inBounds(x + dx, y + dy) && world.territory[world.idx(x + dx, y + dy)] === owner) return true;
  return false;
}

/**
 * Where an outpost can stand: open ground (2×2 plus entrance) near the target, not on a
 * rival's land and within reach of your border.
 */
export function outpostSpot(world: World, owner: number, x: number, y: number): { x: number; y: number } | null {
  for (let r = 0; r <= 5; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const bx = x + dx;
        const by = y + dy;
        if (fits(world, owner, bx, by) && nearOwnLand(world, owner, bx, by, BALANCE.expeditionReach)) return { x: bx, y: by };
      }
  return null;
}

function fits(world: World, owner: number, x: number, y: number): boolean {
  for (let dy = 0; dy <= 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!world.inBounds(tx, ty)) return false;
      const i = world.idx(tx, ty);
      if (!isWalkableTerrain(world.map.terrain[i]) || world.buildingAt[i]) return false;
      const t = world.territory[i];
      if (t !== NO_OWNER && t !== owner) return false;
      if (dy < 2 && world.nodeAt[i] && world.nodes.get(world.nodeAt[i])?.kind === 'rock') return false;
      if (world.sites.some((s) => s.x === tx && s.y === ty)) return false;
    }
  return true;
}

function completeSite(world: World, site: Building, famId: number): void {
  site.done = true;
  site.builtBy = famId;
  site.builderId = 0;
  site.status = '';
  site.alert = '';
  for (const s of world.settlers.values()) if (s.job.kind === 'build' && s.job.siteId === site.id) s.job = { kind: 'idle', wait: 0 };
  world.stats.completions.push({ type: site.type, tick: world.tick });
  world.emit({ type: 'buildingComplete', owner: site.owner, id: site.id, buildingType: site.type });
  onBuildingComplete(world, site);
}

/** Why a targeted deed can't land on a tile ('' when it can), so the UI can say so before trying. */
export function deedTargetProblem(world: World, owner: number, id: DeedId, x: number, y: number): string {
  if (!world.inBounds(x, y)) return 'Off the map';
  if (id === 'expedition') {
    if (world.frontierCount(owner) >= world.frontierCap(owner)) return `Your folk can hold ${world.frontierCap(owner)} towers and outposts at this rank`;
    if (world.territory[world.idx(x, y)] === owner) return 'That’s already your land: pick a spot beyond the border';
    if (!outpostSpot(world, owner, x, y)) return `No open ground there within ${BALANCE.expeditionReach} tiles of your border`;
  }
  if (id === 'festival' && !nearOwnLand(world, owner, x, y, 4)) return 'Too far out: hold festivals at your border';
  if (id === 'raise' && ![...world.buildings.values()].some((b) => b.owner === owner && !b.done)) return 'Nothing is under construction';
  return '';
}

/** Perform a family's deed (a Command). Checks council seat, cooldown and cost. */
export function performDeed(world: World, owner: number, familyId: number, x: number, y: number): void {
  const fam = world.families.get(familyId);
  if (!fam || fam.owner !== owner || deedWait(world, fam) > 0) return;
  if (!council(world, owner).includes(fam)) return;
  const id = deedOf(fam);
  if (!id) return;
  const def = DEEDS[id];
  const cost = deedCost(world, owner, id);
  if (!canAfford(world, owner, cost)) return;
  const text = def.apply(world, fam, deedPower(fam), x, y);
  if (text === null) return;
  pay(world, owner, cost);
  fam.glory++;
  const p = world.players[owner];
  // An underdog's houses rally faster (the comeback lever).
  const behind = world.players.some((o) => o.id !== owner && o.renown - p.renown >= BALANCE.underdogGap);
  const mead = world.hasWork(owner, 'meadhall');
  fam.deedReady = world.tick + Math.round((def.cooldown * (100 - (behind ? BALANCE.underdogPct : 0) - (mead ? 30 : 0))) / 100);
  p.deedsUsed++;
  world.emit({ type: 'deed', owner, familyId: fam.id, surname: fam.surname, deed: id, x, y, text });
}
