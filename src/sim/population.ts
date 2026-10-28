import { BALANCE } from './balance';
import { BUILDINGS, FOODS, SKILLS, type BuildingType, type Good, type Skill } from './defs';
import { addBoon, drawBoons, offerBoon } from './boons';
import { walkTo } from './settlers';
import { hasOmen } from './omens';
import { emptySkills, type Building, type Family, type PlayerState, type Settler, type World } from './world';

export const SURNAMES = [
  'Ashby', 'Thorne', 'Holloway', 'Fenwick', 'Marsh', 'Brook', 'Whitlow', 'Hale', 'Oakley', 'Underhill',
  'Rook', 'Elwood', 'Garth', 'Harrow', 'Kettle', 'Lambert', 'Moss', 'Pike', 'Stow', 'Wren',
];

/** "the Ashbys", "the Mosses", "the Marshes". */
export const plural = (surname: string) => (/(s|sh|ch|x|z)$/.test(surname) ? `${surname}es` : `${surname}s`);

/** Crest colours, shown on hats, banners and flags. */
export const CREST_COLORS = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x8e44ad, 0x16a085, 0xd35400, 0x34495e, 0xe84393, 0x27ae60, 0x7f5539];

/** Family homes (the wagon houses the founders but is never handed to newcomers). */
export const isHome = (t: BuildingType) => !!BUILDINGS[t].housing && t !== 'wagon';

export function createFamily(world: World, owner: number, homeId: number, inherit?: string): Family {
  const used = new Set([...world.families.values()].map((f) => f.surname));
  const free = SURNAMES.filter((n) => !used.has(n));
  const surname = inherit ?? (free.length ? world.rng.pick(free) : world.rng.pick(SURNAMES));
  const fam: Family = { id: world.newId(), owner, surname, color: world.families.size % CREST_COLORS.length, homeId, skills: emptySkills(), birthCooldown: BALANCE.birthInterval, boons: [], mods: {}, parents: [], glory: 0, deedReady: world.tick + BALANCE.deedFirstWait };
  world.families.set(fam.id, fam);
  return fam;
}

export function updatePopulation(world: World): void {
  for (const player of world.players) {
    // Hearth-keepers eat less: appetite is summed per settler in percent.
    let appetite = 0;
    for (const s of world.settlers.values()) if (s.owner === player.id) appetite += 100 - (world.families.get(s.familyId)?.mods.appetite ?? 0);
    // Winter cold: everyone eats a quarter more.
    player.mealAccum += Math.floor((appetite * (world.winterBites(player.id) ? 100 + BALANCE.winterAppetitePct * (hasOmen(world, 'longWinters') ? 2 : 1) : 100)) / 10000);
    while (player.mealAccum >= world.rules.mealInterval) {
      player.mealAccum -= world.rules.mealInterval;
      eat(world, player);
    }
    if (world.tick % BALANCE.newcomerCheckInterval === 0) {
      checkNewcomers(world, player);
      checkBirths(world, player);
    }
  }
}

/**
 * Families grow on their own: two adults with room at home and food to spare have a child.
 * Growth then comes from your own lineages, not just from waiting for migrants.
 */
function checkBirths(world: World, player: PlayerState): void {
  const fed = !player.hungry && world.food(player.id) >= world.rules.newcomerMinFood;
  for (const fam of world.families.values()) {
    if (fam.owner !== player.id) continue;
    if (fam.birthCooldown > 0) {
      fam.birthCooldown -= BALANCE.newcomerCheckInterval;
      continue;
    }
    if (!fed) continue;
    const home = world.buildings.get(fam.homeId);
    if (!home || !home.done) continue;
    let members = 0;
    let adults = 0;
    for (const s of world.settlers.values())
      if (s.familyId === fam.id) {
        members++;
        if (!s.child && !s.elder) adults++;
      }
    const room = (BUILDINGS[home.type].housing ?? 0) - members;
    if (adults < 2 || room <= 0) continue;
    const e = world.entrance(home);
    const n = room >= 2 && world.rng.int(100) < (fam.mods.twins ?? 0) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const baby = world.addSettler(player.id, fam.id, world.randomName(), 0, e.x, e.y);
      world.emit({ type: 'born', owner: player.id, settlerId: baby.id, name: baby.name, surname: fam.surname });
    }
    fam.birthCooldown = Math.round((BALANCE.birthInterval * (100 - (fam.mods.birth ?? 0)) * (hasOmen(world, 'fertile') ? 70 : 100)) / 10000);
  }
}

function eat(world: World, player: PlayerState): void {
  // Eat whichever food is most plentiful, from the fullest store.
  let best: Building | undefined;
  let food: Good = 'berries';
  for (const g of FOODS)
    for (const b of world.storages(player.id))
      if (b.stock[g] - b.reserved[g] > 0 && (!best || b.stock[g] > best.stock[food])) {
        best = b;
        food = g;
      }
  if (best) {
    best.stock[food]--;
    if (player.hungry) {
      player.hungry = false;
      world.emit({ type: 'fed', owner: player.id });
    }
  } else if (!player.hungry) {
    player.hungry = true;
    world.emit({ type: 'hungry', owner: player.id });
  }
}

/** Households whose members have all married away free their hut for someone else. */
function clearEmptyHouseholds(world: World, owner: number): void {
  const members = new Set<number>();
  for (const s of world.settlers.values()) if (s.owner === owner) members.add(s.familyId);
  for (const fam of [...world.families.values()]) {
    if (fam.owner !== owner || members.has(fam.id)) continue;
    const home = world.buildings.get(fam.homeId);
    if (home && home.type !== 'wagon' && home.familyId === fam.id) home.familyId = 0;
    world.families.delete(fam.id);
    world.players[owner].offers = world.players[owner].offers.filter((o) => o.familyId !== fam.id);
  }
}

function checkNewcomers(world: World, player: PlayerState): void {
  clearEmptyHouseholds(world, player.id);
  if (player.newcomerCooldown > 0) {
    player.newcomerCooldown -= BALANCE.newcomerCheckInterval;
    return;
  }
  let hut: Building | undefined;
  for (const b of world.buildings.values())
    if (b.owner === player.id && b.done && isHome(b.type) && b.familyId === 0) {
      hut = b;
      break;
    }
  if (!hut) return;
  // Homeless families (wanderers) move in first, whatever the larder holds.
  for (const fam of world.families.values())
    if (fam.owner === player.id && !world.buildings.has(fam.homeId)) {
      fam.homeId = hut.id;
      hut.familyId = fam.id;
      world.emit({ type: 'familySettled', owner: player.id, familyId: fam.id, surname: fam.surname, buildingId: hut.id });
      return;
    }
  if (player.hungry) return;
  if (marry(world, player, hut)) return;
  if (world.food(player.id) < world.rules.newcomerMinFood) return;
  spawnFamily(world, player, hut);
}

/**
 * Marriage: two unmarried adults from different families found a new household in a free
 * hut. The household inherits the best skills of both houses and the union of their boons:
 * the player's lever for breeding lineages.
 */
function marry(world: World, player: PlayerState, hut: Building): boolean {
  const single = [...world.settlers.values()].filter((s) => s.owner === player.id && !s.child && !s.elder && s.spouseId === 0);
  for (let i = 0; i < single.length; i++)
    for (let j = i + 1; j < single.length; j++) {
      const a = single[i];
      const b = single[j];
      if (a.familyId === b.familyId) continue;
      const fa = world.families.get(a.familyId);
      const fb = world.families.get(b.familyId);
      if (!fa || !fb) continue;
      const total = (f: Family) => SKILLS.reduce((n, k) => n + f.skills[k], 0);
      const senior = total(fa) >= total(fb) ? fa : fb;
      const fam = createFamily(world, player.id, hut.id, senior.surname);
      hut.familyId = fam.id;
      fam.parents = [fa.id, fb.id];
      for (const k of SKILLS) fam.skills[k] = Math.max(fa.skills[k], fb.skills[k]);
      for (const id of [...fa.boons, ...fb.boons]) addBoon(fam, id);
      a.familyId = fam.id;
      b.familyId = fam.id;
      a.spouseId = b.id;
      b.spouseId = a.id;
      world.emit({ type: 'married', owner: player.id, a: a.id, b: b.id, familyId: fam.id, surname: fam.surname, buildingId: hut.id });
      return true;
    }
  return false;
}

/**
 * A family arrives: migrants walk in from the edge of view to their new hut; wanderers
 * (no hut) start at `from` and camp by the wagon until a hut is free.
 */
export function spawnFamily(world: World, player: PlayerState, hut: Building | null, fromX = 0, fromY = 0, sizeOverride = 0, skillXp = 0): Family {
  const wagon = [...world.buildings.values()].find((b) => b.owner === player.id && b.type === 'wagon')!;
  const e = world.entrance(hut ?? wagon);
  const target = world.idx(e.x, e.y);
  let spawn = hut ? -1 : world.idx(fromX, fromY);
  for (let tries = 0; tries < 30 && spawn < 0; tries++) {
    const side = world.rng.int(4);
    const t = world.rng.range(-18, 18);
    const d = 20;
    const [dx, dy] = side === 0 ? [t, -d] : side === 1 ? [d, t] : side === 2 ? [t, d] : [-d, t];
    const x = e.x + dx;
    const y = e.y + dy;
    if (!world.inBounds(x, y) || !world.walkable(world.idx(x, y))) continue;
    if (world.pathfinder.find(world.idx(x, y), target)) spawn = world.idx(x, y);
  }
  if (spawn < 0) spawn = target;

  const fam = createFamily(world, player.id, hut ? hut.id : 0);
  if (hut) hut.familyId = fam.id;
  const capacity = BUILDINGS.hut.housing ?? 4;
  const size = sizeOverride || Math.min(capacity, 2 + world.rng.int(2));
  const sx = spawn % world.size;
  const sy = (spawn - sx) / world.size;
  // Newcomers bring a little know-how of their own, which makes each family distinct.
  const craft: Skill = SKILLS[world.rng.int(SKILLS.length)];
  const folk: Settler[] = [];
  for (let i = 0; i < size; i++) {
    const age = i < 2 ? 1.6 + world.rng.float() * 1.5 : world.rng.float() * 1.3;
    const s = world.addSettler(player.id, fam.id, world.randomName(), age, sx, sy);
    if (i === 0) s.skills[craft] = skillXp || world.rng.range(60, 150);
    if (i === 1 && skillXp) s.skills[craft] = skillXp;
    fam.skills[craft] = Math.max(fam.skills[craft], s.skills[craft]);
    s.job = { kind: 'arrive' };
    walkTo(world, s, target);
    if (i === 1 && folk.length) {
      s.spouseId = folk[0].id;
      folk[0].spouseId = s.id;
    }
    folk.push(s);
  }
  // Every family arrives with a character of its own; wanderers' arrival is the player's pick.
  if (skillXp) offerBoon(world, fam, 'Wanderers join you');
  else for (const id of drawBoons(world, fam, 1)) addBoon(fam, id);
  player.newcomerCooldown = hasOmen(world, 'wanderersRoad') ? BALANCE.newcomerCooldown / 2 : BALANCE.newcomerCooldown;
  world.stats.arrivals.push(world.tick);
  world.emit({ type: 'familyApproaching', owner: player.id, familyId: fam.id, surname: fam.surname, size, skill: craft });
  return fam;
}
