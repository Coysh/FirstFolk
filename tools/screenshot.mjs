/**
 * Headless visual check. Needs the dev server running (npm run dev).
 *   node tools/screenshot.mjs --screen title|game [--seed 3] [--seconds 240] [--mobile] [--zoom 30] [--out file.png]
 * In game mode it starts a New Game, fast-forwards the simulation with the scripted bot,
 * then lets the renderer settle before capturing.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const url = opt('url', 'http://localhost:5173');
const screen = opt('screen', 'game');
const seed = Number(opt('seed', '3'));
const seconds = Number(opt('seconds', '0'));
const mobile = args.includes('--mobile');
const zoom = opt('zoom', '');
const out = opt('out', `screenshots/${screen}-${mobile ? 'mobile' : 'desktop'}-${seed}-${seconds}s.png`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });

if (screen === 'title') {
  await page.waitForFunction(() => window.firstfolk.shell.menuReady.value, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
} else {
  await page.evaluate((s) => window.firstfolk.shell.newGame(s, 'normal'), seed);
  await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
  if (seconds > 0) {
    await page.evaluate(async (secs) => {
      const { OpeningBot } = await import('/src/sim/ai/openingBot.ts');
      const game = window.firstfolk.shell.game;
      const bot = new OpeningBot();
      for (let i = 0; i < secs * 10; i++) {
        bot.update(game.world);
        game.view.beforeTick();
        game.world.step();
      }
      game.view.handleEvents(game.world.drainEvents());
      game.toasts.value = [];
    }, seconds);
  }
  await page.waitForTimeout(3500);
  if (zoom) {
    await page.evaluate((z) => (window.firstfolk.shell.game.view.rig.goalDistance = Number(z)), zoom);
    await page.waitForTimeout(1500);
  }
}
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`saved ${out}`);
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
