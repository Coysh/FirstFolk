/**
 * Headless playtests. Usage: npm run sim -- --seed 3 --minutes 12 [--games 10] [--think 160] [--difficulty hard] [--quiet]
 * With --think equal to the rival's (normal 160), it is a fair AI-vs-AI duel: the balance harness.
 * --style / --rival-style pick bot personalities; --matrix plays every style against every other
 * (both sides, --games seeds each, --jobs in parallel) and prints the win matrix.
 */
import { playtest } from '../src/sim/playtest';
import type { Difficulty } from '../src/sim/rules';
import { ORIGIN_IDS } from '../src/sim/origins';
import { BOT_STYLES, type BotStyle } from '../src/sim/ai/styles';
import { runMatrix } from './matrix';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const str = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const seed = arg('seed', 1);
const minutes = arg('minutes', 12);
const games = arg('games', 1);
const think = arg('think', 100);
const difficulty = str('difficulty', 'normal') as Difficulty;
const quiet = args.includes('--quiet');
// --real: each game plays a rolled origin (cycling through all five) with the valley's omens.
const real = args.includes('--real');
const useOrigins = real || args.includes('--origins');
const useOmens = real || args.includes('--omens');
const style = (str('style', '') || undefined) as BotStyle | undefined;
const ablate = str('ablate', '') ? str('ablate', '').split(',') : undefined;
const rivalStyle = (str('rival-style', '') || undefined) as BotStyle | undefined;

if (args.includes('--duel')) {
  // One game for the matrix: a compact report on stdout.
  const r = playtest(seed, minutes, { think, difficulty, origin: useOrigins ? ORIGIN_IDS[arg('game', 0) % ORIGIN_IDS.length] : undefined, omens: useOmens, style, rivalStyle, ablate });
  const { timeline: _t, populationByMinute: _p, territoryByMinute: _tr, ...rest } = r;
  console.log('JSON:' + JSON.stringify(rest));
  process.exit(0);
}
if (args.includes('--matrix')) {
  const styles = (str('styles', '') ? str('styles', '').split(',') : BOT_STYLES) as BotStyle[];
  await runMatrix({ styles, seed, games, minutes, think, real, jobs: arg('jobs', 12), passthrough: [...args.filter((a) => a === '--origins' || a === '--omens'), ...(ablate ? ['--ablate', ablate.join(',')] : [])] });
  process.exit(0);
}

const reports: ReturnType<typeof playtest>[] = [];
for (let g = 0; g < games; g++) {
  const t0 = performance.now();
  const r = playtest(seed + g, minutes, { think, difficulty, origin: useOrigins ? ORIGIN_IDS[g % ORIGIN_IDS.length] : undefined, omens: useOmens, style, rivalStyle, ablate });
  reports.push(r);
  if (games === 1) {
    console.log(r.timeline.join('\n'));
    console.log('\npopulation/min:', r.populationByMinute.join(' '));
    console.log('territory/min:', r.territoryByMinute.join(' '));
    console.log('renown/min (you:rival):', r.renownByMinute.map(([a, b]) => `${a}:${b}`).join(' '));
    console.log('renown sources:', JSON.stringify(r.renownBy));
    console.log('voices/min (you:rival):', r.voicesByMinute.map(([a, b]) => `${a}:${b}`).join(' '));
    console.log('crown score/min (you minus rival):', r.scoreByMinute.join(' '));
  }
  if (!quiet || games === 1)
    console.log(
      `seed ${r.seed}${real ? ` [${r.origins.join(' v ')} | ${r.omens.join(', ')}]` : ''}: winner ${r.winner === 0 ? 'P' : r.winner === 1 ? 'RIVAL' : '-'}${r.byTime ? ' (time)' : ''} at ${r.victorySec < 0 ? '-' : `${(r.victorySec / 60).toFixed(1)}m`} · renown ${r.renownByMinute.at(-1)?.join(':')} · leads ${r.leadChanges} · comeback ${r.winnerDeficit} · flips ${r.holdingFlips} · idle ${r.idleAdultPct}% · major gap ${r.longestMajorGapSec}s · stock ${r.stockAt.join('/')} · chapters ${JSON.stringify(r.chapters)} · pop ${r.populationByMinute.at(-1)} · towers ${r.towers.join(':')} · battles ${r.battles} · news ${r.newsPerMinute}/min (${r.bannersPerGame} banners) · ${Math.round(performance.now() - t0)}ms`,
    );
}
if (games > 1) {
  const avg = (f: (r: (typeof reports)[0]) => number) => (reports.reduce((s, r) => s + f(r), 0) / reports.length).toFixed(1);
  const won = reports.filter((r) => r.victorySec >= 0);
  const lengths = won.map((r) => r.victorySec / 60).sort((a, b) => a - b);
  console.log(
    `\n${reports.length} games · P wins ${reports.filter((r) => r.winner === 0).length} · rival wins ${reports.filter((r) => r.winner === 1).length} · by time ${reports.filter((r) => r.byTime).length} · undecided ${reports.length - won.length}` +
      `\nlength min/median/max ${lengths[0]?.toFixed(1)}/${lengths[Math.floor(lengths.length / 2)]?.toFixed(1)}/${lengths.at(-1)?.toFixed(1)} min` +
      `\navg lead changes ${avg((r) => r.leadChanges)} · comebacks (winner was ≥100 behind) ${reports.filter((r) => r.winnerDeficit >= 100).length} · avg landmark flips ${avg((r) => r.holdingFlips)}` +
      `\nwants won P/R ${reports.reduce((n, r) => n + r.wantsWon[0], 0)}/${reports.reduce((n, r) => n + r.wantsWon[1], 0)} · allegiance flips ${avg((r) => r.allegianceFlips)} a game · caravans sent P/R ${avg((r) => r.caravans[0])}/${avg((r) => r.caravans[1])} a game` +
      `\nbattles the player saw: avg ${avg((r) => r.battles)} · games with none ${reports.filter((r) => !r.battles).length}` +
      `\navg idle ${avg((r) => r.idleAdultPct)}% · avg hungry ${avg((r) => r.hungryPct)}% (worst ${Math.max(...reports.map((r) => r.hungryPct))}%) · avg major gap ${avg((r) => r.longestMajorGapSec)}s · avg stock@20m ${avg((r) => r.stockAt[1] ?? 0)} · avg pop ${avg((r) => r.populationByMinute.at(-1) ?? 0)}`,
  );
  // The pacing contract in one line: actions a minute (things to look at, decide or do), by game minute and by minutes before the end.
  {
    const bucket = (from: number, to: number, fn: (r: (typeof reports)[0]) => number[]) => {
      const vals = reports.map((r) => {
        const a = fn(r).slice(from, to);
        return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
      }).filter((v) => !Number.isNaN(v));
      return vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1) : '-';
    };
    const abs = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 45]];
    console.log('actions/min by game minute: ' + abs.map(([a, b]) => `${a}-${b}m ${bucket(a, b, (r) => r.actionByMinute)}`).join(' · '));
    const lastTen = (r: (typeof reports)[0]) => r.actionByMinute.slice(-11, -1);
    const firstTen = (r: (typeof reports)[0]) => r.actionByMinute.slice(0, 10);
    const rel = (r: (typeof reports)[0], from: number) => r.actionByMinute.slice(Math.max(0, r.actionByMinute.length - from - 10), Math.max(0, r.actionByMinute.length - from));
    const mean = (xs: number[][]) => (xs.reduce((n, a) => n + a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), 0) / xs.length).toFixed(1);
    console.log(`actions/min: first 10 min ${mean(reports.map(firstTen))} · the 10 min before the last ${mean(reports.map((r) => rel(r, 10)))} · the LAST 10 min ${mean(reports.map(lastTen))}`);
  }
  // Decisions, settledness and boredom: are there choices all game, and is the game still open?
  {
    const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);
    const slice = (r: (typeof reports)[0], a: number, b: number) => mean(r.decisionsByMinute.slice(a, b));
    const mid = (a: number, b: number) => mean(reports.map((r) => Number(slice(r, a, b))));
    console.log(`decisions/min (player choices): 0-5m ${mid(0, 5)} · 5-15m ${mid(5, 15)} · 15-30m ${mid(15, 30)} · last 10 min ${mean(reports.map((r) => Number(mean(r.decisionsByMinute.slice(-11, -1)))))}`);
    console.log(`crown lead changes ${avg((r) => r.crownLeadChanges)} (games with none ${reports.filter((r) => !r.crownLeadChanges).length}) · crown comebacks after 20:00 (winner ≥150 behind) ${reports.filter((r) => r.crownComeback >= 150).length} · settledness ${avg((r) => r.settledness)} · longest bored stretch ${avg((r) => r.longestBoredMinutes)} min (worst ${Math.max(...reports.map((r) => r.longestBoredMinutes))})`);
  }
  // How each valley plays: length, who wins, and how much bridging the bots chose.
  const byValley: Record<string, typeof reports> = {};
  for (const r of reports) (byValley[r.valley] ??= []).push(r);
  console.log('by valley:', Object.entries(byValley).map(([v, rs]) => `${v} ×${rs.length} (P ${rs.filter((r) => r.winner === 0).length}:R ${rs.filter((r) => r.winner === 1).length}, bridges ${(rs.reduce((n, r) => n + r.bridges[0] + r.bridges[1], 0) / rs.length).toFixed(1)}/game, pop ${(rs.reduce((n, r) => n + (r.populationByMinute.at(-1) ?? 0), 0) / rs.length).toFixed(0)}, hungry ${(rs.reduce((n, r) => n + r.hungryPct, 0) / rs.length).toFixed(0)}%)`).join(' · '));
  const sources: Record<string, number> = {};
  for (const r of reports) for (const [k, v] of Object.entries(r.renownBy[0])) sources[k] = (sources[k] ?? 0) + (v ?? 0) / reports.length;
  console.log('avg player renown by source:', Object.entries(sources).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
  if (useOrigins) {
    // Opener balance: how each origin fares, whichever side played it.
    const tally: Record<string, [number, number]> = {};
    for (const r of reports)
      r.origins.forEach((o, i) => {
        const t = (tally[o || 'classic'] ??= [0, 0]);
        t[1]++;
        if (r.winner === i) t[0]++;
      });
    console.log('origin wins/games:', Object.entries(tally).map(([o, [w, n]]) => `${o} ${w}/${n}`).join(' · '));
  }
}
