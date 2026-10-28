import { OpeningBot } from './ai/openingBot';
import { TICK_HZ } from './balance';
import { World } from './world';
import { GOODS } from './defs';
import type { Difficulty } from './rules';
import { plural } from './population';

export interface PlaytestReport {
  seed: number;
  minutes: number;
  firstLogsSec: number;
  victorySec: number;
  /** Seconds at which each scenario chapter was completed. */
  chapters: Record<string, number>;
  firstJourneymanSec: number;
  idleAdultPct: number;
  longestQuietSec: number;
  /** Longest stretch without a major beat (discovery, unlock, tier-up, chapter, arrival). */
  longestMajorGapSec: number;
  firstDiscoverySec: number;
  claimed: number;
  rivalClaimed: number;
  rivalRank: number;
  winner: number;
  /** Won on the clock (time limit) rather than by reaching the goal. */
  byTime: boolean;
  /** Renown per minute for [player, rival]. */
  renownByMinute: [number, number][];
  /** Times the renown lead changed hands (sampled each minute from minute 5). */
  leadChanges: number;
  /** Largest renown deficit the eventual winner came back from (after minute 5). */
  winnerDeficit: number;
  /** Landmarks that changed hands between settlements. */
  holdingFlips: number;
  renownBy: Partial<Record<string, number>>[];
  /** Goods sitting in the player's stores at minutes 10, 20 and 30: is stuff piling up? */
  stockAt: number[];
  /** Territory size (tiles) per minute: the frontier should keep moving. */
  territoryByMinute: number[];
  populationByMinute: number[];
  timeline: string[];
}

const fmt = (tick: number) => {
  const s = Math.floor(tick / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export interface PlaytestOptions {
  /** The scripted player's think interval (ticks); 100 is a brisk human. */
  think?: number;
  difficulty?: Difficulty;
}

/** Headless playtest: the scripted bot plays one game and we measure the pacing beats. */
export function playtest(seed: number, minutes: number, opts: PlaytestOptions = {}): PlaytestReport {
  const world = new World({ seed, difficulty: opts.difficulty });
  const bot = new OpeningBot(0, opts.think ?? 100);
  const renownByMinute: [number, number][] = [];
  const stockAt: number[] = [];
  let holdingFlips = 0;
  let byTime = false;
  const timeline: string[] = [];
  const populationByMinute: number[] = [];
  const territoryByMinute: number[] = [];
  let victoryTick = -1;
  let winner = -1;
  const chapters: Record<string, number> = {};
  let firstJourneyman = -1;
  const total = minutes * 60 * TICK_HZ;
  for (let i = 0; i < total; i++) {
    if (victoryTick >= 0 && world.tick > victoryTick + 60 * TICK_HZ) break;
    bot.update(world);
    world.step();
    for (const e of world.drainEvents()) {
      const t = fmt(world.tick);
      if ('owner' in e && e.owner !== 0 && e.type !== 'claimed' && e.type !== 'rankUp') continue;
      if (e.type === 'buildingComplete') timeline.push(`${t} built ${e.buildingType}`);
      else if (e.type === 'familyApproaching') timeline.push(`${t} the ${e.surname} family (${e.size}) arrives`);
      else if (e.type === 'objectiveComplete') timeline.push(`${t} ✓ ${e.label}`);
      else if (e.type === 'cameOfAge') timeline.push(`${t} ${e.name} ${e.surname} comes of age`);
      else if (e.type === 'discovered' && e.owner === 0) timeline.push(`${t} 👁 spotted ${e.kind}`);
      else if (e.type === 'claimed' && e.owner === 0) timeline.push(`${t} ★ claimed ${e.kind}: ${e.text}`);
      else if (e.type === 'rumour' && e.owner === 0) timeline.push(`${t} 🗣 rumour of ${e.kind} to the ${e.dir}`);
      else if (e.type === 'familySettled') timeline.push(`${t} the ${e.surname} family moves into a hut`);
      else if (e.type === 'boonOffered' && e.owner === 0) timeline.push(`${t} 🃏 boon choice for the ${plural(e.surname)} (${e.reason})`);
      else if (e.type === 'boonChosen' && e.owner === 0) timeline.push(`${t}    → the ${plural(e.surname)} take ${e.boon}`);
      else if (e.type === 'married' && e.owner === 0) timeline.push(`${t} 💍 a new ${e.surname} household is founded by marriage`);
      else if (e.type === 'season') timeline.push(`${t} ${['🌱 spring', '☀️ summer', '🍂 autumn', '❄️ winter'][e.season]}`);
      else if (e.type === 'rankUp' && e.owner === 0) timeline.push(`${t} 🏰 RANK UP: ${['Camp', 'Hamlet', 'Village', 'Town'][e.rank]} (unlocks ${e.unlocks.join(', ') || 'nothing'})`);
      else if (e.type === 'valleyEvent' && e.owner === 0) timeline.push(`${t} 📜 event: ${e.def}`);
      else if (e.type === 'eventResolved' && e.owner === 0) timeline.push(`${t}    → ${e.choice}: ${e.text}`);
      else if (e.type === 'rivalSighted') timeline.push(`${t} ⚔ rival border sighted`);
      else if (e.type === 'holdingChanged') {
        if (e.from >= 0) holdingFlips++;
        timeline.push(`${t} ${e.owner === 0 ? '⚑ took' : '⚐ LOST'} the ${e.kind}${e.from < 0 ? ' (unheld)' : ''}`);
      } else if (e.type === 'renown' && e.owner === 0 && e.amount >= 10) timeline.push(`${t}    +${e.amount} renown (${e.source})`);
      else if (e.type === 'deed' && e.owner === 0) timeline.push(`${t} ✦ deed ${e.deed}: ${e.text}`);
      else if (e.type === 'deed' && e.owner === 1) timeline.push(`${t} ✗ rival deed ${e.deed}`);
      else if (e.type === 'died' && e.owner === 0) timeline.push(`${t} ✝ ${e.name} ${e.surname} dies aged ${e.age}${e.legend ? ` — a legend of ${e.legend}` : ''}`);
      else if (e.type === 'sold' && e.owner === 0) timeline.push(`${t} ⚖ sold ${e.n} ${e.good} for ${e.renown}`);
      else if (e.type === 'workBegun') timeline.push(`${t} ${e.owner === 0 ? '🏛 began' : '✗ rival began'} ${e.buildingType}`);
      else if (e.type === 'workLost') timeline.push(`${t} ✗ lost the race for ${e.buildingType}`);
      else if (e.type === 'claimed' && e.owner === 1) timeline.push(`${t} ✗ rival claimed ${e.kind}`);
      else if (e.type === 'rankUp' && e.owner === 1) timeline.push(`${t} ✗ rival is now rank ${e.rank}`);
      else if (e.type === 'born') timeline.push(`${t} 👶 ${e.name} ${e.surname} is born`);
      else if (e.type === 'hungry') timeline.push(`${t} ! hungry`);
      else if (e.type === 'fed') timeline.push(`${t} fed again`);
      else if (e.type === 'chapterComplete') {
        chapters[e.chapter] = world.tick / TICK_HZ;
        timeline.push(`${t} ★ chapter ${e.chapter} complete`);
      } else if (e.type === 'tierUp') {
        if (firstJourneyman < 0) firstJourneyman = world.tick / TICK_HZ;
        timeline.push(`${t} ⬆ ${world.settlers.get(e.settlerId)?.name} reaches tier ${e.tier} in ${e.skill}`);
      } else if (e.type === 'unlocked') timeline.push(`${t} 🔓 ${e.buildingType} unlocked`);
      else if (e.type === 'victory') {
        timeline.push(`${t} ★ ${e.scenario} won by ${e.winner === 0 ? 'the player' : 'the RIVAL'}`);
        victoryTick = world.tick;
        winner = e.winner;
        byTime = e.byTime;
      }
    }
    if (world.tick % (60 * TICK_HZ) === 0) {
      populationByMinute.push(world.population(0));
      renownByMinute.push([world.players[0].renown, world.players[1]?.renown ?? 0]);
      if ([10, 20, 30].includes(world.tick / (60 * TICK_HZ))) stockAt.push(GOODS.reduce((n, g) => n + world.stored(0, g), 0));
      let land = 0;
      for (let k = 0; k < world.territory.length; k++) if (world.territory[k] === 0) land++;
      territoryByMinute.push(land);
    }
  }
  const st = world.stats;
  let leadChanges = 0;
  let leader = -1;
  let winnerDeficit = 0;
  renownByMinute.forEach(([a, b], m) => {
    if (m < 5) return;
    const lead = a > b ? 0 : b > a ? 1 : leader;
    if (leader >= 0 && lead !== leader) leadChanges++;
    leader = lead;
    if (winner >= 0) winnerDeficit = Math.max(winnerDeficit, (winner === 0 ? b - a : a - b));
  });
  return {
    seed,
    minutes,
    firstLogsSec: st.firstLogsTick / TICK_HZ,
    victorySec: victoryTick < 0 ? -1 : victoryTick / TICK_HZ,
    chapters,
    firstJourneymanSec: firstJourneyman,
    idleAdultPct: st.adultTicks ? Math.round((1000 * st.idleAdultTicks) / st.adultTicks) / 10 : 0,
    longestQuietSec: st.longestQuiet / TICK_HZ,
    longestMajorGapSec: Math.max(st.longestMajorGap, world.tick - st.lastMajorTick) / TICK_HZ,
    firstDiscoverySec: st.firstDiscoveryTick / TICK_HZ,
    claimed: world.players[0].claimed,
    rivalClaimed: world.players[1]?.claimed ?? 0,
    rivalRank: world.players[1]?.rank ?? 0,
    winner,
    byTime,
    renownByMinute,
    leadChanges,
    winnerDeficit,
    holdingFlips,
    renownBy: world.players.map((p) => ({ ...p.renownBy })),
    stockAt,
    territoryByMinute,
    populationByMinute,
    timeline,
  };
}
