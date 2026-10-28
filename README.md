# FirstFolk

A fast, single-player, low-poly 3D settlement builder for the browser. It has Settlers-style physical logistics, plus families who learn, specialise, marry and pass skills (and boons) down the generations. You grow a border across a fogged valley, claim discoveries, weather the winters and race a rival town to renown. The design is in [docs/DESIGN.md](docs/DESIGN.md).

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (title screen → New Game / Continue)
npm test             # Vitest: sim determinism, mapgen, pathing, placement, gameplay loop, pacing
npm run sim -- --seed 1 --minutes 35 [--games 8]   # headless playtests: timeline + boredom report (major-beat gaps, discoveries, race result)
npm run build        # typecheck + production build + secret scan of dist/
node tools/screenshot.mjs --screen title|game --seed 3 --seconds 240 [--mobile]   # headless screenshot (needs the dev server)
npx tsx tools/assets/generate.ts [--force id…]   # regenerate art with the OpenAI Images API (needs OPENAI_API_KEY)
```

## Controls

| | Desktop | Touch |
|---|---|---|
| Pan | drag, WASD / arrows | one-finger drag |
| Zoom | wheel, + / − | pinch |
| Rotate | right-drag, Q / E (90° snaps) | two-finger twist |
| Build | 1–9, 0, − or the build shelf, click to place (Shift keeps placing) | tap a card, tap the ground, **Build here** |
| Choose | click a boon card or an event option (both resolve themselves if ignored) | tap |
| Explore | click a row in *Out in the wild* to fly to a discovery | tap |
| Select | click a settler or building | tap |
| Other | Space pauses, Esc cancels or opens the menu, F focuses the selection, Del demolishes | ☰ opens the menu |

## Layout

- `src/sim/` is the deterministic simulation (pure TS, no DOM, runs headless). All input goes through `Command`s.
- `src/render/` is the Three.js views: terrain, instanced nature and settlers, code-built models, effects and camera.
- `src/input/` handles pointer, touch and keyboard. `src/ui/` holds the Preact screens (title, loading, menus) and HUD.
- `src/shell.ts` is the app flow (title → loading → game) on one shared WebGL renderer. `src/game.ts` is the in-game glue and fixed-timestep loop.
- `src/audio/` is procedural WebAudio (no sound files). `public/assets/` holds the generated icons, logo and illustrations.
- `tools/` holds the headless playtest runner, the screenshot tool and the dist secret check.
