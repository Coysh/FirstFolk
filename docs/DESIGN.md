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
- **Default scenario:** the *Prosperity Race*: first to 40 settlers, 3 master trades and 3 survived winters. Victory runs on a modular scenario system (§5).

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

### Beat map: something new every 1–3 minutes

| Time | Beat | What the player feels |
|---|---|---|
| 0:00–0:30 | The wagon unpacks, the first building goes down, axes swing | Instant agency |
| ~1:00 | The first logs reach the wagon, and the first hut starts rising | The loop clicks |
| ~2:30 | The first child comes of age and joins the workforce | The family twist appears early |
| 3:45–5:00 | **First winter.** Foraging stops and the wagon's food must last | First real tension |
| ~4–6 | The first **Journeyman**: the building visibly transforms and a new chain opens | Progression you can see |
| ~6–10 | Newcomer families, the first **marriage**, the second chain | Growth and Sims-like charm |
| ~8–12 | Scouts meet the rival's border, and contested prize sites are revealed | Competition starts |
| 12–20 | The border race over prize sites, and migrants choosing the better town | Strategy |
| ~15 | The third winter is survived (one win condition met) | A milestone |
| ~20–22 | The founders pass on, and their skills are carried by their children or the lore | Emotional stakes |
| 20–30 | The first **Masters**, families take trade surnames, buildings reach their final form | Payoff |
| 30–45 | The race to 40 settlers and 3 masters, with the race bar neck and neck | Climax |

**Pacing rules enforced by the sim runner:**
- Idle adults stay under 15%.
- No stretch longer than 30 s without an event (completion, arrival, unlock, discovery, season).
- The first Journeyman arrives before 6 min.
- A competent scripted player wins in 30–45 min against Normal.

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

## 4. Economy (MVP content)

- **Goods:** logs, stone, berries, then planks, fish, grain and bread.
- **Buildings:**
  - Wagon (HQ, storage, housing for the founders)
  - Hut (one family)
  - Woodcutter
  - Forester
  - Quarry
  - Forager
  - Fisher
  - Sawpit
  - Field
  - Mill-Bakehouse
  - Storehouse
  - Lookout
  - Longhouse and Stone Lookout (Master unlocks)
- **Resources:** trees regrow only through foresters, stone deposits run out, and berry bushes regrow and go dormant in winter. Finite stone is one of the reasons to expand.
- **Food:** each settler eats 1 food per minute, taken from storage, and winter raises it to 1.25.

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

**Scenarios:**
- **Landfall** (M0): a tutorial-style goal list with no rival.
- **Prosperity Race** (default MVP): 40 settlers, 3 masters and 3 winters, against a rival.
- Future: **Sandbox** (`victory: 'none'`, milestones only), **Landmarks** (claim 3 sites), **Long Winter** (survival).

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
3. **M1b Roads** *(next)*: Roads are prototyped first as **optional fast lanes** (+60% walking speed for anyone on them, drawn by tapping flags), not as mandatory segment carriers. They are evaluated in headless playtests against the free-porting baseline. Segment carriers are adopted only if they stay fun at 40+ settlers without stalls. The footpaths already worn by settlers show where roads want to go.
4. **M2 Seasons and Kin:** seasons and winter, the food chain (fisher, field, mill-bakehouse), marriage, inheritance, apprenticeship, trade surnames, lore, a family panel, and the asset pipeline (icons, crests, title art).
5. **M3 Frontier and Rival:** fog of war, scouts, lookouts and borders, prize sites, migrant appeal, the AI rival, the Prosperity Race scenario and race bar, and headless AI-vs-AI balancing.
6. **M4 Juice and Ship:** effects, procedural audio, day and night, save and load, PWA, a mobile performance pass, and balance sweeps.

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
