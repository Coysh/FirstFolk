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
  treeLogs: 2,
  stumpDecayTicks: secs(40),
  saplingGrowTicks: secs(75),
  plantTicks: secs(3),

  rockStone: 8,
  mineTicks: secs(2.8),

  bushBerries: 4,
  pickTicks: secs(2),
  berryRegrowTicks: secs(18),

  shoalFish: 3,
  fishRegrowTicks: secs(10),

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
  /** A challenger needs this much more influence than the holder to take a tile. */
  influenceMargin: 10,
  /** Each frontier tower a player already has makes the next this much (percent) dearer. */
  towerCostPct: 25,
  /** Frontier buildings (towers and outposts) a settlement can hold at each rank: Camp, Hamlet, Village, Town. */
  frontierCap: [4, 6, 9, 12] as number[],
  /** Tiles of reach an unmanned post loses (all of it when no guard stands there; see territory.ts). */
  unmannedReach: 3,
  /** A post's counted guards fall by one at most this often (ticks, a multiple of 20). */
  garrisonEase: secs(10),
  /** One adult in this many is kept free to carry goods before anyone takes up the watch. */
  porterShare: 4,
  /** A guard's (and a huscarl's) strength in a skirmish. */
  guardStrength: 10,
  /** Close to home (radius) the hall wards its buildings: strength, plus more per rank. */
  hallWard: [12, 20, 10] as [number, number, number],
  /** Raids: how far from the Mustering Hall a warband can strike, spoils (base, cap), the defender's reward, the rest after, and how close a home warband turns out. */
  raidReach: 48,
  /** No raids before this tick: the opening is for building. */
  raidsFrom: secs(10 * 60),
  raidSpoils: [15, 40] as [number, number],
  repelRenown: 12,
  raidCooldown: secs(90),
  interceptRange: 12,
  /** The Shield Wall: radius and extra defence. */
  shieldWall: [9, 40] as [number, number],
  /**
   * Reavers: from 12:00 a band lands every 4–5 minutes and marches on the weakest post of the
   * settlement with the most (at least `reaverMinPosts`). Strength grows over the game.
   */
  reaversFrom: secs(12 * 60),
  reaverGap: [secs(240), secs(300)] as [number, number],
  reaverMinPosts: 6,
  /** Strength at 12:00, and how much more every 5 minutes after. */
  reaverStrength: [20, 10] as [number, number],
  reaverRepel: 15,
  reaverLoot: 12,
  /** A landmark pays only with a manned post (or the hall) this close (see renown.ts). */
  watchRange: 9,
  /** A landmark a manned Stockade watches pays this much more a minute. */
  tendedBonus: 2,
  /** Extra home influence per Master in the household (up to four). */
  masterPull: 15,
  /** Losing at least this many tiles at once is news. */
  landLostNotice: 12,
  /**
   * Renown is the score: the first settlement to the scenario's goal wins. One-off sums, plus
   * landmarks (see DISCOVERIES) and land paying out every `renownTick`.
   */
  renown: {
    discovery: 8,
    /** Taking a landmark from another settlement: 10, plus 1 per 8 renown you trail by (up to +30). */
    seized: 10,
    seizedMax: 30,
    objective: 5,
    /** A family's first Master in a craft. */
    master: 10,
    legend: 15,
    festival: 5,
    hoard: 20,
    /** Per minute, per this many tiles of land. */
    landTiles: 800,
  },
  renownTick: secs(10),
  /** From this tick (the final stretch) the Moot doubles what landmarks pay. */
  mootAt: secs(25 * 60),
  /** Challenges: the first is called at 7:00, then one every 3½–4½ minutes after the last ends. */
  firstChallenge: secs(7 * 60),
  challengeGap: [secs(210), secs(270)] as [number, number],
  /** Acclaim: after the Moot begins, a lead this large ends the race early. */
  acclaimLead: 600,
  /** Star-fall: a new landmark lands between the settlements from this tick (≡ 5 mod 10). */
  starfallAt: secs(15 * 60) + 5,

  /** Market Day: each lot sold gluts that good by this much (percent), easing 1 point every 2 s. */
  glutPerSale: 25,
  /** Standing trade orders sell a lot this often (a multiple of 20 ticks). */
  routeEvery: secs(20),

  /** Family deeds: how many houses sit on the council, and how far an Expedition may reach past the border. */
  councilSize: 4,
  /** A new household's deed is ready this long after it forms. */
  deedFirstWait: secs(30),
  expeditionReach: 18,
  /** A settlement this far behind in renown recharges its deeds this much (percent) faster. */
  underdogGap: 120,
  underdogPct: 30,
  /** ...and its huscarls fight this much (percent) harder. */
  underdogFury: 25,
  /** When nothing new has been seen or claimed for this long, a rumour reveals the nearest discovery. */
  rumourDelay: secs(45),

  /** Winter: warning lead time, extra appetite, construction speed. */
  winterWarning: secs(25),
  winterAppetitePct: 25,
  winterBuildPct: 70,

  /** Valley events: the first arrives after the opening, then one every 80–140 s; unanswered after 100 s they resolve cautiously. */
  firstEvent: secs(150),
  eventGap: [secs(80), secs(140)] as [number, number],
  eventTimeout: secs(100),

  /** Lineage: settlers become elders (stop working, teach the family), then die somewhere past `lifespanYears`. */
  elderYears: 6,
  lifespanYears: 7.4,
  elderTeachEvery: secs(10),
  elderTeachXp: 4,
  /** Each legend (a Master who died) makes their craft this much (percent) faster, up to `legendCap` legends. */
  legendPct: 10,
  legendCap: 3,

  /** Share of the family's best skill XP a child inherits on coming of age. */
  inheritPct: 40,
  xpPerHarvest: 10,

  startStock: { logs: 14, stone: 6, berries: 16 } as Record<string, number>,
};
