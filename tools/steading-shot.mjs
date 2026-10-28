import { chromium } from 'playwright';
const out = process.argv[2] ?? 'screenshots/steading.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 880 } })).newPage();
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate((s) => window.firstfolk.shell.newGame(s, 'normal'), 3);
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
await page.evaluate(async () => {
  const { OpeningBot } = await import('/src/sim/ai/openingBot.ts');
  const game = window.firstfolk.shell.game; const bot = new OpeningBot();
  for (let i = 0; i < 7200; i++) { bot.update(game.world); game.view.beforeTick(); game.world.step(); }
  game.view.handleEvents(game.world.drainEvents()); game.toasts.value = [];
  const s = game.world.sites.filter((x) => x.st).sort((a, b) => b.st.favour[0] - a.st.favour[0])[0];
  game.view.rig.lookAt(s.x + 0.5, s.y + 0.5, true);
  game.view.rig.goalDistance = 14;
});
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
