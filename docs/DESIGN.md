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
- **The Shield Pass (v0.13+), superseding some of the above:** posts need guards, raids and reavers burn them, landmarks pay only while watched, and the Great Houses are three seats you choose (with family boons and the prestige council removed). See §0c.
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
- **Family Deeds** (`deeds.ts`). *(Superseded in v0.16: deeds are now the powers of the Great Houses you choose; see §0c.)* The council is each deed's most prestigious family, the top four by prestige. Prestige counts members, their tiers, deeds done and legends left.

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

### v0.11: sound you'll want on, decisions you take when you like, and a reason to come back
- **The soundtrack** (`audio/music.ts`, `audio/instruments.ts`). Four original pieces in old modes, written note by note and played live by a synthesised band:

  | Piece | Mode and metre | When it plays |
  |---|---|---|
  | *The First Valley* | D Dorian, 3/4 | The main theme: title, victory, and the Moot at 120 bpm with full drums |
  | *Hearthsong* | G Mixolydian, 3/4 | The village at work |
  | *The Long Night* | E Aeolian, 4/4, with bells | Winter |
  | *Banners at the Border* | D Dorian, 4/4, shawm and drum | When the rival presses |

  The band: Karplus–Strong lute and harp (rendered once per pitch), a breathy recorder with delayed vibrato, a hurdy-gurdy drone with a rhythmic buzz, frame drum, bells and a shawm horn, all through a hall reverb and a gentle bus compressor.
  - **The conductor follows the game.** Moods change at four-bar phrase boundaries, so transitions stay musical.
    - **Tension** follows land or a landmark lost in the last 45–60 s, or a rival 120 renown ahead after 15:00.
    - **Intensity** adds layers: drone and harp, then lute arpeggios, then the melody and its octave doubling, then drums.
    - **Rests:** calm pieces leave 8–18 s of drone-only rest between passes, so the music never becomes wallpaper.
  - **Stingers** (fanfares, bells and a falling flute) mark discoveries, landmarks won or lost, rank-ups, star-fall, the Moot, deeds, Great Works, victory and defeat, ducking the music beneath them.
  - **Measured headless:** every mood plays with no errors and peaks below 0.5, integrated loudness about -24 LUFS. A test checks every bar of every piece fits its metre.
- **The soundscape follows season and camera.**
  - Birdsong (rich in spring, sparse in autumn).
  - Crickets in summer, rooks in autumn, and a howling wind with far-off wolves in winter.
  - River babble when the camera is near water, and hearth crackle in a busy village.
  - Pausing or opening a menu muffles the world.
- **Volume:** master, music, ambience and effects sliders, plus **Mute all**, available from the speaker button, the M key and Settings. All are persisted.
- **The ledger: no more decision popups.** Boon choices and Valley Events arrive as sealed letters stacked at the left, with a soft wax-and-bell sound and no interruption.
  - Each letter shows a ring of the time left: 120 s for a boon and 100 s for an event (previously 60 and 45), after which it is settled sensibly for you.
  - Open a letter when convenient, or choose "Later".
  - Only the very first decision of a game opens by itself, to teach where letters live.
  - Interruptions are kept for exceptional moments: banners for claims, rank-ups, star-fall and the Moot, and the end-of-game report.
- **Influence previews.** Placing a Lookout or Watchtower shows its reach as a ring and says what it would win, e.g. "+92 land (31 from your rival) · takes 🕯️ Forest Shrine!".
  - Aiming a Festival or Expedition previews the same way: hover on desktop; on touch, tap to aim and ✓ to confirm.
  - The preview uses the real border solver (`previewInfluence`, extracted as the pure `settle`), so it never lies.
- **Dynasties (meta-progression).** Winning a valley remembers your greatest house: its name, its two finest boons and its craft. In New Game you can found a valley with that dynasty: its founders bear its name and gifts, and start more skilled with each generation it wins (up to +320 XP). It's the family system carried across games, and a reason to play the next one.
- **Council news** now announces only a new deed reaching the council, not families swapping seats.

### v0.12: a rival with a voice, contests to race for, and no dull endings
- **Challenges** (`challenges.ts`): from 7:00, about every 4 minutes, the valley calls a short head-to-head contest with a countdown and a prize (+25 to 40 renown). Seven contests:
  - The Harvest Contest (50 food);
  - The Woodmen's Wager (60 logs and planks);
  - The Builders' Race (4 buildings);
  - Banners on the Hills (a new tower);
  - Steal a March (take a landmark);
  - Race to the Star-Stone (called the moment the star falls);
  - The Great Fair (3 Market lots).

  Ties go to whoever is further over the line, then to the lower renown. No contest is called in the last 4 minutes. They show as a strip under the race bar with both settlements' progress, and they reward what both are doing anyway, so the race always has a short-term goal. In 60 duels the two sides won 112 to 120.
- **The rival speaks.** The head of the rival house sends word when the race turns:
  - a greeting;
  - landmarks taken either way;
  - contests won or lost;
  - Great Works;
  - the star-fall and the Moot;
  - one comment on a big lead either way.

  The lines are short, in character, and shown as italic "rival" toasts. A faceless score becomes a neighbour you want to beat.
- **Acclaim (mercy rule).** Once the Moot is under way, a lead of 500 ends the game by acclaim, so nobody plays out a foregone conclusion. It ends about 12% of duels.
- **Auto-homes.** An optional toggle (from Hamlet): when every home is full, families put up a hut themselves if the stores can spare it, so growth isn't a chore of placing hut after hut.
- **The goal is now 1,600**, since contest prizes add about 100 renown a game.

Measured (60 duels with origins and omens):

| Metric | Value |
|---|---|
| Length | Median about 29 min, range 25–36 |
| Lead changes per game | 1.9 |
| Comeback wins | 20% |
| Acclaim endings | 12% |
| Landmark flips per game | about 12 |

## 0c. The Shield Pass (v0.13+): every banner needs a spear

The third playtest was a full game, won and enjoyed, with three complaints:
1. **Watchtowers dominated.** The best plan was to build as many as possible, so the late game repeated itself.
2. **The Great Houses were confusing.** Their deeds got used without anyone knowing what they did.
3. **Families went unnoticed.** With 170 settlers there was never a reason to look at one.

The measurements behind each:

| Complaint | Evidence | Fix |
|---|---|---|
| Watchtower spam | Towers cost goods only, need no people and can't be attacked. Escalation counted each type separately, so mixing Lookouts and Watchtowers kept both cheap. In the v0.13 strategy matrix the **Expander** style won **63%** of fair duels and beat every other style. | Garrisons, raids, Stockades and reavers (v0.14) |
| Confusing Great Houses | The council was "the top 4 families by prestige, each lending a deed from its boons or best craft". Seats shuffled, effects were only in a hover tooltip (none on touch), and result toasts had no numbers. | Three house seats you choose, with numbers on the cards (v0.15) |
| Invisible families | Boon letters were small stat picks, and prestige was never shown. | Families run themselves; the choices move to the houses (v0.15) |

### The strategy matrix (v0.13)
- **Bot styles** (`ai/styles.ts`) give the bot distinct priorities over the same rules:
  - **Balanced** is the old bot.
  - **Expander** wants a tower for every 5 folk and puts towers ahead of the economy.
  - **Builder** pushes the border only towards a goal, sells more and leans on Great Works.
- **The rival's character follows its origin:** Wayfarers and Kinfolk expand, Hill Clan and Woodfolk build, and the rest play balanced. The style is saved with the rival.
- **`npm run sim -- --matrix --games 8 --minutes 46 --think 160 --origins`** plays every style against every other, from both sides on the same seeds, in parallel. It prints a win matrix, each style's overall win rate, towers per game and renown by source, and raises a **dominance alarm** when a style wins more than 60% or beats every other.

**Baseline** (v0.13.0, 8 seeds × both sides, origins, no omens):

| Row vs column | Balanced | Expander | Builder |
|---|---|---|---|
| Balanced | — | 44% | 56% |
| Expander | 56% | — | 69% |
| Builder | 44% | 31% | — |

- **Overall:** Expander 63% (16.8 towers a game), Balanced 50% (10.4), Builder 38% (9.5).
- **Where Expander wins:** landmarks (876 renown on average) and land.
- **v0.13.1 cheap fixes, measured before building anything new:**
  - **Shared escalation.** Every frontier building, whether Lookout, Watchtower or Outpost, makes the next one 25% dearer. Expeditions cost +2 logs per frontier building. On its own this changed nothing (Expander 63%), because goods pile up anyway.
  - **A frontier cap by rank:** 4 at Camp, 7 at Hamlet, 10 at Village, 13 at Town. The build card shows it as "6/7". With the cap, the styles even out at 53/53/44, and towers per game fall from 15 to 12.
  - **What it doesn't fix:** every style still wins the same way, by holding landmarks (690–830 renown a game). Builder has no counter to play. The cap is a backstop; the real fix has to be counters.
- **v0.14.0 garrisons:**
  - **Guard slots** on Lookouts (1), Watchtowers (2), Outposts (1) and the new Stockade (3).
  - **From Hamlet, an unmanned post pushes at reduced strength**: power × (1 + guards) / (1 + slots), and up to 3 tiles less reach.
  - **Who takes up the watch.** Hands are given out in order: builders and each workplace's first hand, then guards, then extra crew.
    - Guards never take the porters: a quarter of adults stay free to carry.
    - An empty post may call a spare crew hand.
    - When a workplace or site needs someone, the nearest guard steps down to work.
  - **No flicker:** a post counts new guards at once but loses them one per 10 s.
  - **The Stockade** (Hamlet: 10 logs and 6 stone): small reach (6), high power (110), and a defence aura (+20 to your buildings within 7). It counts against the frontier cap, so the cap becomes a choice between wide towers and tall stockades. The bots raise one by each contested landmark they hold.
  - **Measured** (same matrix): Balanced 56%, Expander 53%, Builder 41%. Population at 30:00 is about 12% lower, which is the cost of standing guard. Expander still wins the land race without anything to fear, which is the job of raids.
- **v0.14.1 raids:** the counter to spreading thin.
  - **The Mustering Hall** (Hamlet: 8 planks, 10 logs, 6 stone, one per settlement) trains up to 4 huscarls. They take up the watch before ordinary posts.
  - **Raids from 10:00.** **Raid (R)** sends the huscarls against a rival tower, outpost or stockade that you have seen, up to 48 tiles from the hall.
  - **The warband marches visibly**, about 15–25 s, with a war pin overhead. The defender gets a war-horn, a banner and a live strip showing the countdown and odds: "40 against your 20: it will burn unless help comes".
  - **Plain arithmetic, no dice:**
    - **Attack:** 10 per huscarl.
    - **Defence:** 10 per guard (tracked as `guarded`), +10 for a Watchtower's stone footing, +20 from each Stockade within 7, the hall's ward near home (20 + 10 per rank within 12 tiles), and **10 for each huscarl at home within 12 tiles of the defender's Mustering Hall**. So raiding leaves your own posts without that cover.
    - The stronger side wins; exact ties are a coin flip. The targeting preview shows both numbers and what a burn would free ("frees 140 tiles and the Oakwood").
  - **A win** burns the post (smoke and embers, then smouldering). The raider gets spoils of 15 + half its cost (max 40), halved if it was unmanned. Its land is open to whoever pushes, and a landmark freed this way changes hands *without* also paying the seizing prize.
  - **A loss** sends the band home, and the defender gets +12 renown for holding the line.
  - **The huscarls then rest for 90 s.** Nobody is ever killed.
  - **Manned posts keep watch.** They re-reveal their sight every 5 s, so you can see the posts facing yours.
  - **New challenges:** "Banners on the Hills" rewarded building a tower, so it was replaced by **Burn a Beacon** (win a raid) and **Hold Fast** (raise a Stockade by a landmark you hold). New honours: **Warlord** (burn 3) and **Unbroken** (hold 3).
  - **Bot styles:** **Raider** builds the hall early and strikes any post it can beat. **Warden** guards contested landmarks with stockades and keeps a home warband. **Balanced** raids only for a landmark or a lot of land.
  - **Measured** (8 seeds × both sides, 5 styles):

    | Matchup | Win rate |
    |---|---|
    | Raider vs Expander | 56–69% |
    | Builder vs Raider | 63% |
    | Expander vs Builder | 56% |
    | Expander vs Warden | 63–75% |

    Every style falls between 38% and 59% overall, with about 2 lead changes a game and 23–26% comebacks.
- **v0.15.0 reavers:** neutral pressure on over-extension.
  - **When they come:** from 12:00, every 4–5 minutes, but never in the final 2 minutes.
  - **Who they hit:** a band comes ashore facing the settlement with the most frontier buildings. Nobody with fewer than 6 is ever visited.
  - **What they hit:** they march on its **post furthest from home**, a rule you can plan for: guard or stockade your outermost tower.
  - **Strength:** 20 at 12:00, +10 every 5 minutes; 70% on Relaxed and 120% on Hardy.
  - **Repelled:** +15 renown.
  - **Burned:** the post burns, and 12 of the fullest good goes from the nearest store.
  - **In a peaceful valley** reavers come only with the new **Reaver Coast** omen, which also makes them come twice as often.
  - **Shown through the fog.** You're warned, so the dark-cloaked figures and their pin show even in fog.
  - **The first rule ("the weakest post") was a mistake:** there was always a soft target, so they won every time and guarding never mattered.
  - **Measured:**
    - All five styles fall between 47% and 52%.
    - Expanders are visited most (2.2 a game, against 0.8 for Builders).
    - Settlements sometimes hold the line.
- **v0.16.0 the Great Houses, redesigned:** three seats you choose, with the numbers written on the cards.
  - **Removed:** the prestige council (the top 4 families by prestige, each lending a deed from its boons or craft), family boons and boon letters, Betrothal, Lessons and family prestige.
  - **Three seats:**
    - **Seat 1** is your origin: the five origins *are* the five founding houses. A classic start gets a letter at 0:00 instead.
    - **Seats 2 and 3** come at Hamlet and Village, each as a letter with three houses. One is always a war house, so the military path is always offered.
    - **An unanswered letter** settles itself after 120 s.

    | House | Always | Power (key Z X C) |
    |---|---|---|
    | Axe (Woodfolk) | Woodcraft 40% faster | **Timber Drive**: 3× woodcraft for 60 s |
    | Hammer (Hill Clan) | Build 40% faster, quarry 20% faster | **Raise**: finish the nearest site (a quarter of a Great Work) |
    | Plough (River Folk) | Gathering and fishing 40% faster | **Harvest Home**: 15 + pop/3 food, 2× gathering for 45 s |
    | Horn (Wayfarers) | Towers reach +3, sight +4 | **Expedition**: an Outpost up to 18 tiles out |
    | Hearth (Kinfolk) | Births a third more often | **Festival**: a 60 s influence surge (radius 12), +5 renown |
    | Spear | Huscarls fight at 15, not 10 | **War-Horn**: the hall is ready now, and the next raid is +50% |
    | Shield | Guards +50% defence, Stockades 30% cheaper | **Shield Wall**: +40 defence within 9 tiles for 60 s |

  - **Settlement-wide passives.** They're summed into `player.mods` and read through `playerMod()`.
  - **A real family carries each house.** The largest family without a seat flies the banner, and when that family dies out the banner passes on, but nobody has to look.
  - **The house bar shows everything:**
    - the power;
    - its house;
    - what it does in a few words;
    - a cooldown ring that uses the real wait;
    - a chip for an effect still running.

    Pressing a power that can't be used says why ("Needs a Mustering Hall"), and the result line carries the numbers ("+31 food").
  - **The Forest Shrine and the Pilgrims' blessing** now make every house power ready at once.
  - **Families still have skills, tiers, births, marriages, elders and legends**, all running by themselves. The settler panel says which house banner a family flies.
  - **Dynasties** carry their founding house, and old stored dynasties are mapped from their boons.
  - **The rival's character follows its origin:**

    | Origin | Style |
    |---|---|
    | Wayfarers | Expander |
    | Hill Clan | Builder |
    | Woodfolk | Raider |
    | River Folk | Warden |
    | Kinfolk, or a classic start | Balanced |

    Its house picks follow its style.
- **Landmarks pay only while watched** (v0.16.0). A held landmark earns renown only while a manned post (at least one guard) or your hall stands within 9 tiles. A manned **Stockade** watching it adds +2 a minute (*tended*). Pins show "unwatched: man a post nearby". Holding many landmarks takes many spears, and burning the post that watches one stops the income even if the land stays. This was the fix for houses making Expander dominant again (72%): Horn's reach and a reliable Expedition let it out-hold everyone.
- **Measured** (12 seeds × both sides, origins):
  - All five styles fall between 42% and 59%, and none beats every other.
  - About 2.2 lead changes a game, with 24–27% comebacks.
  - Origins fall between 36% and 64% (Kinfolk strongest, even with one extra child rather than two).
  - Real games (origins and omens, 15 duels): 8 : 7, median 31.3 min, 2.7 lead changes, 20% comebacks, 4.2 landmark flips a game.
- **The goal is now 1,400** (from 1,600), because watched landmarks pay less. Village now needs 250 renown and Town 650.
- **v0.16.1 balance pass on fresh seeds:**
  - **The Plough was the real outlier.** Food is the economy's bottleneck, so "+30% gathering for the whole town" won River Folk 63–78% of their games and made Balanced (which seats the Plough first) dominant. It's now +15%.
  - **Fury of the underdog:** a settlement 120+ renown behind raids a quarter harder.
  - **Acclaim needs a 600 lead,** because walkovers at the Moot had reached 22%.
  - **Final numbers:**

    | Measure | Result |
    |---|---|
    | Matrix, seeds 100+ and 300+ | Every style 38–58% overall; none above 60% in either block |
    | 60 real duels (origins and omens) | **30 : 30** |
    | Median length | 31–34 min |
    | Lead changes | 2.1 a game |
    | Comebacks | 22% |
    | Acclaim endings | 20% |
    | Landmark flips | about 2.6 a game |
    | Longest gap between major beats | 56–60 s |
    | Idle adults | about 2% |

  - **A measurement caveat for next time:**
    - **The samples are smaller than they look.** A 12-seed block is only 12 maps, and every game on a map shares its side advantage. Origin and side tallies move ±20% between blocks.
    - **Origins are tied to sides.** With `--origins`, the player's origin cycles but the rival's comes from the seed, so origin results are confounded with the map.
    - **Judge styles across two seed blocks before tuning,** and treat single-block origin numbers as hints.

- **Raids were rare at first, and the measurements showed why:**
  - **Huscarls waited behind every tower's guards,** so the first raid came at 20:00 or later. They now staff first.
  - **Posts never took workers.** The watch can now borrow an extra crew hand from a busy workplace.
  - **Rival posts were never seen.** Hence manned posts keeping watch.
- **A trap found on the way.** Free adults are the porters. The first version of guards took every free adult, so nothing got hauled and the towns starved (population 125 fell to 42 on seed 1). That's why the porter reserve exists.
- **With omens on (`--real`)** the rival side wins 37 of 48 games; Restless Neighbours tilts it on purpose. Fairness checks therefore use `--origins` without omens.

---

## 0d. The Calm Pass (v0.17+): easy to start, never overwhelming

The fourth playtest made five points:
1. **New Game** was a wall of text.
2. **The Great Houses** explained too much.
3. **Notifications** overlapped and flooded the screen.
4. **The game was won before the advertised renown target**, with no military action.
5. **The player didn't care about individual settlers,** family trees or personal skills at 100+ folk. They want to build, expand, optimise and compete.

The evidence and the fixes:

| Complaint | Evidence | Fix |
|---|---|---|
| Won early | A hidden **Acclaim** rule (a 600 lead after 25:00 wins) ended about 20% of duels, and nothing on screen mentioned it. Victory also required *every* chapter goal, not just the target. | **One rule:** first to the goal, or the most renown at 45:00. Chapters are ranks, never requirements. |
| Notification flood | The old handler showed **9.0 items a minute** (four seeded bot games: births, marriages, tier-ups, sales, every objective, every claim), up to 4 toasts at once, positioned independently of a race bar that grows taller. | `ui/news.ts` decides everything in one pure function, described below. **About 3 a minute (−67%)**, at most 2 on screen, never overlapping. |
| Text-heavy Great Houses | Cards carried three paragraphs. | A two-word bonus, a strategy tag, and the power with four words. The bar shows the power's name, a ring and a key. The details are in tooltips. |
| Uninviting New Game | 5 paragraphs, 3 choice grids and a seed box. | Picture first: five painted origin cards (generated with gpt-image-2), one line about the chosen house, and three chips (difficulty, rival, valley with omen icons) above a big **Begin**. |

**v0.18 the town is the hero.** The player didn't care about individual settlers, family trees or personal skills at 100+ folk, and wanted to build, expand, optimise and compete. Everything personal was cut unless it changed a decision:
- **Crafts belong to the town** (`craftXp`, `player.crafts`).
  - Woodcraft, stonework and husbandry are three shared bars, filled by every harvest, every plank and every stone.
  - Each tier, *skilled* (250) and *masterly* (3,500), upgrades **every** workplace of that craft at once: model, crew size, speed and bonus output. That's a satisfying town-wide moment.
  - It also unlocks the craft's building (Sawpit, Storehouse, Fisher) and pays renown (+15, then +50).
  - The top bar shows the three crafts as icons with stars and a progress ring.
- **Gone:**
  - per-settler skills;
  - family knowledge and inheritance;
  - elders, old age and deaths (folk grow up and stay);
  - legends from deaths;
  - family prestige and pull;
  - surnames in the UI;
  - the settler skill bars and the family panel.
- **The settler panel** is now a name and what they're doing.
- **Kept, because they matter:** households, which are how homes fill and births happen (silent), and the Barrow's ancient legend (+10% to your best craft).
- **Discoveries and events now teach the town:**
  - Ruins: +400 to your weakest craft.
  - Hermit: +500.
  - Wanderers: +200.
  - The feast and the masons: craft XP.
  - The Healing Spring is a plain landmark.
- **Measured** (60 real duels): median 31–32 min, 2.4 lead changes, **30% comebacks**, 3.7 landmark flips a game (up from 2.6), no games ending on the clock, idle 5–8%, longest beat gap about 72 s. Craft tiers land at 1:44, 1:50 and 3:28 (skilled), and from 9:30 (masterly).

**v0.19 a rival with teeth.** The playtest saw no military action. Only a Woodfolk rival (the Raider style) ever raided, and reavers ignored anyone with fewer than 6 posts.
- **The rival has a mood** (`OpeningBot.mood`), and so does the player bot:
  - **100+ renown behind:** it raids any post it can beat.
  - **100+ ahead:** it digs in, with Stockades by its landmarks and raids only for landmarks.
  - **Every rival keeps a Mustering Hall,** so war is always possible.
  - **It says when its mood turns** ("Sharpen the spears. Our neighbours have grown proud."), so a sudden raid has a reason you saw coming.
- **Reavers visit anyone with 4+ posts.** They go for the settlement spread widest and talked of most (posts, plus the renown lead).
- **Every style guards its contested landmarks** and seats a war house. Once everyone could raid, styles without the Shield's answer fell to 34–35% and Balanced rose to 71%. After the change all styles sit at 43–55%.
- **Measured** (60 real duels):
  - player 33 : rival 27;
  - median about 31 min;
  - 2.3 lead changes a game, 27% comebacks;
  - **about 6.8 battles a game for the player** (raids either way, and reavers), with 4 of 60 games having none (5%).

**How `ui/news.ts` sorts the news:**
- **Banners:** rank-ups, a raid on you, the star-fall, the Moot, your Great Work, and the opening goal. They show one at a time.
- **Short toasts:** landmarks won or lost, raids, contests, house seats, hunger, new buildings.
- **Nothing on screen:** routine life (births, marriages, sales, finished huts, objectives). The goals panel and the world show these.
- **Priority:** quiet news is dropped when the screen is busy, and same-key news merges.
- **The rival speaks** at most once every 2 minutes.
- **The desk simulation** (`simulateDesk`) lets the harness report what a player sees per minute.

---

## 0e. The Storybook Art Pass (v0.20+): models made in Blender

Every model used to be built in code from boxes, cones and cylinders. They were coherent but plain: huts were one yellow cone each, workshops were boxes with a flat lid, and settlers were thin pegs whose job and family were hard to read. The art pass moves the models into **Blender (via the Blender MCP)**, in the same storybook early-medieval style, and keeps everything that makes the renderer cheap.

### What changed on screen
| Thing | Before | Now |
|---|---|---|
| **Family hut** | A cone on a drum | A wattle round-house under a **beehive of layered thatch** (rings that flare over each other, a drooping fringe, a chimney pot that smokes when a family lives there), shuttered windows, a log pile, a bean-and-cabbage bed, a water butt, and a **crest pennant that flutters** |
| **Settler** | Peg figure, cone hat | Chunky **gnome-like folk**: flared tunic, belt, big head with a nose and eyes, hair, and a **pointed hood in the family colour** whose tip trails behind. They nod with each axe blow, bob and sway when walking |
| **Woodcutter** (3 tiers) | A box with a lid | A half-timbered cottage with a kingpost gable, a wood-shed and chopping block (tier 0), saw bench, planks and a hanging sign (tier 1), a master's crane and gilded gable tips (tier 2). A busy workshop smokes |
| **Quarry** (3 tiers) | A pit with a tilted lid | Tall boulders stepping into terraces, a timber lean-to with a lantern, a wheelbarrow, a mason's bench (tier 1), a crane with a block on the hook (tier 2) |
| **Wagon and hall** | A canvas box; then a plain hall | A covered wagon with **spoked wheels, hooped canvas, tongue, cargo and a cooking-pot campfire**; then a half-timbered hall with a banner at each front corner per rank and a stone keep at Town |
| **Forager, storehouse, lookout** | Boxes | A cottage with berry baskets and a drying rack; a barn with an X-braced door and a hay hoist; a lashed-timber watchtower with a woven platform rail, a hung lantern and a swallow-tail banner |

### How it works
- **Pipeline** (`tools/blender/`): `storybook.py` is the shared kit, `buildings.py` and `settler.py` are the models, and `build.py` builds, exports and previews.
  - Models are written as **Python geometry in game space** and become one Blender mesh each, so a build is reproducible and diffable.
  - Run it through the Blender MCP with `exec(open('tools/blender/build.py').read())`, or headless with `Blender -b -P tools/blender/build.py`.
  - It works in its own `FirstFolkArt` scene and never touches yours.
- **Palette:** colours are parsed straight from `src/render/palette.ts`, so the Blender and code art share one palette.
- **Output** (`public/models/`): `buildings.glb` (about 200 KB for fifteen buildings) and `settler.glb` (11 KB).
  - Flat vertex colours, no textures, no normals, **meshopt-compressed**.
  - The raw export was 660 KB; compression and dropping normals (the material is flat-shaded) cut it to a third.
- **Runtime** (`src/render/art.ts`): the loader bakes each GLB node into the same non-indexed geometry the code builders make, with the shared material, the construction reveal and `InstancedMesh` settlers unchanged.
  - **Crest markers:** faces painted `#ff00ff` take the family crest colour. A hut with no family flies a cream pennant.
  - **Sway:** a `_SWAY` vertex weight drives pennant flutter (`withSway` in `wind.ts`), so only cloth moves.
  - **Anchors:** empties named `model@smoke` place chimney smoke. Homes with a family and workshops with a worker smoke.
  - **Settler tint:** the Blender settler is painted white, and the game multiplies in tunic, skin, hair and crest. Anything darker than white (belt, boots, eyes) is a shade of that tint, so it is correct for every family and skin.
- **Fallback and A/B:** a model missing from the GLBs falls back to its code model, so replacement is one model at a time. **`?art=classic`** turns the Blender art off for an exact in-game comparison. Tiers above the highest modelled reuse the best one.

### Budgets (enforced by `tests/art.test.ts`)
- **Triangles:** at most 2,000 per building in v0.20 (raised to 2,600 in v0.21 for the Great Works, see §0f) and 420 per settler (it is 388).
- **File size:** `buildings.glb` under 400 KB and `settler.glb` under 40 KB.
- **Shape:** everything stays on its 2×2 footprint with the door on +z and its base on y = 0, and the settler parts keep the joint heights the procedural animation uses.
- **Draw calls:** **+1** for the whole game (the settlers' hair), and none per building.

### Measured: late game, seed 3, 25:00, 197 settlers and 98 buildings (headless, software GL)
| | Draw calls | Triangles | Frame time |
|---|---|---|---|
| Classic (`?art=classic`) | 240 | 857k | 296 ms |
| Blender art | 242 | 958k | 299 ms |

The extra 100k triangles are about 12%, almost all of it settlers (388 against about 170 each). Frame time on software GL is within 1%.

### Style rules for the next models
- **Silhouette first.** A model must read at the strategy camera (pitch 0.86, distance 20) before it is charming up close.
- **Layered, chunky, warm.** Layered thatch, thick roofs with drooping fringes, half-timber, stone footings made of individual stones.
- **Every home and workplace has a lit window,** and anything with a family has a crest pennant.
- **Keep the front-left corner (-0.7, 0.75) clear.** Stock piles sit there.
- **Door on +z,** and nothing outside ±1.3.

### Next, in priority order
Everything in the build menu, every Great Work and every wild discovery is now Blender art (§0f). What is left:
1. **Settler variants:** reavers and guards with their own silhouettes (today they reuse the villager with a shield and a spear).
2. **Trees, rocks and bushes** are cheap instanced code models and can stay; a second tree species would add variety.
3. **A burned-post model** (today a razed post is just flame and smoke).

---

## 0f. The Alive Pass (v0.21+): the rest of the art, a day and night, and a famine bug

The brief: bring every remaining building, landmark and Great Work up to the same storybook style, judge it at gameplay zoom, make the settlement feel alive, and keep looking for what makes the game more fun, not just prettier.

### Art: everything is Blender now
- **Eleven more buildings:** sawpit, forester, fisher, watchtower, stockade, Mustering Hall, longhouse, outpost, and the three Great Works (Stone Circle, Mead Hall, Great Granary). That makes **every building in the menu**.
- **Thirteen wild props** (`landmarks.glb`): cart, ruins, wanderers' camp, standing stones, star-stone, barrow, hermit's hut, hoard, spring, shrine, berry grove, oakwood and outcrop.
- **Silhouettes first:** a stone-and-timber watchtower with a jettied top and a big banner; a palisade ring with a gate and braziers; a long hall with dragon-head gables and crossed horns; a lintelled stone circle round a lit altar; a Mead Hall with a carved porch and a feasting yard; a granary on staddle stones with a windmill.
- **Roofs got texture.** Big hall roofs read as a single plane from the strategy camera, so every gabled thatch now has courses (darker bands) along each slope.
- **Judged in the real renderer:** `node tools/showcase.mjs --set town|war|works|wild [--night 1]` places every model on dry land at gameplay zoom. Blender previews alone missed problems (for example the first night was nearly black).

### Alive
| What | How |
|---|---|
| **Day and night** | A 4-minute day with a warm dusk, a moonlit blue night and a dawn (`scene.ts`, `updateDayNight`). Sun, hemisphere light, sky and fog ease together. Night keeps about 75% of the hemisphere light, so nothing is ever hard to read. Settings has a switch. The title screen idles at dusk |
| **Lights** | A vertex weight marks glowing parts (windows, lanterns, flames). They are a little self-lit by day and blaze at night; flame tips flicker. **Warm pools of light** (one instanced draw call) spread on the ground around every lived-in building (a family at home, a worker at the bench, a manned post, the wagon) |
| **Windmill** | The Great Granary's sails are a separate part (`granary#spinz`) turning in the breeze. This is a general mechanism: any model can have animated parts |
| **Cheering** | Rank-ups, claimed landmarks and victory make your folk hop with their arms up, the hood tips flying |
| **War banners** | The first figure of every marching warband carries a banner (gold for you, red for the rival, black for reavers), so a march reads from the strategy camera |
| **Hut lanterns, lit windows, door lamps** | Every cottage has a hanging lantern by its door |

### Gameplay: a famine nobody could see
A headless playtest showed a flat curve: population stuck at 58 from minute 12 to minute 22 on one seed, with "! hungry" the whole time and six foragers built to no effect. Digging in, **the stall was a real rule bug**, not the bot:
- **Food in a gatherer's basket didn't count as food.** `food()` and `eat()` looked only at storehouses. When every adult had a job (a dozen were on garrison duty) no one was free to carry, so 100+ berries and fish sat at the huts while the town starved. Hunger then blocked births and newcomers, and slowed the very foragers who could fix it.
- **The fix:**
  - `world.larder()` counts food waiting at gatherers, and `eat()` draws from the fullest pile, whether a store or a basket (which also frees a producer stuck at its output cap).
  - Births, newcomers and hunger recovery use the larder.
  - **Gatherers eat on the job:** hunger no longer slows food gatherers' work or walking, so a famine can't cripple its own cure.
  - The HUD food counters show what the town can eat, with a tooltip splitting stores from baskets, and a new amber **"Food low"** chip appears about 90 seconds before hunger.
- **A new metric:** `hungryPct`, the share of the game the player was hungry, is in the sim report. **Before: 25.8% on average (worst 58%). After: about 14–20% (worst 35–52%)**, with the same population.
- **Why a second change was needed.** The famine had been accidentally braking tower spam: with food fixed, one style (Expander) rose to 66–69% in the strategy matrix on fresh seed blocks. So there is now a deliberate brake that fits the fiction: **a spear needs supper. Guards on a post eat triple** (`BALANCE.guardAppetitePct`, `world.eaters()`). A town of towers needs a bigger larder, and the How to Play says so.
- **Measured** (strategy matrix, 12 seeds × both sides, origins, three seed blocks, 5 styles):

  | | Balanced | Expander | Builder | Raider | Warden |
  |---|---|---|---|---|---|
  | Old code (avg of 3 blocks) | 61% | 51% | 37% | 50% | 51% |
  | **v0.21 (avg of 3 blocks)** | **53%** | **54%** | **36%** | **55%** | **51%** |

  Median length 33–34 min, 2.2–2.5 lead changes a game, about 28% comebacks. The old code's Balanced was at 60% and 67% on two blocks; one block now has Raider at 64%, but it is 50–51% on the others.
- **Tried and rejected:** a bot that sizes its food by mouths and a heavier guard tax (4×). Both reset Expander to 60–72%, because a bot that feeds its garrisons well keeps its expansion edge. The simpler tax plus a plain bot gives the best spread.
- **Open:** the Builder style (never raids, claims fewer landmarks) sits at about 36% in every configuration, old and new. It is the weakest persona and the one nearest to how this game's player likes to play, so it is the first thing to look at next.

### Performance
Late game (about 175 settlers, 91 buildings, headless software GL): 228 draw calls, 984k triangles, 292 ms a frame. The v0.20 run on a similar late game was 242 calls and 958k triangles. Night pools, banners and the windmill add three instanced draw calls and a mesh per granary.

### Budgets (tests/art.test.ts)
Buildings at most 2,600 triangles, wild props at most 1,200, the settler at most 420; `buildings.glb` under 500 KB (it is 371 KB), `landmarks.glb` under 150 KB (72 KB), `settler.glb` under 40 KB (11 KB). Great Works stay inside 3×3, the granary's sails turn about their own axle, and cloth and light weights stay small.

---

## 0g. The Many Valleys Pass (v0.22+): geography that changes the game, and economies that can win

The brief: every game should feel different; an economic path should compete with expansion and war; towns should become *something* through how they are built; and someone who finishes should want another round. The evidence came first, then the fixes.

### What the playtests said
- **Every valley was the same valley.** One north-south river, two fords at fixed heights, two fixed lakes, the same starts. Only the noise changed.
- **Territory ignored the land.** Influence spread radially, so a tower on one bank claimed the other bank as if the water weren't there. Rivers could never be a border, so crossings and chokepoints never mattered.
- **Economy could not win.** Renown came about 55% from landmarks and land, and the rest in small capped sums (trade averaged about 125 a game). In the strategy matrix the economy-minded Builder sat at 36% in every configuration, and once geography mattered, the expansion-first style rose to 58–76%.

### Six valleys (`mapgen.ts`)
A seed picks a valley (`valleyOf`, so the New Game screen can name it first, and let you pick a kind). Every strategic feature is built **point-symmetric about the map centre**, so both settlements get the same geography; start resource clusters turn to whichever way the land is best (judged by the thinnest cluster), then mirror.

| Valley | What it is | What it asks |
|---|---|---|
| **Riverlands** | One river with a random course and orientation, 1–2 fords (or a single central one), a pond | Hold the ford, or bridge it |
| **Long Lake** | An hourglass lake with the starts on opposite shores and a **prize island** (the Star-Stone) in the narrows | Bridge the narrows (two short spans) or walk the long way round |
| **Highlands** | A mountain ridge with 1–3 passes, very rock-rich, thin timber and berries | Fortify the passes; trade for food |
| **Three Rivers** | Two parallel rivers with offset fords, and a rich middle strip with the best prizes | Each side must ford twice to reach the centre |
| **Wildwood** | Dense forest, two narrow crossing streams, scarce berries | Fish, trade, clear the land |
| **Fens** | A dozen ponds, shallows and winding dry routes | Fish aplenty; bridges shorten everything |

- **Always playable:** the generator verifies both starts are joined by land and falls back to the Riverlands if not (it did on 1% of 300 seeds). Fords were once circles too small to span a river on a bend; their reach now scales with the river's width, which took failures from 5% to 1%.
- **Fair enough:** over 200 seeds, start-resource ratios in the worst case are 0.17–0.5, better than the old generator's 0.11–0.29, and every start has at least 15 trees, 4 rocks and 4 bushes in reach.
- **Tested** (`tests/mapgen.test.ts`): all six appear, every one is playable, the geography really differs (Highlands ≥1.8× the rock and ≤0.6× the timber of the Riverlands, and so on), and the Long Lake island cannot be walked to but is within bridging distance.

### Rivers are borders now (`territory.ts`)
Each tile of open water or mountain between a post and a tile weakens its influence there by 35% (`BALANCE.barrierPct`), so a river of three or four tiles blocks a claim entirely and a ridge is a wall. A ford, a bridge or a mountain pass lets a border through along it. A post that holds a crossing fights harder (+25% for guards within 3 tiles of a bridge, `holdsCrossing`), and a raid is only offered against a post the huscarls can walk to.

### Bridges (`bridges.ts`, `render/bridges.ts`)
- A bridge is a span of 1–5 plank tiles joining two banks, for **3 logs and 1 stone a tile**, laid by the crew in 5 seconds a tile, from Hamlet. It needs one bank inside your border and the other to be dry land.
- It is a Command (`bridge`), so the scripted player uses exactly what you do. `bestBridge` finds the span that opens the most ground (and unclaimed landmarks) and drives both the bot and a **★ hint** on the Bridge card; one click starts bridge mode with that span already aimed. On touch, the first tap aims and a second tap on the same span builds it. Hotkey **B**.
- State is `world.bridges` (saved) plus `world.deck` (rebuilt on load); a finished deck is walkable water. The plank bridge has rope rails, piers, and lanterns that glow at night, and goes up plank by plank.
- **Pathing got faster, not slower.** The new maps made failed searches expensive (45 s for six games against 13 s). Now connected regions of walkable ground are labelled once (rebuilt when a bridge opens), so a path to anything across the water is refused instantly, and gatherers skip nodes they cannot reach. Six games take about 5 s.

### Callings: a town becomes something (`callings.ts`)
Identity is **read off the town, never chosen**. Four scores follow what you build and do; the leader, if it leads the runner-up by 15%, is recognised at three tiers (scores 10, 22 and 40), and it takes a 30% lead to change an established calling (so identity never flickers).

| Calling | Earned by | Each tier gives |
|---|---|---|
| **Merchants** (Market Town, Trading Town, Free Port) | Storehouses, the Great Granary, goods sold | Goods sell for **+20%**; the market's glut clears twice and three times as fast |
| **Masons** (Quarry Town, Mason's Hold, Citadel of Works) | Quarries, sawpits, Great Works, stone and wood crafts | Great Works cost **15% less** and pay **50 more renown**; stone and timber work 8% faster |
| **Wardens** (Garrison Town, Stronghold, Fortress) | Towers, stockades, the hall, raids won and repelled | Guards fight 10% harder and **eat less** (free at tier 3); raid spoils +25%; **+1 post at tier 2, +2 at tier 3** |
| **Hearthfolk** (Farmstead, Hearth Town, Harvest Hall) | Foragers, fishers, homes, a well-fed town | Gatherers 8% faster, births 10% sooner, and **renown a minute for a fed, large town** |

- **Visible:** a signature cluster grows behind the hall and larger with each tier (market stalls with striped awnings; a stone yard with a smoking forge and crane; a drill yard and palisade; haystacks, beehives, cabbage beds and a scarecrow), with a shower of sparks when it appears. A **calling chip** in the top bar opens all four with progress bars and what earns each.
- **Quiet:** one toast when a calling is found or deepened. Nothing to manage, no menus.
- **The scripted players now play economies.** The Builder style (never raided, claimed fewer landmarks) is replaced by **Trader, Mason and Hearthfolk**, each building toward its calling after the frontier, and Raider and Warden pursue the Stronghold. A bug the matrix exposed: their calling-building ideas sat ahead of the frontier idea, so they never pushed the border (4 towers against 8) and sat at 19–32%; frontier first, calling second fixed that.

### Measured (strategy matrix: 12 seeds × both sides, origins, 7 styles, three seed blocks)
| Style (what it builds toward) | Seeds 100 | Seeds 300 | Seeds 500 | **Average** |
|---|---|---|---|---|
| Balanced | 49% | 56% | 46% | **50%** |
| Expander (the Realm) | 48% | 60% | 60% | **56%** |
| Trader (Merchants) | 60% | 41% | 50% | **50%** |
| Mason (Masons) | 42% | 46% | 53% | **47%** |
| Hearthfolk (Hearth) | 55% | 55% | 51% | **54%** |
| Raider (Wardens, raids) | 51% | 44% | 47% | **47%** |
| Warden (Wardens, defence) | 46% | 49% | 44% | **46%** |

Median length **35–36 min**, about 2.3 lead changes and about 20% comebacks. For comparison, with six valleys but no callings, Expander won 58%, 66% and 76% of its duels and the Builder fell to 31%; with the callings but the bots' building priorities wrong, Mason and Hearth sat at 19–32%. Every one of the three economy styles is now a real way to win, and no style averages above 56%.

### The end of a game
The report now names what the town became and the valley it was played in, says in plain words **how the renown was earned** (the Realm, Trade, Craft, the Hearth, War), names the road least walked ("Next time, try Trade: build storehouses...") and offers **▶ Another valley**, which starts a new game on a new valley and a new founder at once. The New Game screen shows the valley's kind, its blurb, and six icons to pick a kind.

### Typography
The serif is gone. Headings use **Bricolage Grotesque** (a warm, slightly quirky modern grotesque) and text uses **Nunito Sans**, both self-hosted variable fonts (126 KB, no third-party request, works offline).

### Open
- **Mason** is the weakest persona (about 42%): Great Works are a race, and the Masons' edge only helps once they win one.
- **Expander** is still the strongest (about 55–60%) and the style most helped by rivers being borders; it deserves a deliberate counter next (raiders crossing at the fords it ignores).
- **Roads.** Worn footpaths are still only decoration; letting them speed travel would reward clever layout.
- Valleys could shape *rivals* too (a rival that bridges to flank you, or holds the far ford).

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
- InstancedMesh for trees, rocks, bushes and settler body parts (the Blender settler is eight instanced parts: body, head, hair, hood, two arms and two legs).
- Building and settler models made in **Blender** (`tools/blender`, §0e) and loaded from `public/models/*.glb`, with the older code-built models as a fallback for anything not yet replaced. Variants per trade tier.
- Procedural settler animation: walk, chop, mine, pick, hammer and carry.
- Particle juice, and shadows from a camera-following directional light. A slow day and night (§0f) eases the sun, sky and fog; Blender-painted glow weights light windows and fires after dusk.
- Picking ray-marches the heightmap instead of raycasting meshes.

**Controls:**
- **Desktop:** drag to pan, wheel to zoom, right-drag or Q/E to rotate, WASD to move, number-key build hotkeys, Space to pause.
- **Touch:** one-finger pan, pinch zoom, two-finger twist to rotate, tap to select, and tap-to-place with a confirm step.

**3D models (v0.20):** Blender via the Blender MCP, exported as meshopt-compressed GLBs; see §0e.

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

### v0.11.0 Sound, the ledger, previews and dynasties (2026-10-28)
- **Request:** every iteration should make the game significantly more fun. This one also overhauled the audio (an original dynamic soundtrack, ambience, separate volumes and mute) and replaced the interrupting decision popups.
- **Built:**
  - the soundtrack engine and four pieces, with stingers;
  - the seasonal and camera soundscape;
  - music volume and mute (button, M, Settings);
  - the ledger in place of the boon tray and event card, with longer decision windows;
  - influence previews for towers, Festivals and Expeditions;
  - dynasties;
  - deed-only council news.
- **Caught while testing:**
  - The lute's timing jitter could schedule the first note at a negative time, which throws in WebAudio. Start times are now clamped, and late notes are dropped after a stall.
  - The wind's broadband noise masked the music (seen on a spectrogram of a headless recording), and the mix sat at about -29 LUFS. Wind is now halved, the music is louder, and a bus compressor is added (about -24 LUFS).
  - Four council toasts at once.
- **Tests:** every bar fits its metre, preview equals reality, dynasty founders (102 tests).

### v0.12.0 Challenges, the rival's voice, acclaim, auto-homes (2026-10-28)
- **Built:**
  - seven challenges, with harness reporting of wins per side and acclaim endings;
  - the rival's lines (`ui/rivalVoice.ts`);
  - the Acclaim rule;
  - the auto-homes command and toggle;
  - the contest strip;
  - the Champion of the Valley honour;
  - "Challenges" as a renown source on the report.
- **Duels caught:**
  - Challenge prizes made games about 2 minutes shorter (median ~27.8) and Acclaim at a 400 lead ended 23% of games. The goal is now 1,600 and Acclaim needs a 500 lead.
  - The star race only ran if a challenge happened to be due. It now starts the moment the star falls.

### v0.13.0 The strategy matrix: measuring the watchtower problem (2026-10-28)
- **Why:** a full human game found one dominant plan, building watchtowers. Before changing anything, the harness had to be able to see it.
- **Built:**
  - bot styles (Balanced, Expander, Builder);
  - the rival's personality following its origin, saved with the game;
  - `--matrix` (parallel style-vs-style duels with a dominance alarm);
  - frontier towers per game in every report.
- **Measured:** Expander wins 63% and beats every other style (see §0c). That confirms the feedback.
- **Fixed on the way:** a restored rival skipped the opening move due on the exact tick of the save.

### v0.13.1 Towers need room to breathe: shared escalation and a frontier cap (2026-10-28)
- **Shared escalation:** Lookouts, Watchtowers and Outposts now count together towards the next tower's price, so mixing types no longer keeps them cheap.
- **A frontier cap by rank** (4/7/10/13), shown on the tower build cards. It applies to Expeditions too.
- **Matrix:** Expander's overall win rate falls from 63% to 53%. Every style still leans on landmarks (see §0c), and that's the job of v0.14.
- **Pacing check:** a cap of 3 at Camp stalled seed 13's renown between 10:00 and 16:00, so it's 4.

### v0.14.0 Garrisons and the Stockade (2026-10-28)
- **Built:**
  - guard posts (`garrison` on building defs, a `guard` job filled after first hands and before extra crew, and a porter reserve);
  - the unmanned penalty from Hamlet;
  - the Stockade, with its model and generated icon;
  - spear-and-shield guards in their family's colours;
  - an "unguarded" shield bubble;
  - guards and defence in the building panel;
  - `warfare.ts` with `defenceOf`;
  - the bots raising stockades by contested landmarks.
- **Tests:** guards staff posts, unmanned posts push less, and stockades shield their neighbours and count against the cap.

### v0.14.1 Raids: the Mustering Hall, warbands and burning towers (2026-10-28)
- **Built:**
  - the Mustering Hall (model and generated icon);
  - huscarls (the guard job, with an `away` phase);
  - `warfare.ts` (warbands, skirmishes, razing, `previewRemoval`);
  - the `raid` Command;
  - the Raid button (R), a targeting bar with odds and what a burn frees, an incoming-raid strip with a countdown and odds, and war pins over marching bands;
  - war-horn and clash stingers;
  - burn smoke and embers;
  - rival lines for raids;
  - the Burn a Beacon and Hold Fast challenges;
  - the Warlord and Unbroken honours;
  - Raider and Warden bot styles;
  - raid metrics in the harness.
- **Rules:** manned posts keep watch, and the Watchtower has a stone footing worth +10 defence.
- **Tests:** burn and spoils, holding the line, the home warband turning out, freed landmarks not paying the seizing prize twice, and save/load mid-march.

### v0.15.0 Reavers (2026-10-28)
- **Built:**
  - reavers (`updateReavers`, landing spots on the shore, strength by time and difficulty, plunder);
  - the Reaver Coast omen;
  - dark-cloaked reaver figures made up from each band;
  - sighted warbands drawn through the fog;
  - a "coin toss" call in the warning strip for even odds;
  - reaver counts in the harness.
- **Saves:** version 16.
- **Tests:** reavers ignore small settlements and peaceful valleys, march on the furthest post, and are held off by a guarded post with a stockade.
- **Versioning:** v0.14.1 (raids) should have been a minor version under AGENTS.md. It's fixed from here on.

### v0.16.0 The Great Houses: three seats you choose, and landmarks that need watching (2026-10-28)
- **Why:** the playtest said the Great Houses were confusing ("used their abilities without really understanding their effects"), and that with 170 settlers there was never a reason to look at a family.
- **Built:**
  - `houses.ts`: seven houses, seats at origin, Hamlet and Village, house letters, `playerMod`, banner families;
  - house powers keyed by seat, each with exact numbers and a `deedProblem` reason;
  - the War-Horn and Shield Wall powers;
  - the house bar (power, house, short effect, true cooldown, running chip);
  - the house letter cards ("Always:" and "Power:");
  - landmarks that pay only while watched, with stockade tending;
  - origins as founding houses;
  - dynasty migration;
  - rival personalities by origin;
  - per-origin results in the matrix;
  - How to Play and chapter hints rewritten.
- **Removed:** `boons.ts`, boon letters, the prestige council, Betrothal and Lessons.
- **Balance:**
  - **Houses made Expander dominant again (72%),** and Kinfolk won 79% as an origin, because "births +50%" now applied to the whole town. The fixes:
    - landmarks need watching;
    - Hearth births +25%;
    - Kinfolk +1 child;
    - Horn +3 reach;
    - Plough +40%;
    - Axe +40%;
    - Hammer adds quarrying;
    - richer River Folk and Wayfarer wagons;
    - goal 1,400.
  - **After the fixes:** all styles 42–59%.
- **Bug found by the duels:** a raid whose target had already burned reported "held: 90 vs 0". The band now just goes home.
- **Saves:** version 17 (shape changed: seats, mods, the house offer, families without boons).

### v0.16.1 Balance on fresh seeds: the Plough, underdog fury, acclaim (2026-10-28)
- **Plough** gathering is +15% (was +30%).
- **Underdog fury:** 120+ renown behind, huscarls fight 25% harder.
- **Acclaim** needs a 600 lead (was 500).
- **Rank thresholds:** Village at 250 renown and Town at 650. Without them, the scripted player's Hamlet chapter missed 16:00 on seed 13.
- **Measured:** see §0c. 60 real duels finished 30 : 30, and every style stayed between 38% and 58% across two seed blocks.

### v0.17.0 The Calm Pass: one win rule, quiet news, minimal houses, a picture-first New Game (2026-10-28)
- **Victory:**
  - Acclaim is removed.
  - `victory: 'goal'` wins at the renown target alone.
  - The opening banner says the goal, who you face and the omens.
- **News:**
  - `ui/news.ts` (`newsFor`, `simulateDesk`) and a single notifier: one banner at a time, two toasts at most, priorities, merging.
  - The race bar and toasts share a column, so they can't overlap.
  - Rival lines are throttled.
  - **Measured:** 9.0 items a minute before, about 3 a minute after.
- **Great Houses:** a `bonus` and `tag` per house, cards cut to icon, name, tag, bonus and power, and a minimal bar.
- **New Game:** full-screen with five illustrated origin cards (`public/assets/ui/origin-*.jpg`), a one-line house summary, chips for difficulty, rival and valley, and Begin (Enter starts). The title tagline no longer promises family lineage.

### v0.18.0 The town is the hero: town crafts, no ageing, no family bookkeeping (2026-10-28)
- **Built:**
  - town crafts (`player.crafts`, `craftXp`, `craftTier`, the `craftUp` event) that upgrade every workplace together;
  - the crafts strip in the top bar;
  - craft lock labels ("Woodcraft ★");
  - worker gear from the town's craft.
- **Removed:**
  - `Settler.skills`, `Settler.elder`, `Family.skills`;
  - inheritance, elders, deaths and lineage legends (`die`, `lifespan`);
  - family pull on influence;
  - the `tierUp`, `firstMaster`, `elder`, `died` and `cameOfAge` events;
  - the settler skill bars and family panel.
- **Rebalanced:**
  - craft tiers at 250 and 3,500;
  - craft renown +15 and +50;
  - ruins, hermit, wanderers and events re-rewarded.
- **Saves:** version 18.

### v0.19.0 A rival with teeth: moods, war for everyone, fairer reavers (2026-10-28)
- **The bot's mood:** 100+ behind it raids anything beatable; 100+ ahead it digs in. Every rival builds a Mustering Hall.
- **The rival announces its mood** in a voice line.
- **Reavers** come at 4+ posts and go for the widest and most famous.
- **Every style** guards contested landmarks and seats a war house.
- **Harness:** a `battles` metric (the war the player saw).
- **Test:** a peaceable rival that falls behind raids a post it can beat.
- **Measured:** see §0d.

### v0.19.1 Fewer banners, current help (2026-10-28)
- **Raid warnings are now an urgent toast, not a banner.** The warning strip already shows the march, its countdown and the odds. With war in every game, banners had reached 16 a game; they're back to 5–7 (rank-ups, the star, the Moot, Great Works, the opening).
- **News on screen:** 2.8–3.9 items a minute across six real duels, against 9.0 before v0.17.
- **How to Play** no longer describes ageing, families and legends. It covers crafts and seasons.

### v0.20.0 The Storybook Art Pass: models made in Blender (2026-10-28)
- **New pipeline:** `tools/blender/` builds the models in Blender (through the Blender MCP, or headless), and `build.py` exports `public/models/buildings.glb` and `settler.glb` and writes preview renders.
- **Fifteen buildings:** the hut, the woodcutter (3 tiers), the quarry (3 tiers), the lookout, the wagon and its three hall ranks, the forager (2 tiers) and the storehouse.
- **A new settler:** gnome-like folk with a hood in the family colour, hair, a nose and eyes. Head nod, step bob and sway, and a trailing hood tip are procedural.
- **Renderer:** `render/art.ts` loads the GLBs (meshopt) and bakes them into the existing geometry layout.
  - Crest markers recolour per family.
  - `withSway` flutters pennants.
  - Models carry chimney anchors.
  - The construction reveal now follows each model's real height.
  - `?art=classic` is an A/B switch, and anything missing falls back to its code model.
- **Screenshot tool:** `--art`, `--focus <building>`, `--yaw` and `--perf`.
- **Test:** `tests/art.test.ts` guards triangle budgets, file size, footprint, joint conventions, crest recolouring and the sway weights. It already caught a quarry whose boulders sank below the ground.
- **Measured:** see §0e. Late game is +2 draw calls and +12% triangles, and frame time is within 1%.
- **No gameplay change:** `src/sim/` is untouched and `SAVE_VERSION` is unchanged.

### v0.21.0 The Alive Pass: the rest of the art, a day and night, and a famine bug (2026-10-28)
- **Art:** eleven more buildings and thirteen wild props from Blender, so every building, Great Work and discovery is covered. `landmarks.glb` is a third file. Roofs got thatch courses.
- **Animated parts:** `<model>#spinz` parts turn about a pivot empty (the Granary's windmill). `withSway` now also carries night glow and flame flicker (`_SWAY` 2 and up).
- **Day and night:** a 4-minute cycle (sun, hemisphere, sky, fog, `nightLevel`), a Settings switch, and warm light pools by lived-in buildings.
- **Life:** folk cheer at rank-ups, claimed landmarks and victory; warbands carry banners; cottages get door lanterns.
- **Sim fix:** food waiting at gatherers now counts (`larder()`), is eaten, and keeps births and newcomers going. Gatherers aren't slowed by hunger. Guards eat triple.
- **UI:** food counters show what the town can eat, and a "Food low" chip warns before hunger. How to Play mentions guards' appetite.
- **Harness:** `hungryPct` in the report and the sim summary; `tools/showcase.mjs` gallery with `--night`.
- **Tests:** `tests/larder.test.ts` (the famine bug), and `tests/art.test.ts` covers every model.
- **No save-format change.**

### v0.22.0 The Many Valleys Pass (2026-10-28)
- **Fonts:** Bricolage Grotesque headings and Nunito Sans text, self-hosted; the serif is gone.
- **Six valleys:** Riverlands, Long Lake (with a prize island), Highlands, Three Rivers, Wildwood and Fens, all point-symmetric and always connected by land. `tools/valleys.ts` draws them and measures the generator; the New Game screen names the valley and lets you pick a kind. **Maps changed, so `SAVE_VERSION` is 19 and older saves are refused.**
- **Rivers and ridges are borders:** water and mountains weaken influence (`barrierPct`), so crossings matter. A raid is only offered against a post you can reach.
- **Bridges:** a new Command and mode (hotkey B, a ★ hint on the card, two-tap on touch), built plank by plank for 3 logs and 1 stone a tile; the bots use them; posts that hold a crossing fight 25% harder.
- **Pathing:** connected-region labels reject unreachable paths instantly and gatherers skip unreachable nodes (6 games: 45 s to about 5 s).
- **Callings:** Merchants, Masons, Wardens and Hearthfolk are read off the town, with three tiers each, real perks, a signature cluster beside the hall, a top-bar chip and one quiet toast.
- **Bots:** Trader, Mason and Hearthfolk replace the Builder; calling-building comes after the frontier. The matrix now has seven styles.
- **End of a game:** the town's calling and valley, how the renown was earned, a road to try next, and **▶ Another valley**.
- **Harness:** `valley` and `bridges` in the playtest report and a per-valley summary line; `tools/valleys.ts`, `tools/fairness.ts`, `tools/bridge-shot.mjs`, `tools/calling-shot.mjs`.
- **Tests:** valleys (variety, playability, geography, the island), bridges (spans, rules, laying, the island opened, save/load), callings (thresholds, hysteresis and every effect). 146 pass.
