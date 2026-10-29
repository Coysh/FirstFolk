/**
 * Every in-game UI state in one run (one fast-forward): base, valley, town, chronicle, goals, a selected building, a clash.
 *   node tools/ui-states.mjs [--mobile] [--seed 3] [--seconds 900] [--url http://localhost:5173] [--only valley,town]
 * Writes screenshots/ui-<state>-<desktop|mobile>.png. Needs the dev server.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const mobile = args.includes('--mobile');
const seed = Number(opt('seed', '3'));
const seconds = Number(opt('seconds', '900'));
const url = opt('url', 'http://localhost:5173');
const only = opt('only', '').split(',').filter(Boolean);
const tag = mobile ? 'mobile' : 'desktop';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
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
  }
  game.view.handleEvents(game.world.drainEvents());
  game.toasts.value = [];
  game.story.value = null;
}, seconds);
await page.waitForTimeout(3000);
mkdirSync('screenshots', { recursive: true });

const shot = async (name, setup) => {
  if (only.length && !only.includes(name)) return;
  await page.evaluate(setup);
  await page.waitForTimeout(1500);
  console.log(name, await page.evaluate(async () => { const st = await import('/src/ui/state.ts'); return { sheet: st.sheet.value, dom: [...document.querySelectorAll('.sheet')].map((e) => e.className) }; }));
  await page.screenshot({ path: `screenshots/ui-${name}-${tag}.png` });
  console.log('saved', name);
  await page.evaluate(async () => {
    const st = await import('/src/ui/state.ts');
    st.sheet.value = null;
    window.firstfolk.shell.game.selection.value = null;
  });
};

await shot('base', () => {});
await shot('valley', async () => (await import('/src/ui/state.ts')).sheet.value = 'valley');
await shot('town', async () => (await import('/src/ui/state.ts')).sheet.value = 'town');
await shot('log', async () => {
  const g = window.firstfolk.shell.game;
  g.notify({ channel: 'toast', priority: 2, icon: '/assets/icons/scroll.png', text: 'A steading stands with you', tone: 'good' });
  g.notify({ channel: 'toast', priority: 3, icon: '/assets/icons/shield.png', text: '⚔ Raiders march on your Watchtower!', tone: 'warn' });
  (await import('/src/ui/state.ts')).sheet.value = 'log';
});
await shot('goals', async () => (await import('/src/ui/state.ts')).sheet.value = 'goals');
await shot('select', () => {
  const g = window.firstfolk.shell.game;
  const b = [...g.world.buildings.values()].find((x) => x.owner === 0 && x.done && x.type === 'lookout') ?? [...g.world.buildings.values()].find((x) => x.owner === 0 && x.done);
  g.selection.value = { kind: 'building', id: b.id };
});
await shot('story', () => {
  window.firstfolk.shell.game.story.value = { beat: 3 };
});
await shot('place', () => {
  window.firstfolk.shell.game.startPlacing('hut');
});
await page.evaluate(() => window.firstfolk.shell.game.cancel());
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
