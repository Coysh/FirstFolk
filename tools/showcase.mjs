/**
 * A gallery of every building and landmark at gameplay zoom, for judging art in the real renderer.
 * Needs the dev server (npm run dev).
 *   node tools/showcase.mjs --set town|war|works|wild [--zoom 22] [--night 1] [--yaw 0.6] [--art classic] [--out file.png]
 * It starts a game, clears the ground and places finished buildings (or discovery props) in a grid:
 * only the picture matters here, not the sim.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const set = opt('set', 'town');
const zoom = Number(opt('zoom', '22'));
const night = Number(opt('night', '0'));
const yaw = Number(opt('yaw', '0.6'));
const art = opt('art', '');
const out = opt('out', `screenshots/showcase-${set}${night ? '-night' : ''}.png`);
const url = 'http://localhost:5173' + (art ? `/?art=${art}` : '');

const SETS = {
  town: [
    [['hut'], ['hut'], ['woodcutter', 0], ['woodcutter', 1], ['woodcutter', 2], ['forager', 0]],
    [['quarry', 0], ['quarry', 2], ['sawpit'], ['forester'], ['fisher'], ['storehouse']],
    [['longhouse'], ['outpost'], ['lookout'], ['wagon', 3]],
  ],
  war: [
    [['watchtower'], ['stockade'], ['musterhall'], ['lookout'], ['outpost']],
    [['longhouse'], ['hut'], ['hut'], ['storehouse']],
  ],
  works: [[['henge'], ['meadhall'], ['granary']]],
  wild: [
    [['cart'], ['ruins'], ['wanderers'], ['stones'], ['starstone'], ['barrow']],
    [['hermit'], ['hoard'], ['spring'], ['shrine'], ['grove'], ['oakwood'], ['outcrop']],
  ],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.firstfolk?.shell, null, { timeout: 30000 });
await page.evaluate(() => window.firstfolk.shell.newGame(3, 'normal'));
await page.waitForFunction(() => window.firstfolk.shell.screen.value === 'game', null, { timeout: 60000 });

const centre = await page.evaluate(
  ({ rows, set }) => {
    const game = window.firstfolk.shell.game;
    const w = game.world;
    const wagon = [...w.buildings.values()].find((b) => b.type === 'wagon');
    // Find the dry patch nearest the wagon that fits the whole grid, clear it and reveal it.
    const gap = set === 'works' ? 7 : 5;
    const W = Math.max(...rows.map((r) => r.length)) * gap + 3;
    const H = rows.length * gap + 3;
    const dry = (x, y) => w.inBounds(x, y) && [2, 3, 4].includes(w.map.terrain[w.idx(x, y)]);
    let best = null;
    for (let y = 4; y < w.size - H - 4; y += 2)
      for (let x = 4; x < w.size - W - 4; x += 2) {
        const d = Math.hypot(x + W / 2 - wagon.x, y + H / 2 - wagon.y);
        if (best && d >= best.d) continue;
        let ok = true;
        for (let yy = y; yy < y + H && ok; yy += 2) for (let xx = x; xx < x + W && ok; xx += 2) ok = dry(xx, yy);
        if (ok) best = { x, y, d };
      }
    const x0 = best.x;
    const y0 = best.y;
    for (const n of [...w.nodes.values()]) if (n.x >= x0 - 2 && n.x <= x0 + W && n.y >= y0 - 2 && n.y <= y0 + H) w.removeNode(n);
    for (let y = y0 - 3; y <= y0 + H + 3; y++) for (let x = x0 - 3; x <= x0 + W + 3; x++) if (w.inBounds(x, y)) w.explored[w.idx(x, y)] |= 3;
    let id = 9000;
    rows.forEach((row, r) =>
      row.forEach(([type, tier], c) => {
        const x = x0 + c * gap;
        const y = y0 + r * gap;
        if (set === 'wild') {
          w.sites.push({ id: id++, kind: type, x, y, revealed: 3, claimedBy: -1, heldBy: ['grove', 'oakwood', 'outcrop', 'stones', 'starstone', 'spring', 'shrine'].includes(type) ? 0 : -1 });
        } else {
          const b = w.addBuilding(type, 0, x, y, true);
          if (tier) b.tier = tier;
          if (type === 'hut' || type === 'longhouse') b.familyId = [...w.families.values()][c % w.families.size]?.id ?? 0;
        }
      }),
    );
    game.view.rig.lookAt(x0 + W / 2 - 1.5, y0 + H / 2 - 1.5, true);
    return { x: x0 + W / 2, y: y0 + H / 2 };
  },
  { rows: SETS[set], set },
);
await page.evaluate(
  ({ zoom, yaw, night }) => {
    const v = window.firstfolk.shell.game.view;
    v.rig.goalDistance = zoom;
    v.rig.yaw = v.rig.goalYaw = yaw;
    if (night) {
      v.time = 110; // the sun is well down at this point of the day
      v.dayAmt = 1 - night;
    }
  },
  { zoom, yaw, night },
);
await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Later') b.click(); });
await page.waitForTimeout(5000);
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`saved ${out}`, centre);
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
