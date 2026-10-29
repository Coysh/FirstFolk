/** Where does a bot's economy stall? Prints stores, builds in progress and home level each minute. npx tsx tools/debug-bot.ts [style] [seed] [minutes] */
import { OpeningBot } from '../src/sim/ai/openingBot';
import { World } from '../src/sim/world';
import type { BotStyle } from '../src/sim/ai/styles';
import { TICK_HZ } from '../src/sim/balance';
import { prosperity } from '../src/sim/prosperity';

const style = (process.argv[2] ?? 'hearth') as BotStyle;
const seed = Number(process.argv[3] ?? 11);
const minutes = Number(process.argv[4] ?? 20);
const world = new World({ seed, rivalStyle: 'balanced' });
const bot = new OpeningBot(0, 160, 0, style);
world.players[0].style = style;
for (let i = 0; i < minutes * 60 * TICK_HZ; i++) {
  bot.update(world);
  world.step();
  world.drainEvents();
  if (world.tick % (60 * TICK_HZ) === 0) {
    const mine = [...world.buildings.values()].filter((b) => b.owner === 0);
    const sites = mine.filter((b) => !b.done).map((b) => b.type);
    const done: Record<string, number> = {};
    for (const b of mine) if (b.done) done[b.type] = (done[b.type] ?? 0) + 1;
    const s = (g: string) => world.stored(0, g as never);
    console.log(`${String(world.tick / 600).padStart(2)}m prosp ${prosperity(world, 0)} lvl ${world.players[0].homeLevel} ${world.players[0].calling.id}${world.players[0].calling.tier} rank ${world.players[0].rank} pop ${world.population(0)}/${world.housing(0)} logs ${s('logs')} planks ${s('planks')} stone ${s('stone')} berries ${s('berries')} grain ${s('grain')} bread ${s('bread')} ale ${s('ale')} tools ${s('tools')} | sites ${sites.join(',') || '-'} | ${Object.entries(done).map(([k, v]) => `${k}${v}`).join(' ')}`);
  }
}
