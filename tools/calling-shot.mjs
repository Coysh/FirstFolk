/** Screenshots of each calling's cluster beside the hall. Needs the dev server. node tools/calling-shot.mjs [--tier 2] [--night 0] [--zoom 11] */
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const tier = Number(opt('tier', '2'));
const zoom = Number(opt('zoom', '11'));
const night = Number(opt('night', '0'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate(() => window.firstfolk.shell.newGame(3, 'normal'));
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
await page.evaluate(async (zoom) => {
  const g = window.firstfolk.shell.game;
  const w = g.world;
  w.players[0].rank = 3;
  const hall = [...w.buildings.values()].find((b) => b.type === 'wagon');
  hall.tier = 3;
  g.view.rig.lookAt(hall.x - 1.2, hall.y, true);
  g.view.rig.goalDistance = zoom;
  for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Later') b.click();
  g.togglePause();
}, zoom);
for (const id of ['trader', 'masons', 'stronghold', 'hearth']) {
  await page.evaluate(({ id, tier, night }) => {
    const g = window.firstfolk.shell.game;
    g.world.players[0].calling = { id, tier };
    if (night) { g.view.time = 110; g.view.dayAmt = 1 - night; }
  }, { id, tier, night });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `screenshots/calling-${id}${night ? '-night' : ''}.png`, clip: { x: 200, y: 120, width: 800, height: 520 } });
  console.log('saved', id);
}
if (errors.length) console.log('ERRORS:', [...new Set(errors)].join('\n'));
await browser.close();
