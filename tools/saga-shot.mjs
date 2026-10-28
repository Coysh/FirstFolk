/**
 * Screenshots of the Crown phase: the New Game picker, then a game fast-forwarded to just after the
 * Kingstone falls (story card, race panel, the stone itself). Needs the dev server.
 *   node tools/saga-shot.mjs [--seed 3] [--seconds 990] [--mobile]
 */
import { chromium, devices } from 'playwright';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('seed', '3'));
const seconds = Number(opt('seconds', '990'));
const mobile = args.includes('--mobile');
const tag = mobile ? 'm' : 'd';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.waitForFunction(() => window.firstfolk.shell.menuReady.value, null, { timeout: 60000 });
// The New Game screen.
await page.click('button:has-text("New Game")');
await page.waitForSelector('.valley-pick', { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `screenshots/saga-newgame-${tag}.png` });
// A game, fast-forwarded with the bot to just after the star falls.
await page.evaluate((s) => window.firstfolk.shell.newGame(s, 'normal'), seed);
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
await page.evaluate(async (secs) => {
  const { OpeningBot } = await import('/src/sim/ai/openingBot.ts');
  const game = window.firstfolk.shell.game;
  const bot = new OpeningBot();
  for (let i = 0; i < secs * 10; i++) {
    bot.update(game.world);
    game.view.beforeTick();
    game.world.step();
    if (i % 50 === 0) game.view.handleEvents(game.world.drainEvents());
  }
  game.view.handleEvents(game.world.drainEvents());
  game.toasts.value = [];
  for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Later') b.click();
}, seconds);
const info = await page.evaluate(() => {
  const g = window.firstfolk.shell.game;
  const w = g.world;
  const site = w.crown && w.sites.find((s) => s.id === w.crown.siteId);
  if (site) { g.lookAt(site.x, site.y); g.view.rig.goalDistance = 12; }
  return { tick: w.tick, crown: w.crown, saga: w.saga, story: g.story.value, site: site && { x: site.x, y: site.y } };
});
console.log(JSON.stringify(info));
await page.waitForTimeout(3500);
await page.screenshot({ path: `screenshots/saga-crown-${tag}.png` });
await page.evaluate(() => { const g = window.firstfolk.shell.game; g.dismissStory(); g.view.rig.goalDistance = 6; });
await page.waitForTimeout(2500);
await page.screenshot({ path: `screenshots/saga-stone-${tag}.png` });
if (errors.length) console.log('ERRORS:', [...new Set(errors)].join('\n'));
await browser.close();
