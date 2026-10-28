/**
 * Stages a raid and screenshots the clash: the march arrives, the line moves, a Rally is called.
 * Needs the dev server. node tools/clash-shot.mjs [--seed 3] [--defend 1] [--night 0]
 *   --defend 1  the rival raids YOUR post (shows the Rally button); default: your huscarls raid the rival's.
 */
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('seed', '3'));
const defend = Number(opt('defend', '0'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate((s) => window.firstfolk.shell.newGame(s, 'normal'), seed);
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });
const info = await page.evaluate(async (defendArg) => {
  const game = window.firstfolk.shell.game;
  const w = game.world;
  const atk = defendArg ? 1 : 0;
  const def = 1 - atk;
  w.tick = Math.max(w.tick, 6000);
  w.explored.fill(3);
  w.ais = [];
  for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Later') b.click();
  const home = [...w.buildings.values()].find((b) => b.owner === atk && b.type === 'wagon');
  const dhome = [...w.buildings.values()].find((b) => b.owner === def && b.type === 'wagon');
  const dir = Math.sign(dhome.x - home.x) || 1;
  const hall = w.addBuilding('musterhall', atk, home.x + 3 * dir, home.y - 4, true);
  const adults = [...w.settlers.values()].filter((s) => s.owner === atk && !s.child).slice(0, 5);
  for (const s of adults) { s.job = { kind: 'guard', buildingId: hall.id, phase: 'watch' }; s.x = hall.x; s.y = hall.y + 2; }
  const tx = home.x + 14 * dir;
  const target = w.addBuilding('stockade', def, tx, home.y + 1, true);
  target.guarded = 2;
  // The defender's townsfolk are close by, so a rally has someone to call.
  for (const s of w.settlers.values()) if (s.owner === def && !s.child) { s.x = tx; s.y = home.y + 4; }
  w.enqueue({ type: 'raid', owner: atk, targetId: target.id });
  w.step();
  let n = 0;
  while (!w.warbands.some((b) => b.phase === 'clash') && n++ < 1500) w.step();
  game.view.handleEvents(w.drainEvents());
  game.lookAt(target.x, target.y);
  game.view.rig.goalDistance = 8;
  return { atk, ticks: n, target: { x: target.x, y: target.y }, band: w.warbands[0] && { strength: w.warbands[0].strength, clash: w.warbands[0].clash } };
}, defend);
console.log(JSON.stringify(info));
const focus = async () => page.evaluate(() => {
  const g = window.firstfolk.shell.game;
  const b = g.world.warbands.find((x) => x.phase === 'clash');
  if (!b) return;
  const t = g.world.buildings.get(b.targetId);
  const ps = [...g.view.settlers.positions.values()].filter((p) => Math.hypot(p.x - t.x, p.z - t.y) < 5);
  if (ps.length) g.view.rig.lookAt(ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length);
});
await focus();
await page.waitForTimeout(2500);
await page.screenshot({ path: `screenshots/clash-1${defend ? 'd' : 'a'}.png` });
// The defender rallies (the player presses G, or the rival's AI does).
await page.evaluate((defendArg) => { const g = window.firstfolk.shell.game; if (defendArg) g.rally(); else g.world.enqueue({ type: 'rally', owner: 1 }); }, defend);
await page.waitForTimeout(2500);
await focus();
await page.waitForTimeout(1200);
await page.screenshot({ path: `screenshots/clash-2${defend ? 'd' : 'a'}.png` });
await page.waitForTimeout(6000);
await page.screenshot({ path: `screenshots/clash-3${defend ? 'd' : 'a'}.png` });
if (errors.length) console.log('ERRORS:', [...new Set(errors)].join('\n'));
await browser.close();
