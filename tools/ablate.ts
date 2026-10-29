/**
 * Ablation: does a decision matter? A mirror match (both bots the same style, a fair duel) where the
 * player bot never takes one kind of decision; the cost in win rate is what that decision is worth.
 * Usage: npx tsx tools/ablate.ts [--games 40] [--seed 100] [--minutes 46] [--style balanced] [--kinds scout,deed,raid,bridge,rally,caravan]
 */
import { playtest } from '../src/sim/playtest';
import type { BotStyle } from '../src/sim/ai/styles';

const args = process.argv.slice(2);
const str = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const games = Number(str('games', '40'));
const seed = Number(str('seed', '100'));
const minutes = Number(str('minutes', '46'));
const style = str('style', 'balanced') as BotStyle;
const kinds = str('kinds', 'scout,deed,raid,bridge,rally,caravan').split(',');

function winRate(ablate: string[]) {
  let wins = 0;
  let decided = 0;
  let decisions = 0;
  for (let g = 0; g < games; g++) {
    const r = playtest(seed + g, minutes, { think: 160, style, rivalStyle: style, ablate });
    if (r.winner >= 0) {
      decided++;
      if (r.winner === 0) wins++;
    }
    decisions += r.decisionsByMinute.reduce((a, b) => a + b, 0);
  }
  return { rate: (100 * wins) / Math.max(1, decided), decisions: decisions / games };
}

const base = winRate([]);
console.log(`baseline (mirror ${style}, ${games} games): player wins ${base.rate.toFixed(0)}% · ${base.decisions.toFixed(0)} decisions a game`);
for (const k of kinds) {
  const r = winRate([k]);
  const cost = base.rate - r.rate;
  console.log(`without ${k.padEnd(7)}: player wins ${r.rate.toFixed(0)}% (cost ${cost >= 0 ? '+' : ''}${cost.toFixed(0)} points) · ${r.decisions.toFixed(0)} decisions a game ${cost < 8 ? '  <- barely matters' : ''}`);
}
