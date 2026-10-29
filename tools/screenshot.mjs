/**
 * Headless visual check. Needs the dev server running (npm run dev).
 *   node tools/screenshot.mjs --screen title|game [--seed 3] [--seconds 240] [--mobile] [--zoom 30] [--out file.png]
 *     [--art classic]       code-built models instead of the Blender ones (for A/B)
 *     [--focus hut]         centre the camera on the first building of that type (and list what exists)
 *     [--yaw 0.6]           camera yaw, radians
 *     [--perf]              print draw calls, triangles and mean frame time
 *     [--open valley]       open a sheet (valley|town|log|goals) before the shot
 *     [--cat make]          open a build category
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
const art = opt('art', '');
const url = opt('url', 'http://localhost:5173') + (art ? `/?art=${art}` : '');
const focus = opt('focus', '');
const yaw = opt('yaw', '');
const perf = args.includes('--perf');
const openSheet = opt('open', '');
const cat = opt('cat', '');
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
  if (yaw) {
    await page.evaluate((y) => { const r = window.firstfolk.shell.game.view.rig; r.yaw = r.goalYaw = Number(y); }, yaw);
  }
  if (focus) {
    const found = await page.evaluate((type) => {
      const w = window.firstfolk.shell.game.world;
      const all = [...w.buildings.values()].filter((b) => b.owner === 0);
      const b = all.find((x) => x.type === type);
      if (b) window.firstfolk.shell.game.view.rig.lookAt(b.x + 1, b.y + 1, true);
      return { have: [...new Set(all.map((x) => x.type + (x.tier ? ':' + x.tier : '')))], found: !!b };
    }, focus);
    console.log('buildings:', found.have.join(', '), found.found ? '' : `(no ${focus}!)`);
    await page.waitForTimeout(1500);
  }
  if (openSheet || cat) {
    await page.evaluate(async ([s, c]) => {
      const st = await import('/src/ui/state.ts');
      if (s) st.sheet.value = s;
      if (c) st.buildCat.value = c;
    }, [openSheet, cat]);
    await page.waitForTimeout(800);
  }
  if (perf) {
    const r = await page.evaluate(async () => {
      const g = window.firstfolk.shell.game;
      const t0 = performance.now();
      let frames = 0;
      await new Promise((res) => { const f = () => (performance.now() - t0 > 4000 ? res() : (frames++, requestAnimationFrame(f))); f(); });
      const info = g.view.renderer.info.render;
      return { calls: info.calls, triangles: info.triangles, settlers: g.world.settlers.size, buildings: g.world.buildings.size, ms: (performance.now() - t0) / frames };
    });
    console.log('perf:', JSON.stringify(r));
  }
}
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`saved ${out}`);
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
