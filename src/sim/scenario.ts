import { BUILDINGS, GOOD_INFO, type BuildingType, type Good, type Skill } from './defs';
import { TIER_NAMES, TIER_XP, TRADES } from './trades';
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
  /** Someone reaches `tier` in a trade. Progress shows the most experienced settler's XP. */
  trade(skill: Skill, tier: number): Objective {
    const title = TRADES[skill].titles[tier];
    return {
      id: `trade-${skill}-${tier}`,
      label: `Train a ${TIER_NAMES[tier]} ${title}`,
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
  description: 'Unpack the wagon, found a settlement and raise its first tradesfolk.',
  victory: 'all',
  objectives: [
    with_(objectives.building('woodcutter'), 'Landfall', 'Pick Woodcutter below, then place it beside the trees.'),
    with_(objectives.building('forager'), 'Landfall', 'Foragers feed everyone. Place one near the blue berry bushes.'),
    with_(objectives.produced('logs', 25), 'Landfall', 'Children carry logs back to the wagon. Watch the pile grow!'),
    with_(objectives.building('quarry'), 'Landfall', 'Place a Quarry near the grey rocks. Huts need stone.'),
    with_(objectives.building('hut', 2), 'Landfall', 'Empty huts attract new families when there is food to spare.'),
    with_(objectives.population(12), 'Landfall', 'Keep berries stocked and huts free, and families will come.'),
    with_(objectives.trade('woodcraft', 1), 'Trades', 'Your woodcutter learns with every log. Keep them chopping.'),
    with_(objectives.building('sawpit'), 'Trades', 'A Carpenter can run a Sawpit: it turns logs into planks.'),
    with_(objectives.produced('planks', 12), 'Trades', 'Planks are carried to your stores like any other good.'),
    with_(objectives.trade('stonework', 1), 'Trades', 'Keep your quarry busy to train a Mason.'),
    with_(objectives.building('storehouse'), 'Trades', 'A Storehouse far from the wagon saves your carriers long walks.'),
    with_(objectives.population(24), 'Trades', 'Grow your village to two dozen souls.'),
    with_(objectives.trade('woodcraft', 2), 'Renown', 'Masters are made by years of work, or born into a skilled family.'),
    with_(objectives.trade('stonework', 2), 'Renown', 'A busy quarry trains a Master Mason in time.'),
    with_(objectives.produced('planks', 60), 'Renown', 'Keep the Sawpit fed: more woodcutters, more logs.'),
    with_(objectives.population(40), 'Renown', 'Forty folk: a true village.'),
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

SCENARIOS[LANDFALL.id] = LANDFALL;
SCENARIOS[SANDBOX.id] = SANDBOX;
