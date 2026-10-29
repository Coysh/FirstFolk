/** Watch a valley: start a spectator game and capture it after N seconds: node tools/watch-shot.mjs [seed] [seconds] [out] (needs the dev server). */
import { chromium } from 'playwright';
const seed = Number(process.argv[2] ?? 5);
const seconds = Number(process.argv[3] ?? 900);
const out = process.argv[4] ?? 'screenshots/watch.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 880 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate((s) => window.firstfolk.shell.watchGame(s), seed);
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
await page.evaluate((secs) => {
  const game = window.firstfolk.shell.game;
  for (let i = 0; i < secs * 10; i++) { game.view.beforeTick(); game.world.step(); }
  game.view.handleEvents(game.world.drainEvents()); game.toasts.value = [];
}, seconds);
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log('saved', out, errors.length ? errors.slice(0, 3) : 'no page errors');
await browser.close();
