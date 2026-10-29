import { BALANCE } from './balance';
import { BUILDINGS, GOODS, costTotal, type Good } from './defs';
import { pay } from './events';
import { isWalkableTerrain } from './mapgen';
import { spanTiles } from './bridges';
import { callingTier } from './callings';
import { hasOmen } from './omens';
import { playerMod } from './houses';
import { addRenown } from './renown';
import { crownSite } from './crown';
import { prosperity } from './prosperity';
import { armyParts, huscarlPower, resetDrill, type ArmyLine } from './army';
import { cheb, setIdle } from './settlers';
import { NO_OWNER, recomputeTerritory } from './territory';
import type { Building, World } from './world';

/**
 * Shields and spears: light, automatic warfare. Guard posts hold the land; a post's defence is
 * its guards, the stockades standing near it, the hall's ward close to home and the huscarls
 * at a Mustering Hall nearby. A raid marches a warband to a rival post and a clash follows: a
 * tug-of-war that takes several seconds and leans towards the stronger side, so there is time to
 * Rally the defence (or Surge the attack). Nobody is ever killed: raids burn posts, and the
 * beaten are sent home.
 */

/** The fight at a post, while it lasts (see updateClash). */
export interface Clash {
  /** Ticks since the warband arrived. */
  t: number;
  /** The tug-of-war, 0..1000: 1000 is the post falling, 0 the raiders driven off. Starts level. */
  line: number;
  /** Strength added by a rally (the defence) and a surge (the attack), once each. */
  rally: number;
  surge: number;
  /** Townsfolk who turned out for a rally (for the picture). */
  militia: number;
  rallied: boolean;
  surged: boolean;
  /** Strength bought with goods (Hired Spears), per side: 0 until they are hired. */
  hiredAtk: number;
  hiredDef: number;
  /** Both sides' strength at the last step, for the display. */
  attack: number;
  defence: number;
}

export interface Warband {
  id: number;
  /** The raiding settlement (NO_OWNER for reavers). */
  owner: number;
  /** Huscarls marching (their settler ids); reavers have none. */
  members: number[];
  strength: number;
  /** What the strength is made of, line by line, as it was when they marched (see army.ts). */
  lines?: ArmyLine[];
  /** Tiles to walk, and how far along it is (a step costs 1000). */
  path: number[];
  step: number;
  progress: number;
  targetId: number;
  /** Where it set out from (the Mustering Hall, or the shore for reavers). */
  homeId: number;
  phase: 'march' | 'clash' | 'home';
  /** The fight at the target, while phase is 'clash'. */
  clash?: Clash;
  x: number;
  y: number;
}

/** The posts a raid can strike: towers, outposts and stockades. */
export const raidable = (b: Building) => b.done && !!BUILDINGS[b.type].capped;

/** A player's Mustering Hall, if built. */
export function hallOf(world: World, owner: number): Building | undefined {
  for (const b of world.buildings.values()) if (b.owner === owner && b.type === 'musterhall' && b.done) return b;
  return undefined;
}

/** Huscarls at home in a Mustering Hall (not away with a warband). */
export function huscarls(world: World, hall: Building | undefined): number {
  if (!hall) return 0;
  let n = 0;
  for (const s of world.settlers.values()) if (s.job.kind === 'guard' && s.job.buildingId === hall.id && s.job.phase === 'watch') n++;
  return n;
}

/** A warband's strength: its huscarls, what they are worth (spear, House, Arms, Drill) and the multipliers (see army.ts). */
export function raidStrength(world: World, owner: number, n: number): number {
  return armyParts(world, owner, n).strength;
}

/** How hard a building is to take: its guards, nearby stockades, the hall's ward and huscarls close by. */
/** A post beside a finished bridge holds the crossing: a narrow place is easy to defend (and the one to burn). */
export function holdsCrossing(world: World, b: Building): boolean {
  const r = BALANCE.bridgeWard[0];
  for (const br of world.bridges)
    if (br.done && Math.max(Math.abs(br.x - b.x), Math.abs(br.y - b.y)) <= r + br.len) {
      for (const [x, y] of spanTiles(br)) if (cheb(x, y, b.x, b.y) <= r) return true;
    }
  return false;
}

export interface DefenceLine {
  label: string;
  n: number;
}

/** How hard a building is to take, line by line: the lines sum to `defenceOf`. */
export function defenceParts(world: World, b: Building): DefenceLine[] {
  const lines: DefenceLine[] = [];
  const add = (label: string, n: number) => {
    if (n <= 0) return;
    const hit = lines.find((l) => l.label === label);
    if (hit) hit.n += n;
    else lines.push({ label, n });
  };
  const pct = 100 + playerMod(world, b.owner, 'guard') + 10 * callingTier(world, b.owner, 'stronghold') + BALANCE.homeGuardPct * (world.players[b.owner]?.homeLevel ?? 0) + (holdsCrossing(world, b) ? BALANCE.bridgeWard[1] : 0);
  // Arms from the smithy's tools are for the garrisons as well as the huscarls.
  const arms = BALANCE.army.armsPer * (world.players[b.owner]?.army?.arms ?? 0);
  add(`${b.guarded} guard${b.guarded === 1 ? '' : 's'} × ${BALANCE.guardStrength}${arms ? `+${arms} arms` : ''}${pct !== 100 ? ` (+${pct - 100}%)` : ''}`, Math.floor((b.guarded * (BALANCE.guardStrength + arms) * pct) / 100));
  // The Kingstone shields the one folk who keeps it alone (not a contested stone).
  const crown = world.crown;
  const stone = crown && crown.keeper === b.owner ? crownSite(world) : undefined;
  if (stone && cheb(b.x + 1, b.y + 1, stone.x, stone.y) <= BALANCE.watchRange) add('The Kingstone’s light', BALANCE.crownWard);
  const wall = world.players[b.owner]?.shieldWall;
  if (wall && wall.until > world.tick && cheb(wall.x, wall.y, b.x, b.y) <= BALANCE.shieldWall[0]) add('Shield Wall', BALANCE.shieldWall[1]);
  for (const o of world.buildings.values()) {
    if (o.owner !== b.owner || !o.done) continue;
    const def = BUILDINGS[o.type];
    const dist = cheb(o.x, o.y, b.x, b.y);
    if (def.defence && dist <= def.defence[0]) add(o === b ? `${def.name}’s own footing` : `${def.name} nearby`, def.defence[1]);
    if ((o.type === 'wagon' || o.type === 'hamlet') && dist <= BALANCE.hallWard[0]) add(o.type === 'wagon' ? 'The hall’s ward' : 'The hamlet’s ward', BALANCE.hallWard[1] + BALANCE.hallWard[2] * (world.players[b.owner]?.rank ?? 0));
    // A Mustering Hall's huscarls turn out for any post close enough (unless they are away raiding).
    if (o.type === 'musterhall' && o !== b && dist <= BALANCE.interceptRange) {
      const n = huscarls(world, o);
      add(`${n} huscarls from the Mustering Hall`, n * huscarlPower(world, b.owner));
    }
  }
  return lines;
}

export const defenceOf = (world: World, b: Building): number => defenceParts(world, b).reduce((s, l) => s + l.n, 0);

/** Why a raid on this building can't be launched ('' when it can). */
export function raidProblem(world: World, owner: number, targetId: number): string {
  const p = world.players[owner];
  const hall = hallOf(world, owner);
  if (!hall) return 'Build a Mustering Hall first';
  if (world.tick < BALANCE.raidsFrom) return 'Raids begin at 10:00';
  if (world.warbands.some((w) => w.owner === owner)) return 'Your warband is already out';
  if (world.tick < p.raidReady) return `The huscarls are resting (${Math.ceil((p.raidReady - world.tick) / 10)}s)`;
  if (!huscarls(world, hall)) return 'No huscarls at the Mustering Hall';
  const b = world.buildings.get(targetId);
  if (!b || b.owner === owner || b.owner === NO_OWNER || !raidable(b)) return 'Pick a rival tower, outpost or stockade';
  if (!(world.explored[world.idx(b.x, b.y)] & (1 << owner))) return 'Your scouts haven’t seen it';
  if (cheb(b.x, b.y, hall.x, hall.y) > BALANCE.raidReach) return `Too far: raids reach ${BALANCE.raidReach} tiles from the Mustering Hall`;
  if (!world.routeOpen(world.entranceIdx(hall), world.entranceIdx(b))) return 'No way there on foot: hold a ford, or bridge the water';
  return '';
}

/** Launch a raid (a Command): the huscarls march out and the defender is warned. */
export function launchRaid(world: World, owner: number, targetId: number): void {
  if (raidProblem(world, owner, targetId)) return;
  const hall = hallOf(world, owner)!;
  const target = world.buildings.get(targetId)!;
  const path = world.findRoute(world.entranceIdx(hall), world.entranceIdx(target));
  if (!path) return;
  const members: number[] = [];
  for (const s of world.settlers.values())
    if (s.job.kind === 'guard' && s.job.buildingId === hall.id && s.job.phase === 'watch') {
      s.job.phase = 'away';
      s.path = [];
      s.next = -1;
      s.busy = 0;
      members.push(s.id);
    }
  const e = world.entrance(hall);
  const parts = armyParts(world, owner, members.length);
  const band: Warband = { id: world.newId(), owner, members, strength: parts.strength, lines: parts.lines, path, step: 0, progress: 0, targetId, homeId: hall.id, phase: 'march', x: e.x, y: e.y };
  world.players[owner].warhorn = false;
  resetDrill(world, owner);
  world.warbands.push(band);
  world.emit({ type: 'raidLaunched', owner, defender: target.owner, targetId, buildingType: target.type, x: target.x, y: target.y, strength: band.strength, eta: Math.ceil((path.length * 1000) / BALANCE.adultSpeed / 10) });
}

/** March warbands and settle skirmishes. Runs every tick. */
export function updateWarbands(world: World): void {
  if (!world.warbands.length) return;
  for (const band of [...world.warbands]) {
    if (band.phase === 'clash') {
      updateClash(world, band);
      continue;
    }
    band.progress += BALANCE.adultSpeed;
    while (band.progress >= 1000 && band.step < band.path.length) {
      band.progress -= 1000;
      const i = band.path[band.step++];
      band.x = i % world.size;
      band.y = (i - band.x) / world.size;
    }
    if (band.step < band.path.length) continue;
    if (band.phase === 'march') beginClash(world, band);
    else disband(world, band);
  }
}

/** The warband reaches its target: the fight begins, and the defender can see it happen. */
function beginClash(world: World, band: Warband): void {
  const target = world.buildings.get(band.targetId);
  // A target that burned (or was pulled down) before they arrived: they simply turn for home.
  if (!target) return finishClash(world, band, false);
  const defence = defenceOf(world, target);
  band.phase = 'clash';
  band.clash = { t: 0, line: 500, rally: 0, surge: 0, militia: 0, rallied: false, surged: false, hiredAtk: 0, hiredDef: 0, attack: band.strength, defence };
  world.emit({ type: 'clashBegan', bandId: band.id, owner: band.owner, defender: target.owner, targetId: target.id, buildingType: target.type, x: target.x, y: target.y, attack: band.strength, defence });
}

/**
 * The tug-of-war: every half second the line moves towards the stronger side, a little
 * unevenly. The post falls when it reaches the end, or the raiders are driven off; if neither
 * happens in time, whoever is ahead wins. A Rally or a Surge in the meantime changes the odds.
 */
function updateClash(world: World, band: Warband): void {
  const c = band.clash!;
  const target = world.buildings.get(band.targetId);
  if (!target) return finishClash(world, band, false);
  if (++c.t % BALANCE.clashStep) return;
  c.attack = band.strength + c.surge + (c.hiredAtk ?? 0);
  c.defence = defenceOf(world, target) + c.rally + (c.hiredDef ?? 0);
  const ratio = Math.trunc(((c.attack - c.defence) * 100) / Math.max(1, c.attack + c.defence));
  c.line = Math.max(0, Math.min(1000, c.line + Math.trunc((ratio * BALANCE.clashPush) / 100) + world.rng.int(17) - 8));
  if (c.line < 1000 && c.line > 0 && c.t < BALANCE.clashTicks) return;
  finishClash(world, band, c.line > 500 || (c.line === 500 && world.rng.int(2) === 0));
}

/** Rally the defence of a besieged post, or surge the attack, once each per clash. Returns false if there is nothing to do. */
export function rally(world: World, owner: number): boolean {
  const p = world.players[owner];
  if (!p) return false;
  for (const band of world.warbands) {
    const c = band.clash;
    const target = world.buildings.get(band.targetId);
    if (band.phase !== 'clash' || !c || !target) continue;
    if (band.owner === owner) {
      if (c.surged) continue;
      c.surged = true;
      c.surge = Math.floor((band.strength * BALANCE.surgePct) / 100);
      world.emit({ type: 'clashRally', owner, bandId: band.id, targetId: target.id, kind: 'surge', n: 0, strength: c.surge, x: target.x, y: target.y });
      return true;
    }
    if (target.owner !== owner || c.rallied || world.tick < p.rallyReady) continue;
    let n = 0;
    for (const s of world.settlers.values())
      if (s.owner === owner && !s.child && s.job.kind !== 'guard' && cheb(s.x, s.y, target.x, target.y) <= BALANCE.rallyRadius) {
        n++;
        // Everyone who answers drops their tools for a while: the work near the fight stops.
        s.busy = Math.max(s.busy, BALANCE.rallyPause);
      }
    c.rallied = true;
    // A hearth town turns out in numbers: two more hands a tier.
    c.militia = Math.min(BALANCE.rallyMax + 2 * callingTier(world, owner, 'hearth'), n);
    c.rally = BALANCE.rallyBase + BALANCE.rallyEach * c.militia;
    p.rallyReady = world.tick + BALANCE.rallyCooldown;
    world.emit({ type: 'clashRally', owner, bandId: band.id, targetId: target.id, kind: 'rally', n: c.militia, strength: c.rally, x: target.x, y: target.y });
    return true;
  }
  return false;
}

/** What Hired Spears are worth to a settlement right now: a base, and more for every level its homes have grown. */
export const hireStrength = (world: World, owner: number) => BALANCE.hireBase + BALANCE.hirePerLevel * (world.players[owner]?.homeLevel ?? 0);

/** Why this settlement cannot hire spears now ('' when it can): one clash it stands in, goods in store, once per side. */
export function hireProblem(world: World, owner: number): string {
  const band = world.warbands.find((b) => b.phase === 'clash' && b.clash && (b.owner === owner || world.buildings.get(b.targetId)?.owner === owner));
  if (!band) return 'No fight to hire spears for';
  const attacking = band.owner === owner;
  if (attacking ? band.clash!.hiredAtk : band.clash!.hiredDef) return 'Spears already hired for this fight';
  for (const [g, n] of Object.entries(BALANCE.hireCost)) if (world.stored(owner, g as Good) < n) return `Needs ${n} ${g} in store`;
  return '';
}

/** Pay for spears: strength for this clash, bought with ale and tools. Returns false when it cannot be done (nothing is spent). */
export function hire(world: World, owner: number): boolean {
  if (hireProblem(world, owner)) return false;
  const band = world.warbands.find((b) => b.phase === 'clash' && b.clash && (b.owner === owner || world.buildings.get(b.targetId)?.owner === owner))!;
  const target = world.buildings.get(band.targetId);
  if (!target) return false;
  const attacking = band.owner === owner;
  const n = hireStrength(world, owner);
  pay(world, owner, BALANCE.hireCost);
  if (attacking) band.clash!.hiredAtk = n;
  else band.clash!.hiredDef = n;
  world.emit({ type: 'clashRally', owner, bandId: band.id, targetId: target.id, kind: 'hire', n: 0, strength: n, x: target.x, y: target.y });
  return true;
}

/**
 * Both sides of a fight, line by line, and what the viewer could still add (so no number is a mystery):
 * `options` are the things `viewer` can still do right now, each with what it is worth.
 */
export function clashParts(world: World, band: Warband, viewer: number): { attack: DefenceLine[]; defence: DefenceLine[]; mine: number; theirs: number; options: { label: string; n: number; key: string }[] } {
  const c = band.clash;
  const target = world.buildings.get(band.targetId);
  const attack: DefenceLine[] = [...(band.lines ?? [{ label: 'The warband', n: band.strength }])];
  if (c?.surged && c.surge) attack.push({ label: 'Surge', n: c.surge });
  if (c?.hiredAtk) attack.push({ label: 'Hired spears', n: c.hiredAtk });
  const defence: DefenceLine[] = target ? defenceParts(world, target) : [];
  if (c?.rallied && c.rally) defence.push({ label: `${c.militia} townsfolk rallied`, n: c.rally });
  if (c?.hiredDef) defence.push({ label: 'Hired spears', n: c.hiredDef });
  const sum = (l: DefenceLine[]) => l.reduce((s, x) => s + x.n, 0);
  const viewerAttacks = band.owner === viewer;
  const options: { label: string; n: number; key: string }[] = [];
  const p = world.players[viewer];
  if (target && p) {
    if (viewerAttacks && !c?.surged) options.push({ label: 'Surge (G)', n: Math.floor((band.strength * BALANCE.surgePct) / 100), key: 'surge' });
    if (!viewerAttacks && target.owner === viewer && !c?.rallied && world.tick >= p.rallyReady) {
      let hands = 0;
      for (const s of world.settlers.values()) if (s.owner === viewer && !s.child && s.job.kind !== 'guard' && cheb(s.x, s.y, target.x, target.y) <= BALANCE.rallyRadius) hands++;
      hands = Math.min(hands, BALANCE.rallyMax + 2 * callingTier(world, viewer, 'hearth'));
      options.push({ label: 'Rally (G)', n: BALANCE.rallyBase + BALANCE.rallyEach * hands, key: 'rally' });
    }
    if (c && !hireProblem(world, viewer)) options.push({ label: 'Hire spears (H)', n: hireStrength(world, viewer), key: 'hire' });
  }
  return viewerAttacks ? { attack, defence, mine: sum(attack), theirs: sum(defence), options } : { attack, defence, mine: sum(defence), theirs: sum(attack), options };
}

/** The clash is decided: a post burns or holds, renown is paid, and the warband turns for home. */
function finishClash(world: World, band: Warband, won: boolean): void {
  const target = world.buildings.get(band.targetId);
  const defender = target?.owner ?? NO_OWNER;
  const defence = band.clash?.defence ?? 0;
  won = won && !!target;
  let renown = 0;
  if (target && won) {
    // Spoils grow with what the post cost; an unmanned post is a poor prize.
    renown = Math.min(BALANCE.raidSpoils[1], BALANCE.raidSpoils[0] + Math.floor(costTotal(target.cost) / 2));
    // A stronghold's raiders bring home richer spoils: +25% a tier.
    if (band.owner !== NO_OWNER) renown = Math.floor((renown * (100 + 25 * callingTier(world, band.owner, 'stronghold'))) / 100);
    if (!target.guarded) renown = Math.floor(renown / 2);
    raze(world, target);
    if (band.owner !== NO_OWNER) {
      addRenown(world, band.owner, renown, 'raids', target.x, target.y);
      world.players[band.owner].raidsWon++;
    }
    if (band.owner === NO_OWNER) plunder(world, defender, target.x, target.y);
  } else if (target && defender !== NO_OWNER) {
    renown = band.owner === NO_OWNER ? BALANCE.reaverRepel : BALANCE.repelRenown;
    addRenown(world, defender, renown, 'defence', target.x, target.y);
    world.players[defender].repelled++;
  }
  if (target) world.emit({ type: 'raidResolved', owner: band.owner, defender, won, buildingType: target.type, x: band.x, y: band.y, attack: band.strength, defence, renown });
  // Home again (the way they came).
  band.phase = 'home';
  band.clash = undefined;
  band.path = band.path.slice(0, -1).reverse();
  const home = world.buildings.get(band.homeId);
  if (home) band.path.push(world.entranceIdx(home));
  band.step = 0;
  band.progress = 0;
  if (band.owner !== NO_OWNER) world.players[band.owner].raidReady = world.tick + BALANCE.raidCooldown;
}

function disband(world: World, band: Warband): void {
  world.warbands.splice(world.warbands.indexOf(band), 1);
  for (const id of band.members) {
    const s = world.settlers.get(id);
    if (!s || s.job.kind !== 'guard' || s.job.phase !== 'away') continue;
    s.x = band.x;
    s.y = band.y;
    if (world.buildings.has(s.job.buildingId)) s.job.phase = 'toPost';
    else setIdle(s);
  }
}

/** Reavers carry off a little from the nearest store. */
function plunder(world: World, owner: number, x: number, y: number): void {
  const stores = world.storages(owner);
  let best: Building | undefined;
  for (const s of stores) if (!best || cheb(s.x, s.y, x, y) < cheb(best.x, best.y, x, y)) best = s;
  if (!best) return;
  const good = GOODS.reduce((a, g) => (best!.stock[g] - best!.reserved[g] > best!.stock[a] - best!.reserved[a] ? g : a), GOODS[0]);
  best.stock[good] -= Math.min(BALANCE.reaverLoot, Math.max(0, best.stock[good] - best.reserved[good]));
}

/** Do reavers come to this valley? Always in a race; in a peaceful valley only with the Reaver Coast omen. */
export const reaversCome = (world: World) => world.players.length > 1 || hasOmen(world, 'reaverCoast');

/** How strong the next band of reavers is. */
export function reaverStrength(world: World, victim = -1): number {
  const [base, step] = BALANCE.reaverStrength;
  // They come for what is worth taking: a richer town draws a bigger host (a tenth of its prosperity).
  const lure = victim >= 0 ? Math.floor(prosperity(world, victim) / BALANCE.reaverLureDiv) : 0;
  const n = base + lure + step * Math.floor(Math.max(0, world.tick - BALANCE.reaversFrom) / (BALANCE.reaverGap[0] * 1.25));
  return Math.round((n * (world.difficulty === 'relaxed' ? 70 : world.difficulty === 'hard' ? 120 : 100)) / 100 / 5) * 5;
}

/**
 * Reavers land on the shore facing the settlement that has spread itself thinnest (the most
 * posts, at least `reaverMinPosts`) and march on its furthest post from home.
 */
export function updateReavers(world: World): void {
  if (!reaversCome(world) || world.tick < world.nextReaversAt) return;
  const limit = world.scenario.timeLimit;
  if (limit && world.tick > limit - BALANCE.reaverGap[0] / 2) return;
  const gap = BALANCE.reaverGap[0] + world.rng.int(BALANCE.reaverGap[1] - BALANCE.reaverGap[0]);
  world.nextReaversAt = world.tick + (hasOmen(world, 'reaverCoast') ? Math.floor(gap / 2) : gap);
  // The settlement spread widest and talked of most: posts, plus one for every 50 renown of lead.
  const top = Math.max(...world.players.map((p) => p.renown));
  const lure = (p: (typeof world.players)[number]) => world.frontierCount(p.id) * 50 + Math.max(0, p.renown - (world.players.length > 1 ? Math.min(...world.players.map((q) => q.renown)) : p.renown)) + (p.renown === top ? 1 : 0);
  const ranked = [...world.players].sort((a, b) => lure(b) - lure(a) || a.id - b.id);
  const victim = ranked[0];
  if (!victim || world.frontierCount(victim.id) < BALANCE.reaverMinPosts) return;
  const hall = [...world.buildings.values()].find((b) => b.owner === victim.id && b.type === 'wagon');
  if (!hall) return;
  // They strike the post furthest from home: guard your outermost tower and you hold the line.
  let target: Building | undefined;
  let far = -1;
  for (const b of world.buildings.values()) {
    if (b.owner !== victim.id || !raidable(b)) continue;
    const d = cheb(b.x, b.y, hall.x, hall.y);
    if (d > far) {
      far = d;
      target = b;
    }
  }
  if (!target) return;
  const shore = landing(world, victim.id, hall, target);
  if (!shore) return;
  const path = world.pathfinder.find(shore, world.entranceIdx(target));
  if (!path) return;
  const x = shore % world.size;
  const y = (shore - x) / world.size;
  const band: Warband = { id: world.newId(), owner: NO_OWNER, members: [], strength: reaverStrength(world, victim.id), lines: [{ label: 'The reavers’ host', n: reaverStrength(world, victim.id) }], path, step: 0, progress: 0, targetId: target.id, homeId: 0, phase: 'march', x, y };
  world.warbands.push(band);
  world.emit({ type: 'raidLaunched', owner: NO_OWNER, defender: victim.id, targetId: target.id, buildingType: target.type, x: target.x, y: target.y, strength: band.strength, eta: Math.ceil((path.length * 1000) / BALANCE.adultSpeed / 10) });
}

/** Open ground beyond a post, away from its hall, outside its owner's land: where reavers come ashore. */
function landing(world: World, owner: number, hall: Building, target: Building): number | null {
  const dx = target.x - hall.x;
  const dy = target.y - hall.y;
  const len = Math.max(1, Math.abs(dx), Math.abs(dy));
  let best: number | null = null;
  for (let k = 10; k <= 26; k++) {
    const x = target.x + Math.round((dx * k) / len);
    const y = target.y + Math.round((dy * k) / len);
    if (!world.inBounds(x, y)) break;
    const i = world.idx(x, y);
    if (!isWalkableTerrain(world.map.terrain[i]) || world.buildingAt[i] || world.territory[i] === owner) continue;
    best = i;
    if (k >= 14) break;
  }
  return best;
}

/** A post burns: it is gone, its guards flee home, and its land is open to whoever pushes. */
export function raze(world: World, b: Building): void {
  world.buildings.delete(b.id);
  world.buildingsVersion++;
  const size = BUILDINGS[b.type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) world.buildingAt[world.idx(b.x + dx, b.y + dy)] = 0;
  for (const s of world.settlers.values()) if (s.job.kind === 'guard' && s.job.buildingId === b.id && s.job.phase !== 'away') setIdle(s), (s.path = []);
  world.emit({ type: 'razed', owner: b.owner, id: b.id, buildingType: b.type, x: b.x, y: b.y });
  // Landmarks that change hands because of a raid don't pay the seizing prize as well.
  world.quietSeize = true;
  recomputeTerritory(world);
  world.quietSeize = false;
}
