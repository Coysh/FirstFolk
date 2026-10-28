import { BALANCE, secs } from './balance';
import { DISCOVERIES } from './defs';
import { addRenown } from './renown';
import { NO_OWNER } from './territory';
import type { World } from './world';

/**
 * Challenges: every few minutes the valley calls a short head-to-head contest (Battle Drones'
 * uplinks and supply drops, without the shooting): first settlement to the target within
 * the time wins the prize. They give the mid-game frequent, short, competitive goals that
 * reward whatever both settlements are doing anyway, so the race is never just a number.
 * Pure data: a measure per player, a target gain, a time limit and a prize.
 */
export interface ChallengeDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  duration: number;
  /** Gain needed over the measure's value when the challenge was called. */
  target: number;
  prize: number;
  when?(world: World): boolean;
  measure(world: World, owner: number): number;
}

const starstone = (w: World) => w.sites.find((s) => s.kind === 'starstone');

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'harvest',
    title: 'The Harvest Contest',
    icon: '🧺',
    text: 'First to bring in 50 food wins the harvest crown.',
    duration: secs(150),
    target: 50,
    prize: 30,
    measure: (w, o) => w.players[o].produced.berries + w.players[o].produced.fish,
  },
  {
    id: 'timber',
    title: 'The Woodmen’s Wager',
    icon: '🪓',
    text: 'First to fell and saw 60 logs and planks.',
    duration: secs(150),
    target: 60,
    prize: 25,
    measure: (w, o) => w.players[o].produced.logs + w.players[o].produced.planks,
  },
  {
    id: 'builders',
    title: 'The Builders’ Race',
    icon: '🔨',
    text: 'First to finish four new buildings.',
    duration: secs(180),
    target: 4,
    prize: 30,
    measure: (w, o) => [...w.buildings.values()].filter((b) => b.owner === o && b.done).length,
  },
  {
    id: 'tower',
    title: 'Banners on the Hills',
    icon: '🚩',
    text: 'First to raise a new Lookout, Watchtower or Outpost.',
    duration: secs(150),
    target: 1,
    prize: 25,
    measure: (w, o) => [...w.buildings.values()].filter((b) => b.owner === o && b.done && (b.type === 'lookout' || b.type === 'watchtower' || b.type === 'outpost')).length,
  },
  {
    id: 'seize',
    title: 'Steal a March',
    icon: '⚑',
    text: 'First to take a landmark from the other settlement.',
    duration: secs(200),
    target: 1,
    prize: 40,
    when: (w) => w.sites.filter((s) => DISCOVERIES[s.kind].renown && s.heldBy !== NO_OWNER).length >= 2,
    measure: (w, o) => w.players[o].taken,
  },
  {
    id: 'star',
    title: 'Race to the Star-Stone',
    icon: '☄️',
    text: 'Whoever holds the Star-Stone first wins the stargazers’ purse.',
    duration: secs(240),
    target: 1,
    prize: 40,
    when: (w) => !!starstone(w) && starstone(w)!.heldBy === NO_OWNER,
    measure: (w, o) => (starstone(w)?.heldBy === o ? 1 : 0),
  },
  {
    id: 'market',
    title: 'The Great Fair',
    icon: '⚖️',
    text: 'First to sell three lots at Market Day.',
    duration: secs(180),
    target: 60,
    prize: 25,
    when: (w) => w.players.every((p) => p.rank >= 1),
    measure: (w, o) => w.players[o].sold,
  },
];

export const challengeDef = (id: string) => CHALLENGES.find((c) => c.id === id);

/** Progress of each player in the running challenge: [gain, target]. */
export function challengeProgress(world: World, owner: number): [number, number] {
  const c = world.challenge;
  const def = c && challengeDef(c.def);
  if (!c || !def) return [0, 0];
  return [Math.max(0, def.measure(world, owner) - c.start[owner]), def.target];
}

/** Call, judge and close challenges. Runs about once a second. */
export function updateChallenges(world: World): void {
  if (world.players.length < 2) return;
  const c = world.challenge;
  if (c) {
    const def = challengeDef(c.def)!;
    const done = world.players.filter((p) => challengeProgress(world, p.id)[0] >= def.target);
    if (done.length) {
      // A dead heat goes to whoever is further over the line, then to the lower renown.
      done.sort((a, b) => challengeProgress(world, b.id)[0] - challengeProgress(world, a.id)[0] || a.renown - b.renown);
      const winner = done[0].id;
      addRenown(world, winner, def.prize, 'contests');
      world.players[winner].challengesWon++;
      world.challenge = null;
      world.nextChallengeAt = world.tick + BALANCE.challengeGap[0] + world.rng.int(BALANCE.challengeGap[1] - BALANCE.challengeGap[0]);
      world.emit({ type: 'challengeWon', def: def.id, winner, prize: def.prize });
    } else if (world.tick >= c.endsAt) {
      world.challenge = null;
      world.nextChallengeAt = world.tick + BALANCE.challengeGap[0];
      world.emit({ type: 'challengeExpired', def: def.id });
    }
    return;
  }
  if (world.tick < world.nextChallengeAt) return;
  // Not in the last minutes: the finale belongs to the race itself.
  if (world.scenario.timeLimit && world.tick > world.scenario.timeLimit - secs(4 * 60)) return;
  const pool = CHALLENGES.filter((d) => d.id !== world.lastChallenge && (!d.when || d.when(world)));
  if (!pool.length) return;
  // The Star-Stone race takes precedence while the stone lies unclaimed.
  const def = pool.find((d) => d.id === 'star') ?? pool[world.rng.int(pool.length)];
  world.challenge = { def: def.id, endsAt: world.tick + def.duration, start: world.players.map((p) => def.measure(world, p.id)) };
  world.lastChallenge = def.id;
  world.emit({ type: 'challenge', def: def.id });
}
