import { BUILDINGS, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good, type Skill } from './defs';
import { offerBoon } from './boons';
import { claimArea } from './territory';
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
  description: 'Found a camp, explore the valley and raise it to a renowned town.',
  victory: 'all',
  // Each chapter is an age-up: finishing Landfall makes the camp a Hamlet, and so on.
  objectives: [
    with_(objectives.building('woodcutter'), 'Landfall', 'Pick Woodcutter below, then place it beside the trees.'),
    with_(objectives.building('forager'), 'Landfall', 'Foragers feed everyone. Place one near the blue berry bushes.'),
    with_(objectives.building('quarry'), 'Landfall', 'Place a Quarry near the grey rocks. Huts need stone.'),
    with_(objectives.building('hut', 2), 'Landfall', 'Empty huts attract new families when there is food to spare.'),
    with_(objectives.building('lookout'), 'Landfall', 'Build a Lookout near your border to push it outwards.'),
    with_(objectives.discoveries(1), 'Landfall', 'See the golden light? Grow your border over it to claim what lies there.'),
    with_(objectives.population(12), 'Landfall', 'Keep food stocked and huts free, and families will come.'),
    with_(objectives.trade('woodcraft', 1), 'Hamlet', 'Your woodcutter learns with every log. Keep them chopping.'),
    with_(objectives.building('sawpit'), 'Hamlet', 'A Carpenter can run a Sawpit: it turns logs into planks.'),
    with_(objectives.winters(1), 'Hamlet', 'Winter: bushes sleep and folk eat more. Stockpile food; Fishers work all year.'),
    with_(objectives.building('watchtower'), 'Hamlet', 'Watchtowers claim far more land than Lookouts.'),
    with_(objectives.discoveries(3), 'Hamlet', 'Chain towers across the valley. Each discovery is a big boost.'),
    with_(objectives.population(25), 'Hamlet', 'Marriages found new households; free huts let families grow.'),
    with_(objectives.masters(1), 'Village', 'Boons like Quick Learners, and inherited skill, make Masters sooner.'),
    with_(objectives.building('longhouse'), 'Village', 'A Longhouse lets one family grow to eight.'),
    with_(objectives.winters(2), 'Village', 'Another winter: keep the larder full.'),
    with_(objectives.discoveries(6), 'Village', 'The richest prizes lie far out: oakwoods, outcrops, standing stones.'),
    with_(objectives.population(50), 'Village', 'Grow your village to fifty souls.'),
    with_(objectives.masters(4), 'Renown', 'Four Masters make a town famous.'),
    with_(objectives.winters(4), 'Renown', 'Endure four winters.'),
    with_(objectives.discoveries(10), 'Renown', 'Claim the far corners of the valley.'),
    with_(objectives.population(90), 'Renown', 'Ninety folk: a true town.'),
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
  for (const player of world.players) {
    const done = (state.done[player.id] ??= {});
    for (const o of world.scenario.objectives) {
      if (done[o.id]) continue;
      const p = o.evaluate(world, player.id);
      if (p.current >= p.target) {
        done[o.id] = true;
        world.emit({ type: 'objectiveComplete', label: o.label });
        const chapter = o.chapter;
        const rest = world.scenario.objectives.filter((x) => x.chapter === chapter);
        if (chapter && rest.every((x) => done[x.id])) {
          const next = world.scenario.objectives.find((x) => !done[x.id] && x.chapter !== chapter)?.chapter;
          world.emit({ type: 'chapterComplete', chapter, next: next ?? '' });
          const chapters = [...new Set(world.scenario.objectives.map((x) => x.chapter))];
          const rank = chapters.indexOf(chapter) + 1;
          if (rank > player.rank && rank < RANK_NAMES.length) rankUp(world, player.id, rank);
        }
      }
    }
    if (state.winner >= 0 || world.scenario.victory === 'none' || !world.scenario.objectives.length) continue;
    const results = world.scenario.objectives.map((o) => !!done[o.id]);
    const won = world.scenario.victory === 'all' ? results.every(Boolean) : results.some(Boolean);
    if (won) {
      state.winner = player.id;
      world.emit({ type: 'victory', scenario: world.scenario.name });
    }
  }
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
  claimArea(world, owner, wagon.x + 1, wagon.y + 1, (BUILDINGS.wagon.claim ?? 0) + rank * 4);
  // The household with the most folk is honoured with a boon.
  const counts = new Map<number, number>();
  for (const s of world.settlers.values()) if (s.owner === owner) counts.set(s.familyId, (counts.get(s.familyId) ?? 0) + 1);
  let best = 0;
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  const fam = world.families.get(best);
  if (fam) offerBoon(world, fam, `Your camp is now a ${RANK_NAMES[rank]}`);
}

SCENARIOS[LANDFALL.id] = LANDFALL;
SCENARIOS[SANDBOX.id] = SANDBOX;
