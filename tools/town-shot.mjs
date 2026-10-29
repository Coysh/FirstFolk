/** A late-game screenshot of the player's town, to see the new chains: node tools/town-shot.mjs [seed] [seconds] [out] (needs the dev server). */
import { chromium } from 'playwright';
const seed = Number(process.argv[2] ?? 3);
const seconds = Number(process.argv[3] ?? 1500);
const out = process.argv[4] ?? 'screenshots/town.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 880 } })).newPage();
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate((s) => window.firstfolk.shell.newGame(s, 'normal'), seed);
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
await page.evaluate(async (secs) => {
  const { OpeningBot } = await import('/src/sim/ai/openingBot.ts');
  const game = window.firstfolk.shell.game; const bot = new OpeningBot();
  for (let i = 0; i < secs * 10; i++) { bot.update(game.world); game.view.beforeTick(); game.world.step(); }
  game.view.handleEvents(game.world.drainEvents()); game.toasts.value = [];
  const b = [...game.world.buildings.values()].find((x) => x.owner === 0 && x.type === 'bakehouse') ?? game.world.buildings.values().next().value;
  game.view.rig.lookAt(b.x + 1, b.y + 1, true);
  game.view.rig.goalDistance = 17;
}, seconds);
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
