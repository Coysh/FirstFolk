# FirstFolk

A fast, single-player, low-poly 3D settlement builder for the browser. It has Settlers-style physical logistics, farms, bakehouses and forges that make a town visibly grow up, and a valley of neutral steadings you win with ox-cart caravans. You push a living border across a fogged valley, race a rival town for the favour of the steadings (and a Kingstone that falls from the sky), call on your great houses' powers, and fill the Crown before the clock runs out. The design is in [docs/DESIGN.md](docs/DESIGN.md).

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (title screen → New Game / Continue)
npm test             # Vitest: sim determinism, mapgen, pathing, placement, gameplay loop, pacing
npm run sim -- --seed 1 --minutes 46 [--games 16] [--think 160] [--ablate scout,deed,raid,bridge,rally,caravan,hire]   # headless playtests (decisions a minute, Crown lead changes, settledness; --ablate skips a decision type); --think 160 is a fair AI-vs-AI duel (length, lead changes, comebacks, landmark flips, renown sources)
npm run build        # typecheck + production build + secret scan of dist/
node tools/screenshot.mjs --screen title|game --seed 3 --seconds 240 [--mobile]   # headless screenshot (needs the dev server); also --focus hut, --art classic (A/B), --perf
node tools/showcase.mjs --set town|war|works|wild [--night 1] [--zoom 24]   # gallery of every model at gameplay zoom (needs the dev server)
npx tsx tools/valleys.ts [--seeds 300] [--pick 1,2,3]   # contact sheet of the six valleys + generator stats (screenshots/valleys.png)
npx tsx tools/ablate.ts [--games 40]   # does a decision matter? a mirror match where the player bot never takes one kind of decision
node tools/steading-shot.mjs / tools/town-shot.mjs   # a steading, and a grown-up town, at gameplay zoom
node tools/bridge-shot.mjs / tools/calling-shot.mjs   # screenshots of bridge mode and each calling's cluster (needs the dev server)
Blender -b -P tools/blender/build.py   # rebuild public/models/*.glb (or run build.py through the Blender MCP)
npx tsx tools/assets/generate.ts [--force id…]   # regenerate art with the OpenAI Images API (needs OPENAI_API_KEY)
```

## Controls

| | Desktop | Touch |
|---|---|---|
| Pan | drag, WASD / arrows | one-finger drag |
| Zoom | wheel, + / − | pinch |
| Rotate | right-drag, Q / E (90° snaps) | two-finger twist |
| Build | 1–9, 0, − or the build shelf, click to place (Shift keeps placing) | tap a card, tap the ground, **Build here** |
| Deeds | Z X C V or click a Great House; targeted deeds then take a click on the map | tap |
| Steadings | 🛒 beside a steading in the Crown card sends a cart with what it asks for | tap |
| Explore | click a row in *Out in the wild* to fly to a discovery | tap |
| Select | click a settler or building | tap |
| Letters | decisions wait in the ledger at the left: open one when convenient | tap |
| Sound | M mutes, or the 🔊 button; volumes for music, ambience and effects in Settings | 🔊 button |
| Other | Space pauses, Esc cancels or opens the menu, F focuses the selection, Del demolishes | ☰ opens the menu |

## Layout

- `src/sim/` is the deterministic simulation (pure TS, no DOM, runs headless). All input goes through `Command`s.
- `src/render/` is the Three.js views: terrain, instanced nature and settlers, code-built models, effects and camera.
- `src/input/` handles pointer, touch and keyboard. `src/ui/` holds the Preact screens (title, loading, menus) and HUD.
- `src/shell.ts` is the app flow (title → loading → game) on one shared WebGL renderer. `src/game.ts` is the in-game glue and fixed-timestep loop.
- `src/audio/` is procedural WebAudio (no sound files). `public/assets/` holds the generated icons, logo and illustrations.
- `tools/` holds the headless playtest runner, the screenshot tool, the dist secret check and the Blender model pipeline (`tools/blender`).
