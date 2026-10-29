---
title: My experience of vibe coding a game with Blender MCP and OpenAI image generation
description: I built FirstFolk, a 3D settlement builder for the browser, in about 24 hours by describing it to Claude Code, then letting the game play itself thousands of times to find out what was fun.
date: 2026-10-29
---

I wanted to see how far I could get building a game by describing what I wanted to Claude Code and letting it do the work. I'd just read Simon Willison's [Battle Drones write-up](https://simonwillison.net/2026/Oct/20/battledrones/), about the Command & Conquer style game he vibe coded, and it made me want to try the same thing with the games I like.

I'm not a big gamer - I've only really played Age of Empires II, The Settlers II and Total War: Rome II in my life, so I thought a game bringing them together would be the best. [FirstFolk](https://github.com/Coysh/FirstFolk#readme) is my attempt at a mix of them. It's a 3D settlement builder that runs offline in your browser. You found a village in a valley, get it through the seasons, win over the neutral folk who already live there, and race an AI rival to fill a Crown. It's TypeScript, Three.js and Preact with no server, and a game takes about 30 to 45 minutes. You can [play it here](https://firstfolk.timcoysh.co.uk).

In just over 24 hours I went from nothing to v0.30. My friend Claude wrote about 19,000 lines of TypeScript, 191 tests and a design doc heading for 1,900 lines. My own time on it was reviewing prompt responses and iterating. I left two long processes running both nights.

I was surprised testing the latest version (after barely playing the whole game). I had 30 minutes of actual fun and was surprised that Simon's suggestion of iterating with Claude to make it "more fun" actually seemed to work.

What I want to write about is how it got there, because the process turned out to be more interesting than any one feature. I stopped trusting my own gut about whether the game was fun and started trusting Claude, which plays it a few thousand times.

- [The idea](#the-idea)
- [The method: make the game play itself](#the-method-make-the-game-play-itself)
- [How the first few hours went](#how-the-first-few-hours-went)
- [Every version](#every-version)
- [Some thoughts](#some-thoughts)

## The idea

The pitch in the first design doc was Settlers II style logistics, where goods get carried around by actual people instead of teleporting, mixed with families who learn crafts, specialise, marry into other families and pass skills down. One valley, one rival, and a session you can finish in a lunch break.

The very first thing I put in the project's `AGENTS.md` was this:

> **Top priority: gameplay enjoyment.** If a change is technically correct but makes the game slower, more confusing or more boring, it's a regression.

The second rule was that every change, however small, ends as a versioned commit with an annotated tag, pushed to GitHub. That's why I've ended up with 38 releases in 24 hours.

The [`v1` branch](https://github.com/Coysh/FirstFolk/tree/v1) keeps it exactly as it was after this first prompt, so you can check it out and run it if you want to see where I started. v0.1 is also available to play here so you can try it out for yourself.

[firstfolk-v1.timcoysh.co.uk](https://firstfolk-v1.timcoysh.co.uk)

## The method: make the game play itself

Simon's brilliant post is where this method came from. His Battle Drones got a lot more fun once Claude started running over a thousand simulated playtests and rebalancing the game from the results, and he points out that a deterministic simulation is what makes things like replays work. So I wanted to make that my philosophy from the first prompt. I kept the simulation deterministic, asked Claude to run thousands of AI-versus-AI games headlessly, I decided which numbers I cared about, and then changed a few things at a time.

The first headless playtest Claude ran of the first playable build found three bugs that would each have stomped the game development:

1. Construction stalled, because both founding adults became gatherers and nobody was left to build.
2. Porters served producers in id order, so logs flooded the carriers and stone never moved. No stone means no huts, which means no growth.
3. A building could seal another one's door in a two-tile pocket, and porters looped forever on deliveries they couldn't make.

I'd have found all three eventually by playing but Claude found them in seconds.

## How the first few hours went

### v0.1

My starting prompt was fairly detailed. I wanted to provide context of Simon's methodology as well as my own OpenAI key.

> We are going to build a fast-paced, single-player, browser-based real-time settlement-building strategy game called **FirstFolk**, inspired by The Settlers II, Age of Empires II, Spore and The Sims. The player starts with a single family, a wagon of basic supplies and an unexplored wilderness, and gradually builds a thriving civilisation through resource gathering, roads, physical goods transportation, automated settlers, construction, production chains, exploration and territorial expansion. The unique twist is that settlers belong to families who develop skills, professions and specialisations through their activities, with knowledge and abilities passed down through generations, allowing the civilisation to evolve organically rather than through a conventional technology tree. The gameplay must be genuinely fun, fast-paced, immersive and highly visual, with continuous real-time simulation, satisfying animations, rapid progression, competing AI settlements and meaningful strategic challenges. It should start small but eventually scale to hundreds of settlers and multiple connected towns without excessive micromanagement. Prioritise responsive desktop and mobile controls, polished graphics and a charming, detailed world. Use three.js as an engine. We'll build this iteratively, inspired by Simon Willison's Battle Drones project ([https://simonwillison.net/2026/Oct/20/battledrones/](https://simonwillison.net/2026/Oct/20/battledrones/)). You have access to an OpenAI API key through the OPENAI_API_KEY environment variable, which you may use to generate consistent game assets using the latest supported OpenAI image generation API. Never expose the key or include it in client-side code. For now, don't write any game code. First, help me design a small but genuinely enjoyable MVP, recommend an appropriate technical architecture and ask me the most important questions about gameplay, graphics, world simulation and progression. Challenge ideas that might make the game boring, slow or unnecessarily complicated.

I was impressed with the output. The game looked good, was playable

![FirstFolk v0.1.0: round thatched huts, a wagon, workshops and a chapter scroll](blog/images/versions/v0.1.0.jpg)

### v0.2 to v0.7: the Fun Pass

The initial v0.1 was working, but I wanted to iteratively improve it.

> The initial prototype is working, but I want you to critically review everything implemented so far and make the experience significantly more polished and enjoyable. Create a proper animated title screen, loading screen, New Game and Continue functionality, and improve the world with better terrain, lighting, vegetation, environmental activity and sound. Make construction and resource gathering satisfying to watch, improve the interface and introduce a short interactive tutorial. Test the actual game in a browser, not just the underlying code.

So after a few iterative prompts that I didn't document we ended up with 0.7 that was a working playable version.

![FirstFolk v0.7.0](blog/images/versions/v0.7.0.jpg)

### v0.8: the Renown Pass

My own quick playtest on v0.7 was good, but after playing a little bit it started to turn repetitive. Resources piled up, all the workers went idle, and progress was just population and territory targets. The Claude-run simulation agreed, with numbers: territory was completely flat from minute 18 to 40, about 900 goods were sitting unused at minute 20, and the race ended at 19:35 with twenty minutes of nothing after it. The fix was living borders (influence decides each tile, so land can be lost), landmarks that pay while you hold them, and sinks with stakes.

> FirstFolk is improving, but I want you to make it a LOT more fun. Revisit Simon Willison's Battle Drones article, particularly the breakthrough where he explicitly asked Claude to improve the gameplay, and apply that same ambitious approach. At around 20 minutes, resources accumulate, workers become idle and progression becomes repetitive. Rethink the mechanics, introduce stronger strategic incentives and genuine competition, and use extensive AI-vs-AI simulations to identify dominant strategies and balance the game. Don't simply make it bigger; make it dramatically more entertaining.

![FirstFolk v0.8.0](blog/images/versions/v0.8.0.jpg)

### v0.13: the strategy matrix

When Claude tested it, it pitted AI players of different styles against each other on the same seeds, in parallel, and printed a win-rate table with a dominance alarm if any style won more than 60%. The first run showed tower spam beating everything. That led to garrisons (every banner needs a spear), raids, Reavers who punish over-extension, and a cap on how many posts your rank can hold.

![FirstFolk v0.13.0](blog/images/versions/v0.13.0.jpg)

### v0.17 and v0.18: the Calm Pass

I took things out: one win rule instead of several, quieter news, fewer houses, no family bookkeeping. The game got better, which I did not expect to be so satisfying.

![FirstFolk v0.18.0](blog/images/versions/v0.18.0.jpg)

### v0.20 to v0.22: art and six valleys

I was enjoying this process, but it was feeling flat still. I'd heard some people online experimenting with Blender, so I installed it and ran this prompt:

> I've installed Blender MCP and want to use an extended overnight development session to significantly improve FirstFolk's 3D assets and overall visual quality. Review the existing Three.js models and identify the biggest opportunities for improvement across buildings, settlers, animations and landmarks. Use Blender MCP to create distinctive, charming, detailed low-poly medieval models, export optimised GLB files and integrate them directly into the game. Establish a consistent art style and work autonomously through multiple iterations, gradually upgrading the game's assets rather than stopping after a few examples.
>
> You have the whole night to experiment, build, test and refine. Take creative ownership of the visual direction, regularly inspect the actual game at normal gameplay zoom, compare before-and-after screenshots and improve anything that looks inconsistent or unfinished. Prioritise recognisable buildings, expressive characters, environmental details and animations that make the settlement feel alive. Maintain good browser performance with hundreds of settlers, run automated tests and visually inspect your work throughout. Follow Simon Willison's iterative Battle Drones approach: create, evaluate, improve and repeat. Make substantial progress independently without stopping for routine decisions, document changes in DESIGN.md and commit stable versions. **The goal is to wake up to a noticeably more beautiful, cohesive and immersive FirstFolk—not just a handful of new models.**

And boy did it work well. I ran this overnight and my MacBook Pro M4 was at a decent CPU usage. I've not used Blender but it's obviously resource intensive.

I was really impressed with what it came out with on a single pass

![FirstFolk v0.20.0, the first Blender-built huts, workshops and hall](blog/images/versions/v0.20.0.jpg)

![FirstFolk v0.22.0](blog/images/versions/v0.22.0.jpg)

Up until now I'd only used Claude and OpenAI's image models, generated during development rather than in the game. The whole image bill came to $3.98.

This is a screenshot from Blender. It did this in one pass, no input from me and I haven't changed anything.. I don't even know how to user Blender. It's the whole village laid out on a grid: huts, workshops, the hall, towers, the Stone Circle, the windmill granary and, down in the bottom right, the first trees.

![Blender, with the whole FirstFolk kit of buildings laid out in a grid, built by scripts driven through the Blender MCP server](blog/images/blender-mcp.jpg)

### v0.23: adding more story and battles

v0.23 added some more story to the game... A star falls at about 14 minutes and wakes the Kingstone, a landmark whose keeper fills a Crown.
I also wanted battles to make it more engaging, so battles became something you watch and join, with a tug-of-war line and a Rally button, instead of a result that's settled before you can look.

![FirstFolk v0.23.0](blog/images/versions/v0.23.0.jpg)

### v0.24 to v0.28: enhancing the economy

v0.24 to v0.28 added four neutral steadings that you win over by sending ox-cart caravans of whatever they want. The Crown fills for whoever holds more of the valley's voices, and there's a bread, ale and tools economy where homes level up into cottages and hall-houses.

![FirstFolk v0.24.0, with the first steadings](blog/images/versions/v0.24.0.jpg)

![FirstFolk v0.28.0](blog/images/versions/v0.28.0.jpg)

### v0.29: the screen was a wall

After v0.28 I played it and wrote this:

> FirstFolk v0.28 has made excellent progress, but the UI has become overwhelming and needs a major rethink. The Crown panel takes up too much permanent screen space, notifications and popups compete for attention, and the top bar is overcrowded.

I'd also asked something that had been bugging me: does a better economy give you new ways to win, or does it just make resources you spend on the same territorial goals? Mostly the second one, if I'm honest.

Claude screenshotted the game before touching anything. Eight things were fighting for the same pixels on the first desktop shot, and on a phone they overlapped. The new version has a one-line Crown chip you tap to open, overlays that open one at a time, a Chronicle that keeps the quiet news so a calm screen never means a lost message, and a phone layout with three short rows. The CSS shrank from 3,200 lines to 2,400.

![FirstFolk v0.29.0](blog/images/versions/v0.29.0.jpg)

For the economy it made the Crown three roads: trade with the steadings, war for the Kingstone, and the Hearth, where the richer town gets a voice. Carts now come home laden, and Hired Spears let you pay ale and tools for strength in a fight.

### v0.30: nothing explained itself

The next test was the one I said I enjoyed the most, and it came with only two complaints at about 30 minutes:

> I reached the maximum of 12 watchtowers and could no longer expand meaningfully. I also found military strength confusing: I was sometimes fighting with 60 strength against 90, and neither recruiting nor using Surge seemed to help me win.

The Mustering Hall held exactly four huscarls and nothing could change that, so there was nothing to recruit. The "90" included the rival's own huscarls standing at home, which nothing on screen mentioned. Surge is a one-off 30%, so 60 became 78 against 90 and still lost, and the game never said by how much.

![FirstFolk v0.30.0](blog/images/versions/v0.30.0.jpg)

My first version of the army made a fully upgraded hall worth 562, which nothing in the valley could survive. The matrix didn't flag it, but a screenshot did. Arming the garrisons as well fixed it.

The last matrix run was 336 duels in about four and a half minutes. Every one of the seven playing styles wins between 44% and 59%, a median game lasts around 33 minutes, and the last ten minutes are the busiest (7.7 actions a minute against 3.8 in the first ten).

## Every version

Here are all 38 releases in order. Each one is a screenshot from that tag's own code, run on the same seed after ten simulated minutes of the scripted bot, so the differences come from the game and not the luck. Watch the top bar and the right-hand side: the interface gets busier and busier until v0.28, then calms right down in v0.29.

### v0.1.0: M1 baseline (trades and presentation)

![FirstFolk v0.1.0](blog/images/versions/v0.1.0.jpg)

### v0.2.0: Fun Pass 1+2, kill the waiting and open the frontier

![FirstFolk v0.2.0](blog/images/versions/v0.2.0.jpg)

### v0.3.0: Family Boons, marriage and the Fisher

![FirstFolk v0.3.0](blog/images/versions/v0.3.0.jpg)

### v0.4.0: seasons and settlement ranks

![FirstFolk v0.4.0](blog/images/versions/v0.4.0.jpg)

### v0.5.0: Valley Events and paced boon choices

![FirstFolk v0.5.0](blog/images/versions/v0.5.0.jpg)

### v0.6.0: the Rival

![FirstFolk v0.6.0](blog/images/versions/v0.6.0.jpg)

### v0.7.0: review pass: no waiting gates, smarter bot, idle indicator

![FirstFolk v0.7.0](blog/images/versions/v0.7.0.jpg)

### v0.7.1: design doc brought up to date, version on the title screen

![FirstFolk v0.7.1](blog/images/versions/v0.7.1.jpg)

### v0.8.0: the Renown Pass: living borders, landmarks, Family Deeds, Great Works, lineage

![FirstFolk v0.8.0](blog/images/versions/v0.8.0.jpg)

### v0.9.0: replayability: origins, omens, discovery pools, the Moot, Daily Valley

![FirstFolk v0.9.0](blog/images/versions/v0.9.0.jpg)

### v0.9.1: less noise, no chores: news priorities, standing trade orders, honours

![FirstFolk v0.9.1](blog/images/versions/v0.9.1.jpg)

### v0.10.0: surprises and matches: star-fall, betrothals, council news

![FirstFolk v0.10.0](blog/images/versions/v0.10.0.jpg)

### v0.10.1: teach deeds with a goal; mobile top bar no longer hides speed controls

![FirstFolk v0.10.1](blog/images/versions/v0.10.1.jpg)

### v0.11.0: an original dynamic soundtrack, the ledger, influence previews, dynasties

![FirstFolk v0.11.0](blog/images/versions/v0.11.0.jpg)

### v0.12.0: challenges, a rival with a voice, acclaim, auto-homes

![FirstFolk v0.12.0](blog/images/versions/v0.12.0.jpg)

### v0.13.0: the strategy matrix: bot styles, rival personality, dominance alarm

![FirstFolk v0.13.0](blog/images/versions/v0.13.0.jpg)

### v0.13.1: shared tower escalation and a frontier cap by rank

![FirstFolk v0.13.1](blog/images/versions/v0.13.1.jpg)

### v0.14.0: garrisons and the Stockade: every banner needs a spear

![FirstFolk v0.14.0](blog/images/versions/v0.14.0.jpg)

### v0.14.1: raids: the Mustering Hall, warbands and burning towers

![FirstFolk v0.14.1](blog/images/versions/v0.14.1.jpg)

### v0.15.0: reavers: neutral pressure on over-extension

![FirstFolk v0.15.0](blog/images/versions/v0.15.0.jpg)

### v0.16.0: the Great Houses: three seats you choose; landmarks need watching

![FirstFolk v0.16.0](blog/images/versions/v0.16.0.jpg)

### v0.16.1: balance on fresh seeds: the Plough, underdog fury, acclaim

![FirstFolk v0.16.1](blog/images/versions/v0.16.1.jpg)

### v0.17.0: the Calm Pass: one win rule, quiet news, minimal houses, picture-first New Game

![FirstFolk v0.17.0](blog/images/versions/v0.17.0.jpg)

### v0.18.0: the town is the hero: town crafts, no ageing, no family bookkeeping

![FirstFolk v0.18.0](blog/images/versions/v0.18.0.jpg)

### v0.19.0: a rival with teeth: moods, war for everyone, fairer reavers

![FirstFolk v0.19.0](blog/images/versions/v0.19.0.jpg)

### v0.19.1: fewer banners, current help

![FirstFolk v0.19.1](blog/images/versions/v0.19.1.jpg)

### v0.20.0: the Storybook Art Pass: Blender-built huts, workshops, hall and settlers

![FirstFolk v0.20.0](blog/images/versions/v0.20.0.jpg)

### v0.21.0: the Alive Pass: every building in Blender, a day and night, and a hidden famine fixed

![FirstFolk v0.21.0](blog/images/versions/v0.21.0.jpg)

### v0.22.0: the Many Valleys Pass: six valleys, bridges, callings and a modern face

![FirstFolk v0.22.0](blog/images/versions/v0.22.0.jpg)

### v0.23.0: the Saga Pass: a Crown to fight for, battles you watch, scouts and a story

![FirstFolk v0.23.0](blog/images/versions/v0.23.0.jpg)

### v0.23.1: measure decisions, not events: decisions a minute, Crown lead changes, settledness, ablation

![FirstFolk v0.23.1](blog/images/versions/v0.23.1.jpg)

### v0.24.0: the Steadings: four neutral folk won by caravans, a Crown filled by the voices of the valley

![FirstFolk v0.24.0](blog/images/versions/v0.24.0.jpg)

### v0.25.0: a town that grows up: farms, bread, ale and tools, homes that level up, prosperity gates the ranks

![FirstFolk v0.25.0](blog/images/versions/v0.25.0.jpg)

### v0.26.0: contest and crescendo: waylaid carts, winter ice, Last Wants, a Rally that costs, Wagon Train and Open Hands

![FirstFolk v0.26.0](blog/images/versions/v0.26.0.jpg)

### v0.27.0: clarity and feel: Watch a valley, a lighter top bar, a report that says how the valley was won

![FirstFolk v0.27.0](blog/images/versions/v0.27.0.jpg)

### v0.28.0: iterate: carts leave the wagon (a bot bug had hidden the steadings), a Crown of 1,500, stronger gifts

![FirstFolk v0.28.0](blog/images/versions/v0.28.0.jpg)

### v0.29.0: the three roads: a quieter screen, a Hearth voice, laden carts and hired spears

![FirstFolk v0.29.0](blog/images/versions/v0.29.0.jpg)

### v0.30.0: the Marches: an army you can read and grow, and Daughter Hamlets for room to expand

![FirstFolk v0.30.0](blog/images/versions/v0.30.0.jpg)

## Some thoughts

I really enjoyed this process and yet again it surprised me how capable AI is at developing things. However I'm not a game developer and really value what game devs do when thinking about the small details that impact the wider gameplay. As much as AI quickly made a good game, I could easily see how the codebase and decisions could grow out of hand and not be managed well.

A few other learnings:

- Start the simulation deterministic on day one.
- Instrument the thing you just added before you tune it. Per-minute curves for population, home level, stores and voices found more bugs than any amount of playing.
- Measure whether a decision matters. Ablation is cheap and it doesn't care about your feelings.
- Delete things. Some of the things Claude added had a negative impact on real life gameplay.
- Look at it. Headless screenshots of every UI state, on desktop and on a phone, found problems the numbers never would.
- Release often, and put the reasoning in the commit message. The 38 releases are the closest thing I have to a diary.
- Writing the design doc as I went, failed experiments included, meant I could find out why I'd done something three versions later.
- Image generation is cheap. Every logo, icon and crest in the game cost $3.98 in total.
- The soundtrack is synthesised in code and there's no audio file in the project, which I still find a bit mad.

This was an experiment to see what's possible, and I do feel a bit odd about how little of it I wrote myself. What I did do was play it, say what was wrong in plain English, and decide what was worth keeping, and I'm happy with that split. A human still has to tell me whether it's fun, because Claude can't.

The full design doc, failed experiments included, is in `docs/DESIGN.md`, and all 38 releases are at [github.com/Coysh/FirstFolk](https://github.com/Coysh/FirstFolk).
