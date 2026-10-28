import { BALANCE } from './balance';
import { BUILDINGS, SKILLS, type Skill } from './defs';
import { walkTo } from './settlers';
import { emptySkills, type Building, type Family, type PlayerState, type World } from './world';

export const SURNAMES = [
  'Ashby', 'Thorne', 'Holloway', 'Fenwick', 'Marsh', 'Brook', 'Whitlow', 'Hale', 'Oakley', 'Underhill',
  'Rook', 'Elwood', 'Garth', 'Harrow', 'Kettle', 'Lambert', 'Moss', 'Pike', 'Stow', 'Wren',
];

/** Crest colours, shown on hats, banners and flags. */
export const CREST_COLORS = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x8e44ad, 0x16a085, 0xd35400, 0x34495e, 0xe84393, 0x27ae60, 0x7f5539];

export function createFamily(world: World, owner: number, homeId: number): Family {
  const used = new Set([...world.families.values()].map((f) => f.surname));
  const free = SURNAMES.filter((n) => !used.has(n));
  const surname = free.length ? world.rng.pick(free) : world.rng.pick(SURNAMES);
  const fam: Family = { id: world.newId(), owner, surname, color: world.families.size % CREST_COLORS.length, homeId, skills: emptySkills(), birthCooldown: BALANCE.birthInterval };
  world.families.set(fam.id, fam);
  return fam;
}

export function updatePopulation(world: World): void {
  for (const player of world.players) {
    player.mealAccum += world.population(player.id);
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
  const fed = !player.hungry && world.stored(player.id, 'berries') >= world.rules.newcomerMinFood;
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
        if (!s.child) adults++;
      }
    if (adults < 2 || members >= (BUILDINGS[home.type].housing ?? 0)) continue;
    const e = world.entrance(home);
    const baby = world.addSettler(player.id, fam.id, world.randomName(), 0, e.x, e.y);
    fam.birthCooldown = BALANCE.birthInterval;
    world.emit({ type: 'born', settlerId: baby.id, name: baby.name, surname: fam.surname });
  }
}

function eat(world: World, player: PlayerState): void {
  let best: Building | undefined;
  for (const b of world.storages(player.id))
    if (b.stock.berries - b.reserved.berries > 0 && (!best || b.stock.berries > best.stock.berries)) best = b;
  if (best) {
    best.stock.berries--;
    if (player.hungry) {
      player.hungry = false;
      world.emit({ type: 'fed' });
    }
  } else if (!player.hungry) {
    player.hungry = true;
    world.emit({ type: 'hungry' });
  }
}

function checkNewcomers(world: World, player: PlayerState): void {
  if (player.newcomerCooldown > 0) {
    player.newcomerCooldown -= BALANCE.newcomerCheckInterval;
    return;
  }
  let hut: Building | undefined;
  for (const b of world.buildings.values())
    if (b.owner === player.id && b.done && b.type === 'hut' && b.familyId === 0) {
      hut = b;
      break;
    }
  if (!hut) return;
  // Homeless families (wanderers) move in first, whatever the larder holds.
  for (const fam of world.families.values())
    if (fam.owner === player.id && !world.buildings.has(fam.homeId)) {
      fam.homeId = hut.id;
      hut.familyId = fam.id;
      world.emit({ type: 'familySettled', familyId: fam.id, surname: fam.surname, buildingId: hut.id });
      return;
    }
  if (player.hungry || world.stored(player.id, 'berries') < world.rules.newcomerMinFood) return;
  spawnFamily(world, player, hut);
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
  for (let i = 0; i < size; i++) {
    const age = i < 2 ? 1.6 + world.rng.float() * 1.5 : world.rng.float() * 1.3;
    const s = world.addSettler(player.id, fam.id, world.randomName(), age, sx, sy);
    if (i === 0) s.skills[craft] = skillXp || world.rng.range(60, 150);
    if (i === 1 && skillXp) s.skills[craft] = skillXp;
    fam.skills[craft] = Math.max(fam.skills[craft], s.skills[craft]);
    s.job = { kind: 'arrive' };
    walkTo(world, s, target);
  }
  player.newcomerCooldown = BALANCE.newcomerCooldown;
  world.stats.arrivals.push(world.tick);
  world.emit({ type: 'familyApproaching', familyId: fam.id, surname: fam.surname, size, skill: craft });
  return fam;
}
