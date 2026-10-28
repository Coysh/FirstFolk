/** Tunables. Everything pacing-related lives here so headless playtests can sweep it. */
export const TICK_HZ = 10;
export const TICK_MS = 1000 / TICK_HZ;
export const secs = (s: number) => Math.round(s * TICK_HZ);

export const BALANCE = {
  mapSize: 128,

  /** Movement progress per tick; a straight step costs 1000, a diagonal 1414. */
  adultSpeed: 260,
  childSpeed: 210,
  hungrySpeedPct: 70,

  newcomerCheckInterval: secs(5),
  newcomerCooldown: secs(12),
  /** A family with two adults, room at home and food to spare has a child this often. */
  birthInterval: secs(40),

  treeFellTicks: secs(2.8),
  treeLogs: 1,
  stumpDecayTicks: secs(40),
  saplingGrowTicks: secs(75),
  plantTicks: secs(3),

  rockStone: 6,
  mineTicks: secs(2.8),

  bushBerries: 4,
  pickTicks: secs(2),
  berryRegrowTicks: secs(18),

  /** Work units per tick a builder contributes (hungry builders contribute less). */
  buildRate: 10,
  /** Global construction-time multiplier (percent of each building's buildTicks). */
  buildTimePct: 70,

  /** One year = 4 seasons of 75 s. Ages are tracked in ticks. */
  yearTicks: secs(300),
  comeOfAgeYears: 1.5,

  wanderRadius: 3,
  /** Fog lifts this far around every settler. */
  settlerSight: 3,
  /** Discovery rewards. */
  ruinsXp: 120,
  wandererSkill: 220,
  stonesClaim: 7,
  /** With no discovery in sight, a rumour reveals the nearest one after this long. */
  rumourDelay: secs(40),

  /** Share of the family's best skill XP a child inherits on coming of age. */
  inheritPct: 40,
  xpPerHarvest: 10,

  startStock: { logs: 14, stone: 6, berries: 16 } as Record<string, number>,
};
