/**
 * Headless playtests. Usage: npm run sim -- --seed 3 --minutes 12 [--games 10]
 */
import { playtest } from '../src/sim/playtest';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const seed = arg('seed', 1);
const minutes = arg('minutes', 12);
const games = arg('games', 1);

const reports: ReturnType<typeof playtest>[] = [];
for (let g = 0; g < games; g++) {
  const t0 = performance.now();
  const r = playtest(seed + g, minutes);
  reports.push(r);
  if (games === 1) {
    console.log(r.timeline.join('\n'));
    console.log('\npopulation/min:', r.populationByMinute.join(' '));
    console.log('territory/min:', r.territoryByMinute.join(' '));
  }
  console.log(
    `seed ${r.seed}: first logs ${r.firstLogsSec}s · chapters ${JSON.stringify(r.chapters)} · 1st journeyman ${r.firstJourneymanSec}s · idle ${r.idleAdultPct}% · quiet ${r.longestQuietSec}s · major gap ${r.longestMajorGapSec}s · 1st discovery ${r.firstDiscoverySec}s · claimed ${r.claimed} · land ${r.territoryByMinute.at(-1)} · pop ${r.populationByMinute.at(-1)} · ${Math.round(performance.now() - t0)}ms`,
  );
}
if (games > 1) {
  const avg = (f: (r: (typeof reports)[0]) => number) => (reports.reduce((s, r) => s + f(r), 0) / reports.length).toFixed(1);
  console.log(`\navg idle ${avg((r) => r.idleAdultPct)}% · avg Trades chapter ${avg((r) => r.chapters.Trades ?? -1)}s · avg quiet ${avg((r) => r.longestQuietSec)}s · avg major gap ${avg((r) => r.longestMajorGapSec)}s · avg claimed ${avg((r) => r.claimed)} · avg pop ${avg((r) => r.populationByMinute.at(-1) ?? 0)}`);
}
