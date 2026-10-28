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
  newcomerCooldown: secs(25),

  treeFellTicks: secs(3.5),
  treeLogs: 1,
  stumpDecayTicks: secs(40),
  saplingGrowTicks: secs(75),
  plantTicks: secs(3),

  rockStone: 6,
  mineTicks: secs(3.5),

  bushBerries: 4,
  pickTicks: secs(2),
  berryRegrowTicks: secs(18),

  /** Work units per tick a builder contributes (hungry builders contribute less). */
  buildRate: 10,

  /** One year = 4 seasons of 75 s. Ages are tracked in ticks. */
  yearTicks: secs(300),
  comeOfAgeYears: 1.5,

  wanderRadius: 3,
  /** Max Chebyshev distance from the wagon for new buildings (borders arrive in M3). */
  claimRadius: 16,

  /** Share of the family's best skill XP a child inherits on coming of age. */
  inheritPct: 40,
  xpPerHarvest: 10,

  startStock: { logs: 14, stone: 6, berries: 16 } as Record<string, number>,
};
