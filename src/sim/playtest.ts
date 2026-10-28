import { OpeningBot } from './ai/openingBot';
import { TICK_HZ } from './balance';
import { World, type SimEvent } from './world';
import { GOODS } from './defs';
import type { Difficulty } from './rules';
import type { OriginId } from './origins';
import { rollOmens } from './omens';
import { plural } from './population';
import { BUILDINGS } from './defs';
import type { BotStyle } from './ai/styles';
import { newsFor, simulateDesk, type News } from '../ui/news';

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
  /** Moments that ask the player to look, decide or act (clashes, Crown swings, raids, story beats, claims, events), per minute. */
  actionByMinute: number[];
  /** Choices the player made (Commands that were decisions, not chores), per minute. */
  decisionsByMinute: number[];
  /** The player's Crown minus the rival's, per minute (0 until the Crown has anything in it). */
  scoreByMinute: number[];
  /** Times the Crown lead changed hands (from minute 5, once someone has progress). */
  crownLeadChanges: number;
  /** Largest Crown deficit (points) the winner came back from after minute 20. */
  crownComeback: number;
  /** When the winner took the lead for good, as a share of the game (1 = never settled until the end). */
  settledness: number;
  /** The longest run of whole minutes with no decision from the player and nothing happening to them. */
  longestBoredMinutes: number;
  renownBy: Partial<Record<string, number>>[];
  /** Challenges won by [player, rival]. */
  challenges: number[];
  acclaim: boolean;
  origins: string[];
  omens: string[];
  /** Goods sitting in the player's stores at minutes 10, 20 and 30: is stuff piling up? */
  stockAt: number[];
  /** Territory size (tiles) per minute: the frontier should keep moving. */
  territoryByMinute: number[];
  populationByMinute: number[];
  /** Frontier buildings (towers and outposts) finished by [player, rival]: is spam paying? */
  towers: number[];
  /** The valley this game was played in, and bridges finished by [player, rival]. */
  valley: string;
  bridges: number[];
  /** Share of the game the player's town was hungry (births, newcomers and work all slow while it is). */
  hungryPct: number;
  /** Each side's bot style. */
  styles: string[];
  /** Raids launched and won by [player, rival], raids each side drove off. */
  raids: number[];
  raidsWon: number[];
  repelled: number[];
  /** What the player would have seen on screen (see ui/news.ts): banners and toasts per minute. */
  newsPerMinute: number;
  /** Raids and reaver bands the player was in (attacking or defending): the war they saw. */
  battles: number;
  bannersPerGame: number;
  /** Reaver bands that came for [player, rival], and how many of them burned a post. */
  reavers: number[];
  reaverBurns: number[];
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
  /** Play as an origin with the valley's omens, like a real game (default: classic start, no omens). */
  origin?: OriginId;
  omens?: boolean;
  /** Bot personalities for the player and the rival (see ai/styles.ts). */
  style?: BotStyle;
  rivalStyle?: BotStyle;
  /** Decision kinds the scripted player never takes (see OpeningBot.ablate). */
  ablate?: string[];
}

/** Headless playtest: the scripted bot plays one game and we measure the pacing beats. */
export function playtest(seed: number, minutes: number, opts: PlaytestOptions = {}): PlaytestReport {
  const world = new World({ seed, difficulty: opts.difficulty, origin: opts.origin, omens: opts.omens ? rollOmens(seed) : [], rivalStyle: opts.rivalStyle });
  const bot = new OpeningBot(0, opts.think ?? 100, 0, opts.style);
  world.players[0].style = bot.style;
  for (const a of opts.ablate ?? []) bot.ablate.add(a);
  const towers = [0, 0];
  const raids = [0, 0];
  let battles = 0;
  const newsItems: { tick: number; news: News }[] = [];
  const reavers = [0, 0];
  const reaverBurns = [0, 0];
  const renownByMinute: [number, number][] = [];
  const stockAt: number[] = [];
  let holdingFlips = 0;
  const challenges: number[] = [0, 0];
  let byTime = false;
  let acclaimed = false;
  const timeline: string[] = [];
  const populationByMinute: number[] = [];
  const territoryByMinute: number[] = [];
  let victoryTick = -1;
  let winner = -1;
  const chapters: Record<string, number> = {};
  let firstJourneyman = -1;
  const total = minutes * 60 * TICK_HZ;
  let hungryTicks = 0;
  const bridges = [0, 0];
  const actionByMinute: number[] = [];
  const decisionsByMinute: number[] = [];
  const scoreByMinute: number[] = [];
  let logged = 0;
  const isDecision = (c: { type: string; building?: string }) =>
    ['raid', 'scout', 'bridge', 'deed', 'chooseEvent', 'chooseHouse', 'rally'].includes(c.type) || (c.type === 'place' && ['stockade', 'musterhall', 'watchtower', 'lookout', 'outpost', 'henge', 'meadhall', 'granary'].includes(c.building ?? ''));
  const isAction = (e: SimEvent) =>
    (e.type === 'clashBegan' && (e.owner === 0 || e.defender === 0)) || e.type === 'crownKeeper' || e.type === 'crownQuarter' || e.type === 'sagaBeat' || e.type === 'starfall' || e.type === 'challenge' || e.type === 'challengeWon' || e.type === 'razed' ||
    (e.type === 'raidLaunched' && (e.owner === 0 || e.defender === 0)) || (e.type === 'holdingChanged' && (e.owner === 0 || e.from === 0)) || (e.type === 'scoutSpotted' && (e.owner === 0 || e.seer === 0)) ||
    ((e.type === 'claimed' || e.type === 'rankUp' || e.type === 'valleyEvent' || e.type === 'scoutHome' || e.type === 'deed' || e.type === 'bridgeBuilt') && e.owner === 0);
  for (let i = 0; i < total; i++) {
    if (victoryTick >= 0 && world.tick > victoryTick + 60 * TICK_HZ) break;
    bot.update(world);
    world.step();
    if (world.players[0].hungry) hungryTicks++;
    for (; logged < world.commandLog.length; logged++) {
      const c = world.commandLog[logged].cmd;
      if ('owner' in c && c.owner === 0 && isDecision(c as { type: string; building?: string })) {
        const m = Math.floor(world.commandLog[logged].tick / (60 * TICK_HZ));
        decisionsByMinute[m] = (decisionsByMinute[m] ?? 0) + 1;
      }
    }
    for (const e of world.drainEvents()) {
      const t = fmt(world.tick);
      if (isAction(e)) {
        const m = Math.floor(world.tick / (60 * TICK_HZ));
        actionByMinute[m] = (actionByMinute[m] ?? 0) + 1;
      }
      const n = newsFor(world, e, 0);
      if (n) newsItems.push({ tick: world.tick, news: n });
      if (e.type === 'buildingComplete' && BUILDINGS[e.buildingType].capped) towers[e.owner]++;
      if (e.type === 'bridgeBuilt') {
        bridges[e.owner]++;
        if (e.owner === 0) timeline.push(`${t} 🌉 bridge (${e.len} tiles)`);
      }
      if (e.type === 'raidLaunched' && e.owner >= 0) raids[e.owner]++;
      if (e.type === 'raidLaunched' && (e.owner === 0 || e.defender === 0)) battles++;
      if (e.type === 'raidLaunched' && e.owner < 0) reavers[e.defender]++;
      if (e.type === 'raidResolved' && e.owner < 0 && e.won) reaverBurns[e.defender]++;
      if (e.type === 'raidLaunched') timeline.push(`${t} ⚔ ${e.owner === 0 ? 'you raid' : e.owner === 1 ? 'RIVAL raids' : 'REAVERS march on'} ${e.defender === 0 ? 'your' : 'their'} ${e.buildingType} (${e.strength})`);
      if (e.type === 'raidResolved') timeline.push(`${t}    ${e.won ? '🔥 burned' : '🛡 held'}: ${e.attack} vs ${e.defence}`);
      if ('owner' in e && e.owner !== 0 && !['claimed', 'rankUp', 'deed', 'workBegun'].includes(e.type) && !(e.type === 'holdingChanged' && e.from === 0)) continue;
      if (e.type === 'buildingComplete') timeline.push(`${t} built ${e.buildingType}`);
      else if (e.type === 'familyApproaching') timeline.push(`${t} the ${e.surname} family (${e.size}) arrives`);
      else if (e.type === 'objectiveComplete') timeline.push(`${t} ✓ ${e.label}`);
      else if (e.type === 'discovered' && e.owner === 0) timeline.push(`${t} 👁 spotted ${e.kind}`);
      else if (e.type === 'claimed' && e.owner === 0) timeline.push(`${t} ★ claimed ${e.kind}: ${e.text}`);
      else if (e.type === 'rumour' && e.owner === 0) timeline.push(`${t} 🗣 rumour of ${e.kind} to the ${e.dir}`);
      else if (e.type === 'familySettled') timeline.push(`${t} the ${e.surname} family moves into a hut`);
      else if (e.type === 'houseOffered' && e.owner === 0) timeline.push(`${t} 🃏 house choice (${e.reason})`);
      else if (e.type === 'houseSeated' && e.owner === 0) timeline.push(`${t}    → house chosen: ${e.house}${e.surname ? ` (the ${plural(e.surname)})` : ''}`);
      else if (e.type === 'married' && e.owner === 0) timeline.push(`${t} 💍 a new ${e.surname} household is founded by marriage`);
      else if (e.type === 'season') timeline.push(`${t} ${['🌱 spring', '☀️ summer', '🍂 autumn', '❄️ winter'][e.season]}`);
      else if (e.type === 'rankUp' && e.owner === 0) timeline.push(`${t} 🏰 RANK UP: ${['Camp', 'Hamlet', 'Village', 'Town'][e.rank]} (unlocks ${e.unlocks.join(', ') || 'nothing'})`);
      else if (e.type === 'valleyEvent' && e.owner === 0) timeline.push(`${t} 📜 event: ${e.def}`);
      else if (e.type === 'eventResolved' && e.owner === 0) timeline.push(`${t}    → ${e.choice}: ${e.text}`);
      else if (e.type === 'rivalSighted') timeline.push(`${t} ⚔ rival border sighted`);
      else if (e.type === 'starfall') timeline.push(`${t} ☄ a star falls at ${e.x},${e.y}`);
      else if (e.type === 'crownKeeper') timeline.push(`${t} 👑 Kingstone: ${e.keeper === 0 ? 'YOU keep it' : e.keeper === 1 ? 'the RIVAL keeps it' : e.keeper === -2 ? 'contested' : 'unkept'}`);
      else if (e.type === 'crownQuarter') timeline.push(`${t} 👑 ${e.owner === 0 ? 'your' : 'the rival’s'} Crown ${e.quarter * 25}%`);
      else if (e.type === 'challenge') timeline.push(`${t} 🏁 challenge: ${e.def}`);
      else if (e.type === 'challengeWon') {
        (challenges[e.winner] ??= 0), challenges[e.winner]++;
        timeline.push(`${t} 🏆 ${e.winner === 0 ? 'you win' : 'RIVAL wins'} ${e.def} (+${e.prize})`);
      } else if (e.type === 'challengeExpired') timeline.push(`${t}    ${e.def} expired`);
      else if (e.type === 'holdingChanged') {
        if (e.from >= 0) holdingFlips++;
        timeline.push(`${t} ${e.owner === 0 ? '⚑ took' : '⚐ LOST'} the ${e.kind}${e.from < 0 ? ' (unheld)' : ''}`);
      } else if (e.type === 'renown' && e.owner === 0 && e.amount >= 10) timeline.push(`${t}    +${e.amount} renown (${e.source})`);
      else if (e.type === 'deed' && e.owner === 0) timeline.push(`${t} ✦ deed ${e.deed}: ${e.text}`);
      else if (e.type === 'deed' && e.owner === 1) timeline.push(`${t} ✗ rival deed ${e.deed}`);
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
      } else if (e.type === 'craftUp' && e.owner === 0) {
        if (firstJourneyman < 0) firstJourneyman = world.tick / TICK_HZ;
        timeline.push(`${t} ⬆ ${e.skill} reaches tier ${e.tier}`);
      } else if (e.type === 'unlocked') timeline.push(`${t} 🔓 ${e.buildingType} unlocked`);
      else if (e.type === 'victory') {
        timeline.push(`${t} ★ ${e.scenario} won by ${e.winner === 0 ? 'the player' : 'the RIVAL'}`);
        victoryTick = world.tick;
        winner = e.winner;
        byTime = e.byTime;
        acclaimed = !!e.acclaim;
      }
    }
    if (world.tick % (60 * TICK_HZ) === 0) {
      populationByMinute.push(world.population(0));
      renownByMinute.push([world.players[0].renown, world.players[1]?.renown ?? 0]);
      scoreByMinute.push(world.crown ? Math.round(world.crown.progress[0] - (world.crown.progress[1] ?? 0)) : 0);
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
  let crownLeader = -1;
  let crownLeadChanges = 0;
  let crownComeback = 0;
  scoreByMinute.forEach((d, m) => {
    if (m < 5 || d === 0) return;
    const lead = d > 0 ? 0 : 1;
    if (crownLeader >= 0 && lead !== crownLeader) crownLeadChanges++;
    crownLeader = lead;
    if (winner >= 0 && m >= 20) crownComeback = Math.max(crownComeback, winner === 0 ? -d : d);
  });
  // Settled: the last minute the eventual winner was not in front (they may never have led until the end).
  let settledAt = 0;
  if (winner >= 0) scoreByMinute.forEach((d, m) => { if (m >= 5 && (winner === 0 ? d <= 0 : d >= 0)) settledAt = m + 1; });
  const minutesPlayed = Math.floor(world.tick / (60 * TICK_HZ)) + 1;
  const decisions = Array.from({ length: minutesPlayed }, (_, m) => decisionsByMinute[m] ?? 0);
  const actions = Array.from({ length: minutesPlayed }, (_, m) => actionByMinute[m] ?? 0);
  let longestBored = 0;
  let run = 0;
  for (let m = 0; m < minutesPlayed - 1; m++) {
    run = decisions[m] + actions[m] === 0 ? run + 1 : 0;
    longestBored = Math.max(longestBored, run);
  }
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
    actionByMinute: actions,
    decisionsByMinute: decisions,
    scoreByMinute,
    crownLeadChanges,
    crownComeback,
    settledness: winner >= 0 ? Math.round((100 * settledAt) / Math.max(1, minutesPlayed - 1)) / 100 : 1,
    longestBoredMinutes: longestBored,
    renownBy: world.players.map((p) => ({ ...p.renownBy })),
    origins: world.players.map((p) => p.origin),
    challenges,
    acclaim: acclaimed,
    omens: [...world.omens],
    stockAt,
    territoryByMinute,
    populationByMinute,
    towers,
    valley: world.map.valley,
    bridges,
    hungryPct: Math.round((1000 * hungryTicks) / Math.max(1, world.tick)) / 10,
    styles: world.players.map((p) => p.style),
    raids,
    raidsWon: world.players.map((p) => p.raidsWon),
    repelled: world.players.map((p) => p.repelled),
    reavers,
    reaverBurns,
    battles,
    ...(() => {
      const desk = simulateDesk(newsItems);
      return { newsPerMinute: Math.round(((desk.banners + desk.toasts) * 600 * 10) / Math.max(1, world.tick)) / 10, bannersPerGame: desk.banners };
    })(),
    timeline,
  };
}
