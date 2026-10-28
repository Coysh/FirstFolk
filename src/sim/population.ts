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
  const fam: Family = { id: world.newId(), owner, surname, color: world.families.size % CREST_COLORS.length, homeId, skills: emptySkills() };
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
    if (world.tick % BALANCE.newcomerCheckInterval === 0) checkNewcomers(world, player);
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
  if (player.hungry || world.stored(player.id, 'berries') < world.rules.newcomerMinFood) return;
  let hut: Building | undefined;
  for (const b of world.buildings.values())
    if (b.owner === player.id && b.done && b.type === 'hut' && b.familyId === 0) {
      hut = b;
      break;
    }
  if (!hut) return;
  spawnFamily(world, player, hut);
}

function spawnFamily(world: World, player: PlayerState, hut: Building): void {
  const e = world.entrance(hut);
  const target = world.idx(e.x, e.y);
  let spawn = -1;
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

  const fam = createFamily(world, player.id, hut.id);
  hut.familyId = fam.id;
  const capacity = BUILDINGS.hut.housing ?? 4;
  const size = Math.min(capacity, 2 + world.rng.int(3));
  const sx = spawn % world.size;
  const sy = (spawn - sx) / world.size;
  // Newcomers bring a little know-how of their own, which makes each family distinct.
  const craft: Skill = SKILLS[world.rng.int(SKILLS.length)];
  for (let i = 0; i < size; i++) {
    const age = i < 2 ? 1.6 + world.rng.float() * 1.5 : world.rng.float() * 1.3;
    const s = world.addSettler(player.id, fam.id, world.randomName(), age, sx, sy);
    if (i === 0) s.skills[craft] = world.rng.range(60, 150);
    fam.skills[craft] = Math.max(fam.skills[craft], s.skills[craft]);
    s.job = { kind: 'arrive' };
    walkTo(world, s, target);
  }
  player.newcomerCooldown = BALANCE.newcomerCooldown;
  world.stats.arrivals.push(world.tick);
  world.emit({ type: 'familyApproaching', familyId: fam.id, surname: fam.surname, size, skill: craft });
}
