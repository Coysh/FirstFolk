import { OpeningBot } from './ai/openingBot';
import { TICK_HZ } from './balance';
import { World } from './world';

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
  /** Territory size (tiles) per minute: the frontier should keep moving. */
  territoryByMinute: number[];
  populationByMinute: number[];
  timeline: string[];
}

const fmt = (tick: number) => {
  const s = Math.floor(tick / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Headless playtest: the scripted bot plays one game and we measure the pacing beats. */
export function playtest(seed: number, minutes: number): PlaytestReport {
  const world = new World({ seed });
  const bot = new OpeningBot();
  const timeline: string[] = [];
  const populationByMinute: number[] = [];
  const territoryByMinute: number[] = [];
  let victoryTick = -1;
  const chapters: Record<string, number> = {};
  let firstJourneyman = -1;
  const total = minutes * 60 * TICK_HZ;
  for (let i = 0; i < total; i++) {
    bot.update(world);
    world.step();
    for (const e of world.drainEvents()) {
      const t = fmt(world.tick);
      if (e.type === 'buildingComplete') timeline.push(`${t} built ${e.buildingType}`);
      else if (e.type === 'familyApproaching') timeline.push(`${t} the ${e.surname} family (${e.size}) arrives`);
      else if (e.type === 'objectiveComplete') timeline.push(`${t} ✓ ${e.label}`);
      else if (e.type === 'cameOfAge') timeline.push(`${t} ${e.name} ${e.surname} comes of age`);
      else if (e.type === 'discovered' && e.owner === 0) timeline.push(`${t} 👁 spotted ${e.kind}`);
      else if (e.type === 'claimed' && e.owner === 0) timeline.push(`${t} ★ claimed ${e.kind}: ${e.text}`);
      else if (e.type === 'rumour' && e.owner === 0) timeline.push(`${t} 🗣 rumour of ${e.kind} to the ${e.dir}`);
      else if (e.type === 'familySettled') timeline.push(`${t} the ${e.surname} family moves into a hut`);
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
        timeline.push(`${t} ★ ${e.scenario} complete`);
        victoryTick = world.tick;
      }
    }
    if (world.tick % (60 * TICK_HZ) === 0) {
      populationByMinute.push(world.population(0));
      let land = 0;
      for (let k = 0; k < world.territory.length; k++) if (world.territory[k] === 0) land++;
      territoryByMinute.push(land);
    }
  }
  const st = world.stats;
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
    territoryByMinute,
    populationByMinute,
    timeline,
  };
}
