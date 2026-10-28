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
  ruinsXp: 400,
  hermitXp: 500,
  /** Craft a wanderer family teaches the town when it joins. */
  wandererSkill: 200,
  /** A challenger needs this much more influence than the holder to take a tile. */
  influenceMargin: 10,
  /** Each frontier tower a player already has makes the next this much (percent) dearer. */
  towerCostPct: 25,
  /** Frontier buildings (towers and outposts) a settlement can hold at each rank: Camp, Hamlet, Village, Town. */
  frontierCap: [4, 6, 9, 12] as number[],
  /** Bridges: the longest span (tiles), the cost per tile, and the laying time per tile. */
  bridgeMax: 5,
  bridgeCost: { logs: 3, stone: 1 },
  bridgeTicks: secs(5),
  /** A post within this many tiles of a bridge holds the crossing: its guards fight this much harder (percent). */
  bridgeWard: [3, 25] as [number, number],
  /** Each tile of open water or mountain between a post and a tile weakens its influence there by this many percent: rivers and ridges are real borders until a ford, a bridge or a pass crosses them. */
  barrierPct: 35,
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
  /** The rival's mood: this far behind it raids anything it can beat; this far ahead it digs in. */
  moodGap: 100,
  /** Raids: how far from the Mustering Hall a warband can strike, spoils (base, cap), the defender's reward, the rest after, and how close a home warband turns out. */
  raidReach: 48,
  /** No raids before this tick: the opening is for building. */
  raidsFrom: secs(10 * 60),
  raidSpoils: [15, 40] as [number, number],
  repelRenown: 12,
  raidCooldown: secs(90),
  /**
   * A clash lasts up to `clashTicks`; the line (0..1000) moves every `clashStep` ticks by the gap in
   * strength (percent) times `clashPush`. A rally adds `rallyBase` + `rallyEach` per townsperson near
   * the post (up to `rallyMax`), then rests `rallyCooldown`; a surge adds `surgePct` to a warband.
   */
  /** Scouts: a runner a settlement sends across the fog, resting `scoutCooldown` between trips. */
  scoutCooldown: secs(40),
  scoutReach: 60,
  scoutSight: 6,
  scoutSpotted: 9,
  scoutLook: secs(3),
  scoutSpeed: 400,
  clashTicks: secs(14),
  clashStep: 5,
  clashPush: 100,
  rallyBase: 4,
  rallyEach: 4,
  rallyMax: 8,
  rallyRadius: 14,
  rallyCooldown: secs(40),
  surgePct: 30,
  interceptRange: 12,
  /** The Shield Wall: radius and extra defence. */
  shieldWall: [9, 40] as [number, number],
  /**
   * Reavers: from 12:00 a band lands every 4–5 minutes and marches on the weakest post of the
   * settlement with the most (at least `reaverMinPosts`). Strength grows over the game.
   */
  reaversFrom: secs(12 * 60),
  reaverGap: [secs(240), secs(300)] as [number, number],
  reaverMinPosts: 4,
  /** Strength at 12:00, and how much more every 5 minutes after. */
  reaverStrength: [20, 10] as [number, number],
  reaverRepel: 15,
  reaverLoot: 12,
  /** A landmark pays only with a manned post (or the hall) this close (see renown.ts). */
  watchRange: 9,
  /** A landmark a manned Stockade watches pays this much more a minute. */
  tendedBonus: 2,
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
    /** The town's craft becoming skilled, and masterly (three crafts: up to 195 a game). */
    skilled: 15,
    master: 50,
    legend: 15,
    festival: 5,
    hoard: 20,
    /** Per minute, per this many tiles of land. */
    landTiles: 800,
  },
  renownTick: secs(10),
  /**
   * The Crown (see crown.ts): once the Kingstone has fallen, the one folk with a manned post beside it
   * fills its Crown, `crownRate` a second (`crownTended` with a stockade standing watch). The Crown
   * is full at `crownNeed`. Rivals' progress drains at `crownDecay` while someone else keeps the stone.
   */
  crownNeed: 1300,
  /** The Crown opens at this tick: from then it fills, a point a second for each voice of the valley you hold beyond the rival's (at most `crownDiffCap`), and one more while a manned Stockade tends the Kingstone you keep. */
  crownOpens: secs(9 * 60),
  crownRate: 1,
  crownTended: 1,
  crownDiffCap: 2,
  /** The Kingstone is worth this many voices to whoever keeps it alone; a steading is worth one. */
  kingstoneVoices: 2,
  /** The Kingstone's light shields whoever keeps it alone: their posts beside it fight this much harder. */
  crownWard: 40,
  /**
   * Steadings (see steadings.ts): the first Want is posted `wantFirst` in, then a new one `wantGap` after the
   * last ends; each lasts `wantTicks`. Winning one is worth `wantWin` favour (the loser's rival loses `wantSnub`),
   * a gift that is not wanted is worth up to `giftFavour`. A steading sides with whoever has `allyFavour` and
   * leads by `allyLead`, and keeps them while they hold `keepFavour` and lead by `keepLead`. Favour fades by one
   * every `favourFade`. A guard Want asks for `guardTicks` of a manned post beside it. Sworn steadings send a gift
   * every `giftEvery`.
   */
  wantFirst: secs(150),
  wantGap: [secs(50), secs(80)] as [number, number],
  wantTicks: secs(170),
  wantWin: 35,
  wantSnub: 8,
  giftFavour: 6,
  allyFavour: 50,
  allyLead: 20,
  keepFavour: 40,
  keepLead: 5,
  favourFade: secs(20),
  guardTicks: secs(80),
  giftEvery: secs(60),
  /** A steading that stands with you pushes your border out: radius and power. */
  steadingReach: [7, 70] as [number, number],
  /** Caravans: a cart's pace (movement progress per tick), the most a settlement runs at once, and the biggest load. */
  caravanSpeed: 130,
  caravanMax: 2,
  caravanLoad: 40,
  /** Star-fall: a new landmark lands between the settlements from this tick (≡ 5 mod 10). */
  starfallAt: secs(14 * 60) + 5,


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
  /** A guard on a post eats this much (percent) more than anyone else: every banner needs a spear, and a spear needs supper. */
  guardAppetitePct: 200,
  winterAppetitePct: 25,
  winterBuildPct: 70,

  /** Valley events: the first arrives after the opening, then one every 80–140 s; unanswered after 100 s they resolve cautiously. */
  firstEvent: secs(150),
  eventGap: [secs(80), secs(140)] as [number, number],
  eventTimeout: secs(100),

  /** Each legend (an ancient's barrow) makes its craft this much (percent) faster, up to `legendCap` legends. */
  legendPct: 10,
  legendCap: 3,

  xpPerHarvest: 10,

  startStock: { logs: 14, stone: 6, berries: 16 } as Record<string, number>,
};
