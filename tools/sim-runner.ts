/**
 * Headless playtests. Usage: npm run sim -- --seed 3 --minutes 12 [--games 10] [--think 160] [--difficulty hard] [--quiet]
 * With --think equal to the rival's (normal 160), it is a fair AI-vs-AI duel: the balance harness.
 */
import { playtest } from '../src/sim/playtest';
import type { Difficulty } from '../src/sim/rules';

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

const reports: ReturnType<typeof playtest>[] = [];
for (let g = 0; g < games; g++) {
  const t0 = performance.now();
  const r = playtest(seed + g, minutes, { think, difficulty });
  reports.push(r);
  if (games === 1) {
    console.log(r.timeline.join('\n'));
    console.log('\npopulation/min:', r.populationByMinute.join(' '));
    console.log('territory/min:', r.territoryByMinute.join(' '));
    console.log('renown/min (you:rival):', r.renownByMinute.map(([a, b]) => `${a}:${b}`).join(' '));
    console.log('renown sources:', JSON.stringify(r.renownBy));
  }
  if (!quiet || games === 1)
    console.log(
      `seed ${r.seed}: winner ${r.winner === 0 ? 'P' : r.winner === 1 ? 'RIVAL' : '-'}${r.byTime ? ' (time)' : ''} at ${r.victorySec < 0 ? '-' : `${(r.victorySec / 60).toFixed(1)}m`} · renown ${r.renownByMinute.at(-1)?.join(':')} · leads ${r.leadChanges} · comeback ${r.winnerDeficit} · flips ${r.holdingFlips} · idle ${r.idleAdultPct}% · major gap ${r.longestMajorGapSec}s · stock ${r.stockAt.join('/')} · chapters ${JSON.stringify(r.chapters)} · pop ${r.populationByMinute.at(-1)} · ${Math.round(performance.now() - t0)}ms`,
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
      `\navg idle ${avg((r) => r.idleAdultPct)}% · avg major gap ${avg((r) => r.longestMajorGapSec)}s · avg stock@20m ${avg((r) => r.stockAt[1] ?? 0)} · avg pop ${avg((r) => r.populationByMinute.at(-1) ?? 0)}`,
  );
  const sources: Record<string, number> = {};
  for (const r of reports) for (const [k, v] of Object.entries(r.renownBy[0])) sources[k] = (sources[k] ?? 0) + (v ?? 0) / reports.length;
  console.log('avg player renown by source:', Object.entries(sources).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
}
