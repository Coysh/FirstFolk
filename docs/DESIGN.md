# FirstFolk: design and technical architecture

FirstFolk is a fast, single-player browser settlement builder. It combines Settlers II-style physical logistics with **families** who learn, specialise, marry and pass skills down the generations, and that replaces a tech tree. One valley, one AI rival, 30–45 minute sessions.

**Top priority: gameplay enjoyment.** Every milestone ends with something playable and a fun check. We build systems only when the game needs them, and we test pacing with headless simulated playtests (the Battle Drones approach).

## Decisions so far
- **Visuals:** low-poly 3D in Three.js, with models built in code. OpenAI images are used for textures, icons, crests and art, generated offline in Node so the key never reaches the client.
- **Setting:** storybook early-medieval: thatch, timber, wagons, Anglo-Saxon/Norse-flavoured pioneers. Warm and toy-like.
- **Challenge:** a territory and resource race against one AI rival, plus **seasons** with winters to stockpile for. No combat in the MVP.
- **Session:** 30–45 minutes covering about 3 generations.
- **Logistics:** Settlers-style road segments with one carrier per segment, plus mitigations for jams. M0 uses free-walking porters first, which keeps the code modular so roads can slot in.
- **Family extinction:** skills fade into the town **lore** at 50%.
- **Family features in the MVP:** skills, inheritance, apprenticeship, **marriage between families** and **trade surnames**. Inherited traits and the family chronicle are deferred.
- **Default scenario:** *The First Valley*, a race against the rival through four chapters that are also the settlement's age-ups (Camp → Hamlet → Village → Town → Renown). *Peaceful* is the same valley with no rival. Victory runs on a modular scenario system (§5).
- **Fun Pass additions (v0.2–v0.7):** the frontier (fog, a growing border, discoveries and rumours), births, Family Boons, marriage that merges lineages, Fishers, seasons, settlement ranks, Valley Events and the rival. See §0 and the build log.
- **The Renown Pass (v0.8+), superseding some of the above:**
  - **Victory is a renown race:** first to 1,500 renown, or the most renown at 45:00 (the v0.8 goal was 1,200).
  - **Borders are living:** influence decides who holds each tile, so land can be lost. This replaces "claimed land is final".
  - **Landmarks are held:** they pay renown every minute and can be taken.
  - **The family system is your arsenal:** Family Deeds are call-down powers.
  - **Lineage:** elders, deaths and legends replace "lore at 50%".
  - **New sinks:** Great Works and Market Day.

  See §0b.

---

## 0. The Fun Pass (v0.2 onwards): what was boring, and the new pillars

A playtest of the M1 build said it plainly: *after 10–15 minutes it gets boring, with too much waiting and not enough to do.* The code and the headless runs showed why:

| Boredom source | Evidence | Fix (pillar) |
|---|---|---|
| **No decisions after the opening.** The loop was place a gatherer, place a hut, wait. The content ran out at the Sawpit and Storehouse (about 7 min). | The bot's timeline after 7 min was only "built hut" and "family arrives". | **Family Boons** (Spore-style picks), **Valley Events** with choices, **settlement tiers** |
| **No world.** A fixed 33×33 build box sat on a 128² map, with nothing to find and no reason to look outward. | DESIGN.md's own known issue: "the build area fills up". | **The Frontier**: fog, a growing border, Lookouts, discoveries and rumours |
| **Growth was pure waiting.** Migrants were the only growth: one empty hut at a time with a 25 s cooldown, and no births. Master took about 120 harvests. | On seed 7 population froze at 39 with permanent hunger, because the box's bushes ran dry. | **Births**, faster migrants, cheaper tiers, and discoveries as growth spurts |
| **No rhythm or tension.** No seasons, rival or events. Hunger was just a toast. | Flat event mix in every run. | **Seasons**, **events**, **the rival race** |
| **Families were invisible.** Inheritance happened silently, and the player never shaped a lineage. | No family decisions in the UI. | **Boons** owned by families and inherited, **marriage** merging lineages |

**What we borrow, and why:**
- Settlers II: the border you grow, which makes the map a visible scoreboard.
- AoE II: scouting the unknown, and age-ups that transform the town.
- Spore: "pick your evolution" choices that make each run's families yours.
- SimCity: milestones that visibly level up the town, and events that keep it alive.

**Fun contract** (enforced by `tests/pacing.test.ts` and reported by `npm run sim`):
- Something to head for on the map within 60 s.
- A major beat (discovery, rumour, unlock, tier-up, chapter, arrival or boon) at least every **90 s**.
- No event drought over 20 s.
- The border is still moving in the last third of the game.
- Idle adults under 15%.

---

## 0b. The Renown Pass (v0.8): from a checklist to a contest

The second playtest verdict: *better, but at about 20 minutes it turns repetitive. Resources pile up, workers go idle, and progress is just population and territory targets.* We revisited the Battle Drones v4 lesson: "make it a LOT more fun" worked because the fun was **measured** over thousands of AI-vs-AI games, and because the changes added *decisions with stakes*: openers, call-down powers, contested objectives and comebacks. The diagnosis, measured with fair AI-vs-AI duels (both bots at the same think rate):

| Why minute 20 got boring | Evidence (v0.7.1 duel, seed 1) | The fix |
|---|---|---|
| **The map froze.** Claimed land was final, so once the two borders met there was nothing left to push. | Territory flat from 18:00 to 40:00 at 6,247 tiles. | **Living borders.** Influence decides each tile, so towers, homes of great families and festivals push and pull the line all game. |
| **The race was a checklist.** Chapters ticked off population and land targets; the bot "won" at about 20 min and nothing changed after. | Victory at 19:35, then 20 minutes of births and marriages. | **A renown race.** Renown comes from many sources, so there are many ways to win, with a 45:00 clock. |
| **Nothing to spend on.** Goods only fed construction and stomachs. | About 900 goods idle in stores at 20:00, 2,000 logs at 30:00. | **Sinks with stakes.** Great Works (unique, raced, a crew of six), Market Day (sell for renown, with a glut that recovers), frontier towers that get dearer, and deed costs. |
| **Idle hands.** Population outgrew the jobs. | 55 of 90 adults idle at 30:00. | **Family businesses** (workplaces take a crew as their trade grows), Great Work crews, and elders who retire. |
| **Families were passive.** Boons were small stat bonuses; marriages scrolled past in the log. | 20 "a new household is founded" lines and no family decisions after 15:00. | **Family Deeds.** Your four greatest houses each lend a call-down power, shaped by their craft and boons. **Lineage:** founders grow old, teach, die and become legends. |

### The systems (all data-driven, all through Commands)
- **Living borders** (`territory.ts`). Every finished building with a `claim` radius radiates influence with a `power` that falls off with distance:

  | Source | Influence |
  |---|---|
  | The hall | Grows with rank: radius +4 and power +30 per rank |
  | Lookout | 8 tiles, power 60 |
  | Watchtower | 12 tiles, power 100 |
  | Outpost | 7 tiles, power 70 |
  | Homes | 4–5 tiles, power 30–40, +15 per Master living there |
  | Great Works | 10–12 tiles, power 120–140 |
  | Festivals | Temporary |
  | Standing Stones | Their holder gets an aura |

  How it plays out:
  - **Who holds a tile:** each tile goes to the strongest influence. A challenger needs a margin of 10 to take a held tile, and land nobody contests stays with its holder.
  - **Footprints are safe:** a building's footprint and entrance can never be lost.
  - **Price of pushing:** each frontier tower costs 25% more than the last.
  - **When it updates:** borders are recomputed every 2 s and whenever a claim building finishes.
- **Landmarks and renown** (`renown.ts`, `DISCOVERIES[].renown`). Grove and oakwood pay +2★/min, outcrops +4 and Standing Stones +5 while you hold them. Taking one from the rival pays +10 once.
  - **Other sources:** discoveries 8, objectives 5, a family's first Master in a craft 10, legends 15, Great Works 100, Market Day lots 2–6, festivals 5, and 1★/min per 800 tiles of land.
  - **Ranks:** Landfall (the tutorial) gives Hamlet, 300 renown gives Village, 750 gives Town, and **1,500 wins** (v0.9; in v0.8 it was 700 and 1,200). At 45:00 the most renowned settlement wins.
- **Family Deeds** (`deeds.ts`). The council is each deed's most prestigious family, the top four by prestige. Prestige counts members, their tiers, deeds done and legends left.

  | Deed | Comes from | Effect |
  |---|---|---|
  | Raise | Masons, Master Builders | Finishes a site, or a quarter of a Great Work |
  | Timber Drive | Carpenters | Woodcraft 3× for 45 s, saplings grow instantly |
  | Harvest Home | Gatherers | Food burst, husbandry 2× |
  | Expedition | Wanderlust, Keen Eyes, Fleet-footed | Plants an Outpost up to 18 tiles past the border; each one makes the next dearer |
  | Festival | Big Hearts, Twins | Influence surge for 60 s at your border |
  | Lessons | Good Teachers, Quick Learners | Every adult who knows the craft gains 60–90 XP |

  Rules:
  - **Strength:** a Master in the family makes its deed stronger.
  - **Cooldowns:** 110–170 s.
  - **Comeback lever:** a settlement 120+ renown behind recharges 30% faster.
  - **Mead Hall perk:** a further 30% faster.

  Breeding families is now how you pick your powers.
- **Great Works** (`works.ts`). The Stone Circle (held landmarks pay 1.5×), the Mead Hall (deeds recharge faster) and the Great Granary (winter loses its bite).
  - **One of each per valley:** the first to finish gets 100 renown and the perk. The other's site is abandoned and half its goods come home.
  - **Size:** 3×3 with a crew of six builders, so they soak up the late game's goods and idle hands.
- **Market Day** (`market.ts`, from Hamlet). Sell 20 of anything for 2–6 renown. Each sale gluts that good by 25%, recovering 1% every 2 s, so it's a trickle and never a tap. Over-production always has a use.
- **Family businesses.** A workplace takes 1 + its tier workers (up to 3), preferring the head worker's kin. Mastering a craft visibly grows the business.
- **Lineage.** At 6 years old settlers become elders: they stop working and teach their family's adults their best craft (4 XP every 10 s). They die between 7.4 and 8.9 years. A Master's death leaves a **legend**: +10% speed in that craft for the whole settlement (up to 3 legends per craft), +15 renown and glory for the family. The founders die around 30 minutes in, a mid-to-late-game drama beat.

### Measured (16 fair AI-vs-AI duels, `npm run sim -- --seed 1 --minutes 46 --games 16 --think 160`)

| Metric | v0.7.1 | v0.8.0 | Target |
|---|---|---|---|
| Game length (median, min–max) | about 20 min, then nothing | 29.9 (22.4–33.9) min | 30–40 |
| Player : rival wins | (no duel mode) | 8 : 8 | fair |
| Lead changes per game | 0 | 2.0 | ≥ 2 |
| Comeback wins (winner was ≥ 100 behind) | 0 | 3 of 16 | 25%+ |
| Landmarks changing hands per game | 0 | 2.2 | ≥ 3 |
| Idle adults | 11% (55% late) | 13% | < 15% |
| Longest gap between major beats | 75 s | 61 s | < 90 s |

Player renown by source (average): landmarks 386, masters 191, Great Works 163, Market Day 159, legends 82, discoveries 72, land 71, goals 50, deeds 11. No single source dominates.

### v0.9: replayability (Battle Drones' openers, mutators and Daily Op)
v0.8 made each game a contest, but every game was the same contest. v0.9 makes each one different:
- **Origins (openers)** (`origins.ts`). Before the clock starts you choose your founding house. It replaces the founders' boon card at 0:00.

  | Origin | What it brings |
  |---|---|
  | Woodfolk | Journeyman Carpenters, the Sawpit, Axe-Sworn, Timber Drive |
  | Hill Clan | Journeyman Masons, the Storehouse, Master Builders, Raise |
  | River Folk | Journeyman Gatherers, the Fisher, Bountiful, Harvest Home |
  | Wayfarers | Wanderlust and Keen Eyes, Expeditions |
  | Kinfolk | Two extra children, Big Hearts, Festivals |

  The rival rolls its own origin from the seed and is announced at the start. Across 120 origin-plays in fair duels every origin won 41–56% of its games, and Wayfarers were lifted after an early 33% showing.
- **Omens (mutators)** (`omens.ts`). Every valley rolls two of eight, shown on New Game and on the race bar:
  - Hard Winters
  - Rich Seams
  - Bountiful Valley
  - Restless Neighbours (the rival thinks 25% faster)
  - The Old Kingdom
  - Wanderers' Road
  - Golden Age
  - Fertile Folk

  Each is a lookup at the one place its rule lives.
- **Discovery pools.** Each ring of the mirrored discovery layout draws from a small pool, and the heart of the valley draws outcrop or spring. Five new finds:
  - **Barrow Mound:** an ancient's legend.
  - **Hermit's Hut:** an elder Master who teaches the largest family.
  - **Buried Hoard:** +20 renown and goods.
  - **Healing Spring:** a landmark whose holder's elders live a year longer.
  - **Forest Shrine:** a landmark that blesses a family with a boon.
- **The Moot (climax).** From 25:00 every landmark pays double, with a banner and a "Moot ×2" chip. Taking a landmark pays 10 plus 1 per 8 renown you trail by (up to +30), doubled at the Moot. Comebacks are a real plan, not luck.
- **The goal rises to 1,500** (Town at 750) so the Moot always comes into play.
- **Daily Valley.** A title-screen entry with today's seed and omens, Normal, against the rival, and you pick an origin. Your best result (won or lost, renown, time) is kept in localStorage.

Measured (60 fair duels with origins and omens: `npm run sim -- --seed 100 --minutes 46 --games 15 --think 160 --real` over four seed blocks):

| Metric | v0.8.0 (16 duels, no omens) | v0.9.0 |
|---|---|---|
| Length (median, range) | 29.9 min (22–34) | ~31 min (22.5–35.9) |
| Lead changes per game | 2.0 | 2.6 |
| Comeback wins | 19% | 20% |
| Landmark flips per game | 2.2 | 4.4 |
| Rival : player | 8 : 8 | 37 : 23, mostly from the Restless Neighbours omen |

### v0.10: surprises and family choices that matter
- **Star-fall** (`happenings.ts`). Between 15:00 and 16:30 a star comes down between the two settlements. It's placed as equidistant from both halls as the ground allows, preferring unclaimed land. It leaves a **Star-Stone**, the valley's richest landmark (+6★/min, with an aura), visible to both sides at once: a mid-game hotspot like Battle Drones' supply drops. In 16 duels it was claimed 9 times by one side and 7 by the other.
- **Betrothal** (Valley Event, from Hamlet). The two most promising matches in your town are put to you by name, with their crafts and deeds, e.g. "Edith Thorne, Master Mason (Raise) & Osric Ashby (Expedition)". Bless one, and the new household inherits the best of both families: crafts, boons and so deeds. The player now *breeds* their council, the Spore lever made explicit. A couple with no free home lives as a homeless household until the next one is built. Events can now carry data chosen at draw time (`setup`) and show dynamic options (`describe`).
- **Council news.** A family rising to the Great Houses is announced along with the deed it brings, so you can see how your families are evolving.

---

## 1. Design guardrails

| Risk | Mitigation |
|---|---|
| Settlers logistics is slow and jam-prone, and drawing roads on mobile is fiddly. | Tap flag A, then flag B, and the road auto-routes. One tap upgrades a road (a second carrier, or a donkey for a Carter). Congested roads glow. Long segments get flags inserted automatically. |
| Generations are too slow to notice. | Compressed lifespans (§2). The starting children come of age within 5 minutes. Apprenticeship shows skills being handed on before anyone dies. |
| Needs turn into chores. | Food and housing are tracked per family, never per person. Settlers are never commanded one by one. |
| AI plus combat doubles the scope. | The rival uses the same `Command` API as the player. Competition is about territory, resources and migrants (§6). |
| Rewrites when the game needs to scale. | A deterministic sim, instanced rendering, and goods routed between storage buildings (a future second town is just another storehouse). |
| Front-loaded waiting. | Pacing beats (§2) are checked by the headless sim runner. |
| Scope creep. | Each milestone adds the *fewest* systems needed for the next fun check. Content lives in data tables, not special-case code. |

---

## 2. Pacing for a 30–45 minute session

**Clock:** 1 season = 75 s and 1 year = 5 min at 1× speed. A game covers 6–9 years. The game starts in early spring.

| Life stage | Age (years) | Real time | Notes |
|---|---|---|---|
| Child (hauls light goods) | 0–1.5 | 0–7.5 min | The starting children are about 1 year old, so they come of age at **~2.5 min** |
| Adult (works, builds, marries) | 1.5–5 | 7.5–25 min | |
| Elder (works at 70%, teaches lore at 2×) | 5–6 | 25–30 min | |
| Dies | ~6–6.5 | ~30–32 min | The founders start at age 2, so they die at **~20–22 min**: a mid-game "passing of the founders" beat |

This gives three generations: the founders, their children (adults from about 2.5–5 min), and grandchildren (born from about 6 min, adults from about 13 min). A fourth generation starts arriving near the end of a long game.

### Beat map (v0.7, measured with the bot; a human runs about 1.5× slower)

| Time | Beat | What the player feels |
|---|---|---|
| 0:00 | **Choose the founders' boon.** The first card is on the table before the first building | "What kind of folk are we?" |
| 0:00–0:45 | The first buildings go down, a beacon glows just past the border, and a rumour names a second | Instant agency and a goal on the map |
| 0:40+ | Births in the wagon, migrants every 12 s once huts are free | Growth you didn't wait for |
| 1:00–2:00 | The first Journeyman: a boon pick and the Sawpit unlocks | Progression you can see |
| 2:00–4:00 | The first Lookout pushes the border and claims the cart. **Rank up: Hamlet.** The first Valley Event | The loop opens outward |
| 3:20–3:45 | "Winter is coming", then **the first winter**: frost, snowfall, hungry spells | Rhythm and tension |
| 4–8 | Ruins (XP for everyone), wanderers, Watchtowers, marriages founding new households, **Village** | Spore-like lineages, SimCity milestones |
| 5–10 | **The rival's border is sighted**. The race bar tightens, and the central prizes are contested | Competition |
| 10–20 | **Town**: Masters, Longhouses, the far discoveries, a claim race for land | Strategy and payoff |
| 17–25 (bot), 25–40 (human) | **Renown**: 4 Masters, 7 discoveries, 90 folk and 3,000 tiles, against the clock of the rival | Climax |

**Pacing rules enforced by `tests/pacing.test.ts` and reported by `npm run sim`:**
- First logs inside 30 s, and something to head for on the map inside 60 s.
- A major beat at least every **90 s** (measured average 58 s, worst 75 s).
- No event drought over 20 s.
- First Journeyman inside 4 min. Hamlet inside 6 min and Village inside 16 min.
- The border is still growing in the final third of the game.
- Idle adults under 15% (measured about 7%).
- A competent scripted player beats Normal in about 56% of games, Relaxed about 81% and Hardy about 31%.

**Not yet built from the original plan:** elders, deaths and lore (the "passing of the founders" beat), trade surnames, and road networks.

---

## 3. Families, skills and visible specialisation

**Families:**
- Each family has a surname, a crest colour (on hats, roof banners and flags), households and a family skill sheet.
- There are 5 skills: **Woodcraft, Stonework, Husbandry, Hauling and Scouting**. Construction speed uses the builder's best of Woodcraft and Stonework.

**XP and inheritance:**
- Working earns XP. Higher skill means faster work and a chance of bonus output.
- Children inherit 40% of the *better* parent family's level in each skill.
- Apprenticing beside a parent in the same trade gives 2× XP.

**Every tier is visible in three places at once:**
- **the building** (its model changes, and an upgrade costs a few goods and plays a short build animation),
- **the worker** (gear, tool and animation),
- **the production chain** (new recipes or buildings).

The tier is driven by the best family member working there. The player doesn't buy the upgrade; it emerges from the family's work.

| Trade (skill) | Novice | Journeyman: unlocks a chain | Master: transforms the town |
|---|---|---|---|
| **Carpenter** (Woodcraft) | Woodcutter's lean-to, hatchet | The lodge gains a saw bench and the worker gets an apron and bow saw. The **Sawpit** (logs → planks) is unlocked, along with plank buildings | A timber-framed workshop with a crane. **Longhouses** (2 families each). 25% chance of 2 planks per log |
| **Mason** (Stonework) | Quarry lean-to, pick | Stone footings on the quarry and a chisel and mallet. The **Storehouse** is unlocked (a second logistics hub) | A dressed-stone yard. **Stone Lookout** (1.5× border radius). Buildings take 30% less stone |
| **Farmer** (Husbandry) | Forager's hut, basket | A barn with a wheat sheaf sign and a scythe. **Fields** (visibly growing wheat) and the **Mill-Bakehouse** (grain → bread) are unlocked | A big barn with a granary. Fields keep yielding into early winter. Bread feeds 2× |
| **Carter** (Hauling) | Carrier on foot | A stable and harness. **Donkeys** on busy roads carry 2× | Carts carry 4×, and roads become cobbled (+40% speed) |
| **Pathfinder** (Scouting) | Scout with a staff | Scout's camp with a horn. Larger reveal, and **ruins** become findable | Waymarker stones: lookouts claim +2 radius. Wandering families are always found |

- **Trade surnames:** when a family produces a Master, it takes the trade name ("the Ashbys are now **the Carpenters**"). Only one family can hold each name.
- **Marriage:** two unmarried adults from different families marry automatically when a spare home exists. Their children inherit from both skill sheets, so housing becomes the strategic lever for growth.
- **Lore:** when a family dies out, its skills enter the town lore at 50%, and anyone learning those skills gains XP faster.
- **Hunger:** a food shortfall stops births, slows work to 70%, and in winter can take elders early.

All trade data lives in `src/sim/trades.ts`: thresholds, model variant ids, gear ids, recipes and multipliers. The renderer only maps variant and gear ids to models, so adding a trade means adding data plus models.

---

## 4. Economy and the frontier (as built, v0.7)

- **Goods:** logs, stone and berries; then planks (Sawpit) and fish (Fisher). Food is any of `FOODS`.
- **Buildings**, in shelf order with hotkeys 1–9, 0 and −:

  | Building | Role | Unlocked by |
  |---|---|---|
  | Woodcutter, Forager, Quarry, Forester | Gathering | Start |
  | Family Hut | A home for one family | Start |
  | Lookout | Claims radius 8 and reveals 14; logs only, so expansion never deadlocks | Start |
  | Fisher | Food from renewable river and lake shoals | Journeyman Gatherer |
  | Sawpit | Logs to planks | Journeyman Carpenter |
  | Storehouse | A second store | Journeyman Mason |
  | Watchtower | Claims 12, reveals 20 | Hamlet |
  | Longhouse | A family grows to 8 | Village |

  The wagon claims 11 and becomes a hall that grows with each settlement rank.
- **Resources:**
  - trees give 2 logs and regrow only through foresters,
  - rocks give 8 stone and run out,
  - bushes regrow but sleep in winter,
  - fish shoals regrow all year.

  Prize sites boost these: an oakwood gives 3 logs per tree and an outcrop 30 stone per rock.
- **Food:** each settler eats 1 per minute (Normal), and 25% more in winter. A food shortfall slows work and halts births and migrants.
- **The frontier** (`territory.ts`):
  - You may build only inside your border, and claimed land is final.
  - Fog lifts around buildings and wherever settlers walk.
  - Each side has 8 mirrored discoveries, plus 2 contested ones in the centre.
  - Rumours reveal the next discovery after 45 s without anything new.
- **Population:**
  - births (40 s per family with 2 adults, room and food),
  - migrants into free homes,
  - wanderers and events,
  - marriage, which founds new households in free homes.

---

## 5. Victory: a modular scenario system

Victory is data, not hard-coded rules, so the sandbox and other objectives come almost for free.

```ts
interface Objective {            // pure function of world state for one player
  id: string; label: string;
  evaluate(world, playerId): { current: number; target: number };
}
interface Scenario {
  id: string; name: string;
  mapParams: MapParams;          // size, rivals, prize sites, start resources
  objectives: Objective[];       // shown in the HUD / race bar
  victory: 'all' | 'any' | 'none';   // 'none' = sandbox
  defeat: DefeatRule[];          // e.g. population 0, rival completes first
  milestones: Objective[];       // non-winning achievements for satisfaction
}
```

- Completed objectives latch, so they stay done once achieved.
- The race bar shows each player's progress through the same objectives.

**Scenarios** (`src/sim/scenario.ts`):
- **The First Valley** (the default, with a rival): four chapters that are the **settlement's age-ups**. Finishing a chapter raises the rank (`rankUp`), which transforms the hall, claims land, unlocks buildings and grants a boon.

  | Chapter | Leads to | Goals |
  |---|---|---|
  | Landfall | Hamlet | the basics, a Lookout, 1 discovery, 12 folk |
  | Hamlet | Village | a Journeyman Carpenter, a Sawpit, 1 winter, a Watchtower, 3 discoveries, 25 folk |
  | Village | Town | a Master, a Longhouse, 2 winters, 5 discoveries, 50 folk |
  | Renown | victory, first to finish | 4 Masters, 7 discoveries, 90 folk, 3,000 tiles of land |

- **The First Valley (peaceful):** the same, with no rival. It's also used by unit tests.
- **Sandbox:** `victory: 'none'`.
- Objective types: `building`, `produced`, `population`, `trade`, `masters`, `winters`, `discoveries`, `land`.
- **Design rule learned in v0.7:** no pure clock gates in the finale. A "survive N winters" goal made both towns idle until spring, and the tie went to whoever was evaluated first.

---

## 6. The AI rival: meaningful competition

The rival plays by the same rules, through the same `Command` API, with the same fog of war. It never cheats on resources or vision.

**What players compete over:**

1. **Land.** Lookouts claim a radius, and claimed land is final, so every claim is a race.
2. **Prize sites.** Mapgen places 4–5 contested sites between the two starts, each a big accelerator:
   - Old-Growth Oakwood (2 logs per tree, and it speeds Woodcraft XP)
   - Rich Outcrop (stone that never runs out)
   - Fish Lake
   - Fertile River Meadow (+50% field yield)
   - Ruins (a lore boost)

   Each start also has *enough* nearby, so winning without them is possible but slower.
3. **Migrants.** Newcomer families come from a shared migrant pool and choose the settlement with the better *appeal* (food surplus, free homes, renown). Population is a win condition, so this is direct competition.
4. **Wanderers and ruins.** Whoever reaches them first gets them.

**As built (v0.6–v0.7):**
- The rival is the playtest bot (`src/sim/ai/openingBot.ts`) running inside `World.step` as player 1, with its own fog and Commands. It is recreated from saves.
- It competes over:
  - land,
  - discoveries, 8 per side mirrored plus the central outcrop and stones,
  - the chapter race.
- You see its red border, its buildings once explored, "rival sighted" and rank-up news, rival claims, and the race bar.
- Difficulty is its think interval only.
- Not built yet: a shared migrant pool with appeal, and personalities.

**Design rules for the rival:**
- **Readable intent.** Alerts like "Rival scouts seen near the Old Oakwood" and visible rival scouts and border flags give the player time to react.
- **Personality and difficulty.** *Expander* (lookouts early, heads for prize sites) and *Builder* (economy first) personalities. Difficulty changes how often it decides and how well it plans, never the rules or its resources.
- **Balancing targets** (headless):
  - Against a passive player, Normal claims 2–3 prize sites by 15 min.
  - A competent scripted player wins 55–70% on Normal.
  - Rival progress stays within ±20% of the player's at 20 min in most games, so the race stays tense.

---

## 7. Technical architecture

**Stack:** TypeScript, Vite and **Three.js**. The UI is **Preact + signals** in a DOM overlay. Vitest for tests and `tsx` for Node tools. It's a static PWA with no backend.

```
src/sim/      pure TS, no DOM/Three: rng, noise, mapgen, defs, world, commands,
              path, logistics, settlers, scenario, hash  (+ trades, seasons, ai later)
src/render/   scene, terrain, nature, buildings, settlers, effects, camera, picking
src/input/    pointer/touch/keyboard → camera + game intents
src/ui/       Preact HUD (resources, build bar, info panel, goals, toasts)
src/game.ts   glue: fixed-timestep loop, mode/selection, sim events → UI/effects
tools/        sim-runner.ts (headless playtests), screenshot.mjs, assets/ (later)
tests/        Vitest: determinism, mapgen, pathing, placement, gameplay loop, pacing
```

**Simulation:**
- A 10 Hz fixed tick, with the renderer interpolating at 60 fps. Speed controls are pause, 1×, 2× and 4×.
- **Deterministic:** seeded sfc32 RNG, integer tiles, integer movement progress, no `Math.random` and no trig. The same seed and commands always give the same state hash, which buys replays, saves, AI-vs-AI runs and reproducible bugs.
- All input goes through `Command` objects, validated by functions shared with the UI (for example, `canPlace` drives the placement ghost).
- The sim emits **events** (tree felled, building done, family arrived, objective met) that the renderer and UI use for effects and toasts without touching sim state.
- **Logistics:** construction sites post requests, producers offer output, and idle porters claim the nearest haul task. This is the same request board that M1's road and carrier network will use.

**Rendering:**
- A flat-shaded heightmap terrain with vertex colours.
- InstancedMesh for trees, rocks, bushes and settler body parts.
- Code-built building models, with variants per trade tier.
- Procedural settler animation: walk, chop, mine, pick, hammer and carry.
- Particle juice, and shadows from a camera-following directional light.
- Picking ray-marches the heightmap instead of raycasting meshes.

**Controls:**
- **Desktop:** drag to pan, wheel to zoom, right-drag or Q/E to rotate, WASD to move, number-key build hotkeys, Space to pause.
- **Touch:** one-finger pan, pinch zoom, two-finger twist to rotate, tap to select, and tap-to-place with a confirm step.

**Asset pipeline (in use since M1):** `tools/assets/generate.ts` in Node reads `OPENAI_API_KEY` from `process.env` only and never logs or bundles it.
- A style-bible prompt prefix, anchor reference images through the edit endpoint, and transparent backgrounds.
- `sharp` post-processing, a contact-sheet review page, and generated PNGs committed to the repo.
- A build check greps `dist/` for `OPENAI`/`sk-`.
- M0 and M1 use emoji and CSS for icons, so asset work never blocks gameplay.

---

## 8. Milestones (each one is playable and ends with a fun check)

1. **M0 First Playable** *(done)*
   - Procedural 3D valley (river, fords, lake, forests, outcrops, berry meadows).
   - Camera controls for desktop and touch, building placement with a validity ghost, and construction fed by porters.
   - Animated settlers (walk, chop, mine, forage, build, carry), a gather → store → build loop (logs, stone, berries), foresters replanting, food use and hunger, and huts drawing in newcomer families with surnames and crest colours.
   - The Landfall scenario's goal list, speed controls, event toasts, and tests including a headless pacing test.
   - *Fun check: are the first 5 minutes satisfying?*
2. **M1 Trades and Presentation** *(done; see the build log)*: skills, XP and trade tiers with visible building, gear and chain transformation (Carpenter: Sawpit and planks; Mason: Storehouse), inheritance on coming of age, skilled newcomers, scenario chapters, title, loading and save system, and a visual and audio overhaul.
3. **Fun Pass** *(done, v0.2–v0.7; see §0 and the build log)*. This delivered most of the original M2 and M3 in a fun-first order:
   - the frontier (fog, borders, Lookouts, Watchtowers, discoveries, rumours),
   - births, marriage, Family Boons,
   - the Fisher,
   - seasons and winter, settlement ranks,
   - Valley Events,
   - the rival race, with a race bar and difficulty measured headless.
4. **Next: Lineage and Loss.**
   - Elders, deaths and lore, so the founders pass on and their skills carry into the lore at 50%.
   - Trade surnames.
   - A family chronicle panel.
   - A shared migrant pool where the more appealing town wins.

   *Fun check: does losing a founder land emotionally, and does it change a decision?*
5. **Then: Roads** (the old M1b). These start as optional fast lanes, adopted only if they stay fun at 100+ settlers without stalls. The worn footpaths already show where roads want to go.
6. **M4 Juice and Ship:**
   - day and night,
   - PWA,
   - a mobile performance pass at 150 settlers,
   - balance sweeps against human playtests,
   - generated crests and boon card art.

After the MVP: multiple towns, trade, inherited traits, the family chronicle with portraits, militia, more rivals, and the Sandbox and Landmarks scenarios.

## 9. Verification
- **Vitest:**
  - determinism (same seed and commands give the same hash),
  - mapgen guarantees (start area, nearby resources, a reachable rival start),
  - pathfinding, placement rules,
  - the gameplay loop (gather → haul → build → newcomers),
  - scenario objectives,
  - a scripted-opening pacing test.
- **`npm run sim`:** headless playtests with a pacing timeline and metrics.
- **`tools/screenshot.mjs`:** headless Chromium screenshots for visual checks.
- **Manual play** on desktop and mobile.

---

## 10. Build log

### M0 First Playable: done (2026-10-27)
**Playable:** a procedural valley, placing buildings with a validity ghost (mouse and touch), construction fed by porters, animated settlers (walk, chop, mine, forage, plant, build, carry), falling trees and particles, Woodcutter, Forager, Quarry, Forester and Hut, food and hunger, children coming of age, newcomer families with surnames and crests, and the Landfall goal list. There are 37 Vitest tests, including determinism, replay and headless pacing.

**Fixes the headless playtests forced (each would have killed the fun):**
1. **Stalled construction.** Two founding adults both became workers, so nobody was left to build. Fixed in two ways: the elder child comes of age at about 2:30, and when no adult is free, construction may *borrow one gatherer* (only one at a time, so food never collapses).
2. **Hauling starvation.** Porters served producers in id order, so logs swamped the carriers while stone never moved. Without stone there were no huts and no growth. Fixed with round-robin dispatch that boosts scarce goods and food when stores run low.
3. **Walled-in entrances.** Buildings could enclose an entrance in a 2-tile pocket, and porters looped on unreachable deliveries (with a 10× CPU cost). Fixed by having `canPlace` flood-fill from the wagon and refuse any placement that leaves an entrance unreachable ("Would cut off a path").

**Current pacing (bot, 8 seeds):**
- First logs at about 18 s.
- Landfall completes in 3–6 min.
- Idle adults are about 1.5%.
- The longest quiet stretch is under 20 s.
- Population is about 25 at 10 min.

Growth is deliberately generous for now. Seasons, winter food pressure and elders (M1/M2) will slow it to the 30–45 minute arc.

**Next (M1 Roads and Trades):**
- Flags, roads and segment carriers replace free porting.
- Skills, XP and the first visible trade tier (Woodcutter → Carpenter: saw bench model, apron and saw gear, Sawpit and planks).
- An info-panel family view.

### M1 Trades and Presentation: done (2026-10-27)

**Presentation**
- **Title screen.** A live, simulated village rendered behind the menu, with a slow cinematic orbit.
  - Includes the generated logo, New Game (difficulty, seed and a dice button), Continue (shows playtime, population and families, plus when it was saved), Settings and How to Play.
  - Works on phones too, with a vertical layout.
- **Loading screen.** It shows a painted illustration and a progress bar driven by the real build steps: world generation or save restore, terrain, sky, forests, buildings, settlers and shader compilation.
- **Save system.** Saves are versioned snapshots of the whole simulation in `localStorage` (about 0.5 MB).
  - Autosave runs every 45 s, when the tab is hidden and on quit. There is also manual save.
  - Tests prove a restored game continues *bit-identically*.
- **Pause menu.** Resume, Save, How to Play, Settings, and Save and quit.
- **Settings.** Master, ambience and effects volume. Graphics quality (High, Balanced or Fast: pixel ratio, shadows and decor density). A hints toggle.
- **Art.** Generated with OpenAI. `gpt-image-1.5` made the transparent icons and logo, with one anchor icon passed as a style reference. `gpt-image-2` made the loading illustration and parchment texture. The pipeline is in `tools/assets/`, and the key is read from the environment only.

**World**
- **Terrain.** More relief (render-only 1.35× vertical scale), soft colour patches, slope earth and shoreline sand.
- **Footpaths** wear into grass where settlers walk and fade when abandoned.
- **Sky.** A gradient sky dome with a sun glow, and drifting clouds.
- **Water** with depth tinting.
- **Trees.** Three species, a per-tree tint and wind sway (a shared shader patch).
- **Ground detail.** Ferns, mushrooms, reeds, pebbles and wildflowers.
- **Wildlife.** Birds, butterflies and grazing deer.
- **Construction** reveals the building upward from the ground with a clipping plane, inside scaffolding, with hammer chips and a completion bounce, dust, sparkles and a chime.

**Feedback**
- **Status bubbles** above buildings: needs a worker, nothing in range, output full or carriers busy, waiting for input, waiting for materials.
- **"+n" floaters** when goods are produced or reach a store.
- **Hover rings** and a pointer cursor.
- **Placement.** A work-radius ring and "N trees in reach".
- **Settlers' jobs read at a glance.** Tools sit on the shoulder while walking to work, cargo is larger, and tier gear shows (a leather apron for Journeymen, a gold badge and feather for Masters).
- **Procedural audio.** Wind and birdsong ambience, plus distance-attenuated chops, picks, hammers, saws and chimes. There are no audio files.

**Gameplay (M1 trades slice)**
- **Skills.** Woodcraft, Stonework and Husbandry, at 10 XP per unit of work.
  - Tiers: Journeyman at 220 XP (about 3 min of work), Master at 1200.
  - A workplace's model upgrades permanently with its best worker's tier.
  - Hiring prefers skilled settlers (25 XP counts as one tile of walking).
- **Unlocks.** A Journeyman Carpenter unlocks the **Sawpit** (logs → planks). A Journeyman Mason unlocks the **Storehouse**, which costs planks.
- **Inheritance.** Children inherit 40% of the family's best XP when they come of age. Newcomer families arrive knowing a little of one craft.
- **Chapters.** The scenario is now *The First Valley*, in three chapters:
  - **Landfall** (3–6 min)
  - **Trades** (6–11 min)
  - **Renown** (Masters, 60 planks, 40 folk: about 24–32 min, a stretch goal)
- **Difficulty** (Relaxed, Normal, Hardy) changes the wagon stock, appetite and the food newcomers require. It never changes the rules.

**Problems playtests found, and the fixes**
1. **The Sawpit ate every log**, so huts were never affordable and growth froze. It now keeps a **6-log reserve** in store and says so in its status.
2. **Carrier deadlock.** With every adult working, no one hauled, every workplace was full and the store was empty. Now a worker whose output is full **carries a load to the store themselves**. Production slows but never freezes.
3. **UI unclickable.** A CSS specificity bug stopped clicks on the title menu. The automated click-through test caught it.
4. **Performance.** Stock piles were one mesh per item, giving 288 draw calls mid-game. Merged piles brought it to **139**. The logo dropped from 1.1 MB to 118 KB as a palette PNG. The title scene now yields while it builds, so the menu stays responsive.

**Known issues and limits**
- Late game (25+ min) has idle adults (about 15–25%). The 16-tile build area fills up and there is nothing new to build. M2 seasons and M3 borders and prize sites address this.
- Triangle count is high at full decor (about 850k). Balanced and Fast quality cut decor to 70% and 35%. This needs a real-phone check.
- Headless screenshots use SwiftShader, so frame rate on real GPUs is unmeasured.
- `localStorage` holds a single save slot.

### v0.2.0 Fun Pass 1+2: kill the waiting, and the Frontier (2026-10-28)
**Kill the waiting:**
- **Births:** a family with 2 adults, room at home and food to spare has a child every 40 s. Children grow visibly from toddler size.
- Migrants arrive every 12 s (was 25 s).
- Building takes 30% less time.
- Felling and quarrying are 20% faster.
- Journeyman needs 160 XP (was 220) and Master 650 (was 1200).
- The wagon houses 6.
- Speed controls are now 1×, 2×, 3× and 5×.

**The Frontier** (`src/sim/territory.ts`):
- The fixed build box is gone. The wagon claims radius 11, and the new **Lookout** (4 logs and 2 stone) claims radius 8 and reveals 14.
- You can build only inside your border.
- **Fog of war:** settlers lift it as they walk, and lookouts lift it far.
- **8 discoveries per side**, placed by mapgen and mirrored for the rival:
  - **Abandoned Cart:** a goods cache.
  - **Old Ruins:** every adult gains 120 XP in your weakest craft, which often triggers tier-ups and unlocks.
  - **Wanderers' Camp:** a family of 4 with two Journeymen joins homeless and takes the next free hut first.
  - **Berry Grove**, **Old-Growth Oakwood** (3 logs per tree) and **Rich Outcrop** (30 stone per rock).
  - **Standing Stones:** a free land claim.
- **Rumours:** when no discovery is in sight, after 40 s a traveller names the nearest one and its direction, and its spot is revealed. This came from playtesting. Seed 11 went 7 minutes without seeing anything, and rumours removed the drought.
- **Presentation:**
  - fog and borders are drawn in the terrain shader from one 128² data texture (`src/render/fow.ts`), and the border glows while placing,
  - unclaimed discoveries have golden beacons visible across the valley, floating pins, and an "Out in the wild" panel (click to fly there),
  - claims get a banner and sparkles.

**Playtest results** (8 seeds, 25 min, bot):

| Metric | Before | After |
|---|---|---|
| Discoveries claimed | n/a | 6–12 |
| Longest major-beat gap | n/a | 56–88 s (avg 72 s) |
| Idle adults | 1–11% | about 1.3% |
| Population at 25 min | about 95 | about 95 |
| Seed 7 stall | stalled at 39 (hungry) | fixed: 110 |
| Sim cost | about 2.5 s per 20 min | 0.2–0.5 s per 25 min |

The sim got faster because placement now scores candidates first and flood-fills only the best ones.

**Still boring, and next:**
- The scenario chapters finish by about 15 min, so there is no climax.
- Every family is still interchangeable.

Next come Family Boons and marriage, then seasons and settlement tiers.

### v0.3.0 Fun Pass 3: Family Boons, marriage and fish (2026-10-28)
**Family Boons** (`src/sim/boons.ts`). This is the Spore-style "pick your evolution" layer.
- There are **16 boons**, all pure data. They are summed into `family.mods` and read where they apply:
  - craft speed and bonus chance per skill,
  - build speed, walking speed, XP and inheritance,
  - birth rate and twins,
  - appetite,
  - sight radius and Lookout claim radius,
  - hunger immunity.
- **When choices appear:**
  - **the founders get one at 0:00**, so the very first decision is "what kind of folk are we?",
  - a family's **first** Journeyman or Master in a craft,
  - wanderers joining.

  Ordinary migrants arrive with one random boon, so every family has a character.
- **The card tray never blocks.** It shows 3 flip-in cards, weighted towards the family's best craft, with a timer. An unanswered offer auto-picks after 60 s. Choices are a `chooseBoon` command, so replays and saves stay deterministic.
- **Families carry a title** built from their boons and craft, such as *the Thornes, Fleet-footed Carpenters*, with boon badges in the settler panel.

**Marriage:**
- Unmarried adults of different families marry when a hut is free and bellies are full.
- The new household takes the more skilled house's surname, the **best skills of both**, and the **union of both families' boons**. Breeding lineages is now a lever.
- Founders and migrant couples start married. Emptied households free their hut.

**Fish:** a second food that never runs dry, and a reason for Husbandry tiers to matter.
- The **Fisher** is unlocked by a Journeyman Gatherer and nets fish from shoals in the river and lakes, working from the bank.
- Food is now generic (`FOODS`), and settlers eat whatever is most plentiful.

**Playtests found more stalls, and the fixes:**
1. **The stone deadlock.** Seed 3 ran out of stone at 14 min. Lookouts cost stone, so the player could never expand to find more: a hard stall a human would hit. Lookouts now cost **logs only**. Trees give 2 logs and rocks give 8 stone.
2. **The rumour block.** A revealed but unreachable discovery (across the river) suppressed rumours forever. Rumours are now a **stagnation timer**: 45 s without spotting or claiming anything brings the next one.
3. **The berry ceiling.** Population hit about 60–70 and stayed permanently hungry once the bushes in reach were exhausted. Fish shoals regrow, which fixed it.
4. **Bot hygiene.** The bot spammed Lookouts whenever any quarry was exhausted, and never built huts. It now treats a resource as "starved" only when stores are low, demolishes dead gatherers, and keeps a free hut. This mattered for measurement, not for the game.

**Playtest results** (8 seeds, 30 min):

| Metric | Value |
|---|---|
| Population | 117–136 |
| Discoveries claimed | 7–16 |
| Boon choices | about 1 a minute early, about 1 every 2–3 minutes late |
| Longest major gap | 63–151 s |

**Still boring:** the late game (20 min+) has long gaps once the map is claimed, because there is no rival, no rhythm and no climax. Seasons, settlement tiers and events are next.

### v0.4.0 Fun Pass 4: seasons and settlement ranks (2026-10-28)
**Seasons** (`src/sim/seasons.ts`): the year runs 5 min, with 75 s seasons.
- **Winter:**
  - berry bushes sleep,
  - folk eat 25% more,
  - building is 30% slower,
  - fish keep swimming.
- Players get a 25 s warning ("Winter is coming"). Spring counts a **winter survived**.
- The land frosts over through the fog shader's `uSnow` uniform, and snow falls around the camera.
- The top bar shows the season, with a red countdown at the end of autumn.

**Settlement ranks**, an AoE-style age-up and a SimCity milestone: **the scenario's chapters are the age-ups**.
- Finishing *Landfall* makes the camp a **Hamlet**, which unlocks the **Watchtower** (planks and stone; claims 12, reveals 20).
- *Hamlet* leads to **Village**, which unlocks the **Longhouse** (a family grows to 8).
- *Village* leads to **Town**. *Renown* is victory.
- Each rank-up:
  - turns the founders' wagon into a **hall** that grows with every rank: a hall, then a stone footing, then a tower and banners,
  - claims more land around it,
  - grants the largest family a boon card,
  - plays a banner and fanfare.

**Scenario rewrite** (*The First Valley*):

| Chapter | Leads to | Goals |
|---|---|---|
| Landfall | Hamlet | the gather basics, a Lookout, a discovery, 12 folk |
| Hamlet | Village | a Journeyman Carpenter, a Sawpit, a winter, a Watchtower, 3 discoveries, 25 folk |
| Village | Town | a Master, a Longhouse, 2 winters, 6 discoveries, 50 folk |
| Renown | victory | 4 Masters, 4 winters, 10 discoveries, 90 folk |

The plank-count chores are gone.

**Tuning from playtests:** the first ranking had winters as the only real gates, so the bot reached Town at 10:00 and won at 15:38. The targets were raised so achievement gates the pace, and the bot now wins at **20–25 min** (8 seeds). A human should take 30–40 min.

| Metric | Value |
|---|---|
| Longest major gap | ≤75 s on every seed |
| Idle adults | about 1% |
| Winter hunger | short hungry spells mid-game: tension without collapse |

**Still boring:** without a rival the valley is all yours, and the bot claims 16 of 16 discoveries. There's no one to race and nothing unexpected happens. Valley events and the rival are next.

### v0.5.0 Fun Pass 5: Valley Events, and paced boons (2026-10-28)
**Valley Events** (`src/sim/events.ts`). Every 80–140 s (the first at 2:30), a messenger's card brings news and a choice. There are **11 events**, all data: a condition, plus options with costs and effects.

| Event | Choice |
|---|---|
| Travelling Trader | buy planks or stone |
| Wolves in the Woods | build a palisade, or risk the larder |
| Bountiful Season | preserve food, or hold a fair for XP |
| Great Storm | clear logs, or replant saplings |
| Lost Child | adopt, or follow their tale to a discovery |
| Midsummer Feast | spend food on XP for all |
| Hard Frost (winter) | burn logs, or lose food |
| Smoke Beyond the Ridge | scout a far discovery |
| Masons from the South (Hamlet+) | buy stonework training |
| A Match from Afar (Hamlet+) | a skilled family joins |
| Pilgrims at the Stones (if claimed) | a family boon, or alms |

- Choices are a `chooseEvent` command, and unaffordable options are greyed out.
- Every event's last option is free, and an ignored card resolves to it after 45 s, so **ignoring is always safe and the game never waits**.

**Paced boons.** Playtests counted **44 boon offers in 30 min**: bursts of 3 after mass XP grants, which is choice fatigue. Now:
- only the front offer is live, and its 60 s timer starts when it's shown,
- the queue holds 3,
- there's a **45 s gap** between choices.

Previously queued offers could also expire unseen; that's fixed too. Plural surnames are fixed ("the Mosses", not "the Mosss").

**Playtest results** (8 seeds, 35 min):

| Metric | Value |
|---|---|
| Longest major gap | 65–75 s on every seed (avg 70 s) |
| Victory | 20–26 min |
| Idle adults | about 5% |

### v0.6.0 Fun Pass 6: the Rival (2026-10-28)
**A rival settlement** starts at the mirrored site across the river.
- It's played by the same bot as the headless tests, **inside the sim, through Commands, with its own fog**. It follows the same rules, gets no resources it didn't earn, and is restored deterministically from saves.
- **The race:**
  - land is first-come and final,
  - discoveries go to whoever's border covers them first,
  - **two rich prizes sit in the middle of the valley**, an outcrop and standing stones, equidistant from both starts,
  - the first to complete every chapter wins.
- **What you see:**
  - a **race bar** (both settlements' goal progress and rank),
  - an alert when your explorers first **sight the rival's border**, and news when the rival ranks up or claims a prize,
  - the rival's border in red once explored,
  - their buildings and folk hidden until your fog lifts over them,
  - a defeat screen if they win.
- **Difficulty is the rival's speed of thought, not its rules.** Normal rethinks every 16 s, Hardy every 8 s and Relaxed every 24 s. Measured against the scripted player over 16 seeds:

  | Difficulty | Player wins |
  |---|---|
  | Hardy | 8/16 (an even match) |
  | Normal | 11/16 (69%, inside the 55–70% target) |
  | Relaxed | 14/16 |

  Thinking *faster* was not monotonic: the bot over-builds. So these numbers come from measurement, not intuition.
- **New Game** offers *Race a rival* (the default) or *Peaceful*, which is the same valley alone.

**The playtest found a bug** that would have been confusing in play. Objective, chapter, unlock, hunger, arrival and tier-up events had no owner, so the **rival's progress would have appeared as your toasts**, and the chapter timings in the report were the rival's. Every per-player event now carries `owner`, and the UI and reports filter on it.

**Balance:** Renown needed 10 discoveries, which was impossible when the 16 split evenly (6 of 8 games had no winner). It now needs 7, plus the 2 contested central prizes.

### v0.7.0 Review pass: no waiting gates, and a smarter bot (2026-10-28)
**What still felt wrong after the rival landed:**
1. **A waiting gate in the finale.** Renown required *4 winters*, a pure clock. Many games ended at exactly 20:00 with both towns idling until spring. Worse, when both completed on the same tick, player 0 won because players are evaluated in order: a hidden bias that inflated the measured win rate. Renown now asks you to **hold 3,000 tiles of land**, a contested and active goal. Winters remain only as early gates (Hamlet 1, Village 2), where they teach the rhythm.
2. **A stalled rival.** On seed 5 the rival never left its starting land. It was short of berries, placed Foragers with nothing to pick, demolished them, and `return`ed before considering a Lookout, for 35 minutes. The bot now thinks in an **ordered list of ideas**, each requiring a real site, and falls through to the next. A food shortage now drives expansion towards berry bushes.

**Results** (8 seeds, 35 min):

| Metric | Before | After |
|---|---|---|
| Idle adults | 17% | **7%** |
| Average longest major gap | 69 s | **58 s** |
| Average population | about 130 | about 148 |

Rival difficulty was re-measured over 16 seeds: Hardy (120) gives the player about 31%, Normal (160) about 56% and Relaxed (240) about 81%.

### v0.8.0 The Renown Pass: living borders, landmarks, Family Deeds, Great Works, lineage (2026-10-28)
- **Why:** the second playtest said minute 20+ was repetitive: stuff piled up, workers idled, and progress was population and land targets. See §0b for the measured diagnosis.
- **Built:**
  - influence borders;
  - landmarks that pay renown and can be taken;
  - the renown race with a 45:00 clock and a winner on the higher score (never on player order);
  - Family Deeds and the council of Great Houses;
  - Outposts;
  - the Great Works race;
  - Market Day;
  - family-business crews;
  - elders, deaths and legends;
  - escalating tower costs.
- **UI:**
  - a renown race bar with rates and the clock;
  - a Great Houses deed bar (Z/X/C/V) with cooldown rings and a targeting bar;
  - the Market popover;
  - landmark pins and banners in the holder's colour;
  - festival rings on the ground;
  - "+N ★" floaters;
  - an after-action report (renown by source, the chronicle, legends).
- **New art:** models for the Outpost, Stone Circle, Mead Hall and Great Granary, and five icons generated with the asset pipeline.
- **Harness:** `npm run sim` takes `--think` for fair duels and reports the length distribution, lead changes, comebacks, landmark flips, stock at 10/20/30 min and renown by source.
- **Bugs and stalls the duels caught:**
  - **Ranks too fast:** every Master paid renown, so Hamlet came at 5 min. Now only a family's first Master in a craft pays.
  - **Expedition spam:** a rival raised 11 outposts. Now the council holds each deed once and outposts get dearer.
  - **The bot's tower spam was useless** (25 Watchtowers that could never take a landmark). It now gives up a target after 3 towers.
  - **The player bot never built a Lookout on seed 3:** with a wider border, the top 400 placement candidates were all edge tiles that failed. Candidates are now pre-filtered.
  - **Placement was 7× slower** because a flood fill ran per candidate. It now uses an exact ring-connectivity fast path with a cached reachability map.
  - **Outposts could be wasted inside your own land.** The tap is now checked, with a reason shown.

### v0.9.0 Replayability: origins, omens, discovery pools, the Moot, the Daily Valley (2026-10-28)
- **Built:**
  - five origins (openers) with a rival origin;
  - eight omens, two per valley;
  - discovery pools with five new finds (barrow, hermit, hoard, spring, shrine) and their models;
  - the Moot at 25:00 (landmarks ×2);
  - a seize bonus that grows with how far behind you are;
  - the goal raised to 1,500;
  - the Daily Valley with today's best result;
  - a New Game screen with an origin picker and an omens preview;
  - omen chips on the race bar;
  - rival-origin and omen toasts at the start;
  - origins in the after-action report.
- **Harness:** `npm run sim -- --real` cycles origins, applies the valley's omens and prints wins per origin.
- **Duels caught:**
  - Wayfarers were weaker (2 of 6). They now also get Keen Eyes.
  - Games ended (about 28 min) before a 30:00 Moot could matter, so the goal is now 1,500 and the Moot starts at 25:00.
- **Tests:** origins, the rival's origin, omen rolls, Rich Seams, the Old Kingdom, the Moot, the barrow, hermit and hoard, and saves keeping origins, omens and labels (95 tests).

### v0.9.1 Less noise, no chores: news priorities, standing trade orders, honours (2026-10-28)
- **Measured the firehose:** about 20 notifications a minute reached the player (bot game, seed 7), and "hungry / fed again" alone fired 86 times in 5 minutes. Hunger flipped on every meal when food hovered at zero.
- **Hunger hysteresis.** Once hungry, folk stay hungry until the stores hold a real buffer (pop/8, at least 4).
- **News priorities.**
  - **Throttled to one every 7 s (game time):** births, comings of age, newcomers, homes, marriages, boon picks, Journeymen, sales, elders, ordinary deaths and ordinary buildings finishing.
  - **Always shown:** landmarks, deeds, rival news, Great Works, legends, ranks, the Moot, and a family's **first Master** in a craft (a new `firstMaster` event with its own fanfare).
  - **Result:** about 6–12 important items a minute plus a capped trickle.
- **Standing trade orders.** Each good on Market Day can carry an order: "sell everything above a reserve, a lot every 20 s". Selling is now a decision you set once, not 40 clicks a game. The glut still keeps it a trickle.
- **Honours on the report:**

  | Honour | Earned by |
  |---|---|
  | The Comeback | Winning after trailing by 150+ |
  | Swift Renown | Winning before 28:00 |
  | Landmark Lord | Taking 3+ landmarks |
  | Wonder Builder | 2+ Great Works |
  | Keeper of Legends | 3+ legends |
  | Merchant Prince | 150+ renown from Market Day |
  | Pathfinder | 4+ outposts |
  | Great Houses | 25+ deeds |

  These give a reason to try another way next game. The furthest each player has trailed is tracked as `maxDeficit`.
- **Duels** (15 with origins and omens, seed block 100): median 31.2 min, 2.6 lead changes, **6 of 15 comeback wins**, 4.7 landmark flips per game, idle 9%.

### v0.10.0 Surprises and matches: star-fall, betrothals, council news (2026-10-28)
- **Built:**
  - Star-fall and the Star-Stone landmark, with its model, effects and banner;
  - the Betrothal event, choosing between two named matches that merge families, boons and deeds;
  - event data and dynamic option text;
  - `wed()` extracted from automatic marriage, allowing homeless newlyweds;
  - a toast when the council changes.
- **Duels caught:**
  - **Nobody claimed the star.** The bot's "stuck" rule gave up on any site with 3 of its towers within 16 tiles, which is every site in the middle once the borders meet. Now the towers must be within 10. Bot Festivals also target unheld landmarks near the border.
  - **Betrothals almost never happened.** They needed a free home, and the bot fills homes at once.
  - **The star landed up to 43 vs 19 tiles from the two halls.** Placement now penalises unequal distance; the worst spread is 31 vs 27.
- **Fairness check:**

  | Duel setup | Player : rival |
  |---|---|
  | Classic starts, no omens | 14 : 16 |
  | Origins only | 15 : 15 |
  | Omens only | 9 : 21 |

  The Restless Neighbours omen (the rival thinks 25% faster in about 1 valley in 4) accounts for the tilt, by design.
- **Per-omen fairness** (12 duels each, seeds 300–311):

  | Omen | Player : rival |
  |---|---|
  | None | 7 : 5 |
  | Restless Neighbours | 3 : 9 (by design) |
  | Rich Seams | 4 : 8 (worth watching) |
  | Each of the other six | 7 : 5 or 6 : 6 |

- **Full batch** (60 duels, origins and omens): lengths 22–37 min with medians of 27–30, 2.1 lead changes, 20% comeback wins, idle adults 7–10%, and about 11 landmark flips per game. The tug-of-war over the Star-Stone and the middle of the valley is now constant.

### v0.10.1 Teaching deeds, and the mobile top bar (2026-10-28)
- The Hamlet chapter now teaches deeds with a "Call on a family deed" goal (`objectives.deeds`).
- Mobile: the top bar wraps to three rows once Market and alerts appear, and the goals panel hid the speed controls. Goals and the race now start below the bar.
- The Betrothal card keeps "Bless this match" on one line.

