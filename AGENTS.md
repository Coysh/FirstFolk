# FirstFolk: agent instructions

FirstFolk is a single-player, low-poly 3D settlement builder for the browser (TypeScript, Three.js, Preact). The design lives in [docs/DESIGN.md](docs/DESIGN.md) and the commands in [README.md](README.md).

**Top priority: gameplay enjoyment.** If a change is technically correct but makes the game slower, more confusing or more boring, it's a regression.

## Every change is a versioned commit on GitHub

The repo is `https://github.com/Coysh/FirstFolk.git` (`origin`, branch `main`). Every change, however small, ends with these steps:

1. Run `npm test` and `npm run typecheck`, and both must pass. For gameplay or balance changes, also run `npm run sim -- --seed 1 --minutes 30 --games 8`. For releases and render or UI changes, run `npm run build`.
2. Bump `version` in `package.json` with semver:
   - **patch** for fixes, balance and docs,
   - **minor** for new systems, buildings, mechanics or UI features,
   - **major** for breaking save formats once the game is 1.0.

   `npm version <patch|minor> --no-git-tag-version` does the bump.
3. Commit with a descriptive message that says what changed and why, starting with the version, e.g. `v0.3.0: frontier, fog and discoveries`.
4. Tag it `vX.Y.Z` and push with `git push --follow-tags origin main`.

Never commit `.env`, API keys, `node_modules`, `dist` or `screenshots`. The `.gitignore` already covers them.

## Project rules

- **Deterministic sim.** `src/sim/` is pure TS with no DOM. It must not use `Math.random`, `Date` or trigonometry; use `world.rng` and integer maths. Same seed and same commands give the same state hash. All player and AI input goes through `Command`s.
- **Saves.** Bump `SAVE_VERSION` in `src/sim/save.ts` whenever the saved state changes shape.
- **Pacing is tested.** Use `tests/pacing.test.ts` (the fun contract) and `npm run sim`. Read the per-minute population curve and the boredom report, not just pass/fail. A flat curve means something silently stalled.
- **Headless browser checks.** Use `node tools/screenshot.mjs --screen title|game --seed 3 --seconds 240 [--mobile]` with the dev server running. Don't edit `src/` while a headless run is in progress, because Vite hot reload resets the page.
- **Art.** Art is built with `npx tsx tools/assets/generate.ts`:
  - `gpt-image-1.5` for transparent images,
  - `gpt-image-2` for opaque art.

  `OPENAI_API_KEY` is read from the environment only and must never reach the client; `npm run build` scans `dist/`.
- **Keep it modular.** Content belongs in data tables (`defs.ts`, `trades.ts`, `boons.ts`, `events.ts`), not special-case code. The renderer maps ids to models.
- **Keep the docs current.** Update `docs/DESIGN.md`, both its design sections and its build log, whenever gameplay changes.
- **Style.** Match the surrounding code's naming, comment density and idiom.
