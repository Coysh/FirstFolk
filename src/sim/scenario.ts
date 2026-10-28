import { BUILDINGS, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good, type Skill } from './defs';
import { offerBoon } from './boons';
import { recomputeTerritory } from './territory';
import { addRenown } from './renown';
import { BALANCE, secs } from './balance';
import { TIER_XP, tradeTitle } from './trades';
import type { World } from './world';

export interface ObjectiveProgress {
  current: number;
  target: number;
}

/** A pure function of world state for one player. Completed objectives latch. */
export interface Objective {
  id: string;
  label: string;
  /** Objectives are shown one chapter at a time. */
  chapter?: string;
  /** One-line nudge shown for the current objective. */
  hint?: string;
  evaluate(world: World, owner: number): ObjectiveProgress;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  objectives: Objective[];
  /** 'none' = sandbox: objectives are shown as milestones but never end the game. */
  victory: 'all' | 'any' | 'none';
  /** A rival settlement races you from the far side of the valley (first to finish wins). */
  rival?: boolean;
  /** When the clock reaches this tick, the settlement with the most renown wins. */
  timeLimit?: number;
}

export const SCENARIOS: Record<string, Scenario> = {};

export interface ScenarioState {
  /** Per owner: objective id → latched completion. */
  done: Record<string, boolean>[];
  winner: number;
}

export const objectives = {
  building(type: BuildingType, n = 1): Objective {
    const name = BUILDINGS[type].name;
    return {
      id: `build-${type}-${n}`,
      label: n === 1 ? `Build a ${name}` : `Build ${n} ${name}s`,
      evaluate: (w, o) => ({ current: w.countBuildings(o, type), target: n }),
    };
  },
  produced(good: Good, n: number): Objective {
    return {
      id: `produce-${good}-${n}`,
      label: `Gather ${n} ${GOOD_INFO[good].name.toLowerCase()}`,
      evaluate: (w, o) => ({ current: w.players[o].produced[good], target: n }),
    };
  },
  population(n: number): Objective {
    return {
      id: `population-${n}`,
      label: `Grow to ${n} settlers`,
      evaluate: (w, o) => ({ current: w.population(o), target: n }),
    };
  },
  /** Tiles of territory held: the border as a scoreboard. */
  land(n: number): Objective {
    return {
      id: `land-${n}`,
      label: `Hold ${n.toLocaleString('en-GB')} tiles of land`,
      evaluate: (w, o) => {
        let c = 0;
        for (let i = 0; i < w.territory.length; i++) if (w.territory[i] === o) c++;
        return { current: c, target: n };
      },
    };
  },
  winters(n: number): Objective {
    return {
      id: `winters-${n}`,
      label: n === 1 ? 'Survive a winter' : `Survive ${n} winters`,
      evaluate: (w, o) => ({ current: w.players[o].winters, target: n }),
    };
  },
  /** Settlers who are Masters of at least one craft. */
  masters(n: number): Objective {
    return {
      id: `masters-${n}`,
      label: n === 1 ? 'Train a Master of any craft' : `Have ${n} Masters`,
      evaluate: (w, o) => {
        let c = 0;
        for (const s of w.settlers.values()) if (s.owner === o && SKILLS.some((k) => s.skills[k] >= TIER_XP[2])) c++;
        return { current: c, target: n };
      },
    };
  },
  /** The score: renown from landmarks, land, discoveries, Masters, deeds and works. */
  renown(n: number): Objective {
    return {
      id: `renown-${n}`,
      label: `Earn ${n.toLocaleString('en-GB')} renown`,
      evaluate: (w, o) => ({ current: Math.min(n, w.players[o].renown), target: n }),
    };
  },
  /** Landmarks held at the same moment. */
  landmarks(n: number): Objective {
    return {
      id: `landmarks-${n}`,
      label: n === 1 ? 'Hold a landmark' : `Hold ${n} landmarks at once`,
      evaluate: (w, o) => ({ current: w.sites.filter((s) => s.heldBy === o).length, target: n }),
    };
  },
  discoveries(n: number): Objective {
    return {
      id: `claim-${n}`,
      label: n === 1 ? 'Claim a discovery' : `Claim ${n} discoveries`,
      evaluate: (w, o) => ({ current: w.players[o].claimed, target: n }),
    };
  },
  /** Someone reaches `tier` in a trade. Progress shows the most experienced settler's XP. */
  trade(skill: Skill, tier: number): Objective {
    return {
      id: `trade-${skill}-${tier}`,
      label: `Train a ${tradeTitle(skill, tier)}`,
      evaluate: (w, o) => {
        let best = 0;
        for (const s of w.settlers.values()) if (s.owner === o) best = Math.max(best, s.skills[skill]);
        return { current: Math.min(best, TIER_XP[tier]), target: TIER_XP[tier] };
      },
    };
  },
};

const with_ = (o: Objective, chapter: string, hint: string): Objective => ({ ...o, chapter, hint });

export const LANDFALL: Scenario = {
  id: 'landfall',
  name: 'The First Valley',
  description: 'Found a camp, explore the valley and win more renown than your rival.',
  victory: 'all',
  rival: true,
  timeLimit: secs(45 * 60),
  // Landfall teaches the basics; after that each rank is earned with renown, and the first
  // settlement to 1,000 renown (or the one with most when the clock runs out) wins.
  objectives: [
    with_(objectives.building('woodcutter'), 'Landfall', 'Pick Woodcutter below, then place it beside the trees.'),
    with_(objectives.building('forager'), 'Landfall', 'Foragers feed everyone. Place one near the blue berry bushes.'),
    with_(objectives.building('quarry'), 'Landfall', 'Place a Quarry near the grey rocks. Huts need stone.'),
    with_(objectives.building('hut', 2), 'Landfall', 'Empty huts attract new families when there is food to spare.'),
    with_(objectives.building('lookout'), 'Landfall', 'Build a Lookout near your border to push it outwards.'),
    with_(objectives.discoveries(1), 'Landfall', 'See the golden light? Grow your border over it to claim what lies there.'),
    with_(objectives.population(12), 'Landfall', 'Keep food stocked and huts free, and families will come.'),
    with_(objectives.landmarks(1), 'Hamlet', 'Landmarks (grove, oakwood, outcrop, stones) pay renown every minute you hold them.'),
    with_(objectives.building('sawpit'), 'Hamlet', 'A Carpenter can run a Sawpit: planks build Watchtowers.'),
    with_(objectives.renown(300), 'Hamlet', 'Renown: landmarks, land, discoveries, Masters, deeds and Market Day all add to it.'),
    with_(objectives.building('watchtower'), 'Village', 'Watchtowers push hard: build them at the border to take land from your rival.'),
    with_(objectives.renown(700), 'Village', 'Great Works: one of each in the valley. Beat your rival to them.'),
    with_(objectives.renown(1200), 'Town', 'First to 1,200 renown wins. Take landmarks back if your rival has them!'),
  ],
};

export const SANDBOX: Scenario = {
  id: 'sandbox',
  name: 'Sandbox',
  description: 'Build freely.',
  victory: 'none',
  objectives: [],
};

export interface ObjectiveStatus extends ObjectiveProgress {
  id: string;
  label: string;
  chapter: string;
  hint: string;
  done: boolean;
}

export function objectiveStatus(world: World, owner: number): ObjectiveStatus[] {
  const done = world.scenarioState.done[owner] ?? {};
  return world.scenario.objectives.map((o) => {
    const p = o.evaluate(world, owner);
    return { id: o.id, label: o.label, chapter: o.chapter ?? world.scenario.name, hint: o.hint ?? '', ...p, done: !!done[o.id] };
  });
}

export function evaluateScenario(world: World): void {
  const state = world.scenarioState;
  const winners: number[] = [];
  for (const player of world.players) {
    const done = (state.done[player.id] ??= {});
    for (const o of world.scenario.objectives) {
      if (done[o.id]) continue;
      const p = o.evaluate(world, player.id);
      if (p.current >= p.target) {
        done[o.id] = true;
        world.emit({ type: 'objectiveComplete', owner: player.id, label: o.label });
        if (!o.id.startsWith('renown')) addRenown(world, player.id, BALANCE.renown.objective, 'goals');
        const chapter = o.chapter;
        const rest = world.scenario.objectives.filter((x) => x.chapter === chapter);
        if (chapter && rest.every((x) => done[x.id])) {
          const next = world.scenario.objectives.find((x) => !done[x.id] && x.chapter !== chapter)?.chapter;
          world.emit({ type: 'chapterComplete', owner: player.id, chapter, next: next ?? '' });
          const chapters = [...new Set(world.scenario.objectives.map((x) => x.chapter))];
          const rank = chapters.indexOf(chapter) + 1;
          if (rank > player.rank && rank < RANK_NAMES.length) rankUp(world, player.id, rank);
        }
      }
    }
    if (state.winner >= 0 || world.scenario.victory === 'none' || !world.scenario.objectives.length) continue;
    const results = world.scenario.objectives.map((o) => !!done[o.id]);
    if (world.scenario.victory === 'all' ? results.every(Boolean) : results.some(Boolean)) winners.push(player.id);
  }
  if (state.winner >= 0 || world.scenario.victory === 'none') return;
  // The clock runs out: whoever has the most renown wins.
  const timeUp = !!world.scenario.timeLimit && world.tick >= world.scenario.timeLimit;
  if (timeUp && !winners.length) winners.push(...world.players.map((p) => p.id));
  if (!winners.length) return;
  // Same-moment finishes (or time) go to the higher renown, never to whoever is first in the list.
  const best = Math.max(...winners.map((o) => world.players[o].renown));
  const top = winners.filter((o) => world.players[o].renown === best);
  state.winner = top.length === 1 ? top[0] : top[world.rng.int(top.length)];
  world.emit({ type: 'victory', scenario: world.scenario.name, winner: state.winner, byTime: timeUp });
}

/**
 * The settlement levels up: the founders' wagon becomes a hall (model tier), the home
 * claim widens, new buildings unlock and a family is granted a boon.
 */
export function rankUp(world: World, owner: number, rank: number): void {
  const player = world.players[owner];
  player.rank = rank;
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  const unlocks = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => BUILDINGS[t].rank === rank);
  world.emit({ type: 'rankUp', owner, rank, unlocks });
  if (!wagon) return;
  wagon.tier = rank;
  // The hall's influence grows with the rank (see influenceSources).
  recomputeTerritory(world);
  // The household with the most folk is honoured with a boon.
  const counts = new Map<number, number>();
  for (const s of world.settlers.values()) if (s.owner === owner) counts.set(s.familyId, (counts.get(s.familyId) ?? 0) + 1);
  let best = 0;
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  const fam = world.families.get(best);
  if (fam) offerBoon(world, fam, `Your camp is now a ${RANK_NAMES[rank]}`);
}

/** The same valley without a rival: build and explore at your own pace. */
export const PEACEFUL: Scenario = {
  ...LANDFALL,
  id: 'peaceful',
  name: 'The First Valley (peaceful)',
  description: 'Found a camp, explore the valley and raise it to a renowned town, with no rival.',
  rival: false,
};

SCENARIOS[LANDFALL.id] = LANDFALL;
SCENARIOS[PEACEFUL.id] = PEACEFUL;
SCENARIOS[SANDBOX.id] = SANDBOX;
