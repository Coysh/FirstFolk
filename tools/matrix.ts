/**
 * The strategy matrix (Battle Drones' balance harness): every bot style plays every other, from
 * both sides of the valley on the same seeds, in parallel child processes. A style that wins
 * everywhere is a dominant strategy; a healthy game has counters (each style beats another).
 */
import { spawn } from 'node:child_process';
import type { PlaytestReport } from '../src/sim/playtest';
import type { BotStyle } from '../src/sim/ai/styles';

type Report = Omit<PlaytestReport, 'timeline' | 'populationByMinute' | 'territoryByMinute'>;

export interface MatrixOptions {
  styles: BotStyle[];
  seed: number;
  games: number;
  minutes: number;
  think: number;
  real: boolean;
  jobs: number;
  passthrough: string[];
}

function duel(o: MatrixOptions, a: BotStyle, b: BotStyle, g: number): Promise<Report> {
  const argv = [...process.execArgv, process.argv[1], '--duel', '--seed', String(o.seed + g), '--game', String(g), '--minutes', String(o.minutes), '--think', String(o.think), '--style', a, '--rival-style', b, ...(o.real ? ['--real'] : []), ...o.passthrough];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('JSON:'));
      if (code !== 0 || !line) reject(new Error(`duel ${a} v ${b} seed ${o.seed + g} failed`));
      else resolve(JSON.parse(line.slice(5)));
    });
  });
}

export async function runMatrix(o: MatrixOptions): Promise<void> {
  const jobs: [BotStyle, BotStyle, number][] = [];
  for (const a of o.styles) for (const b of o.styles) if (a !== b) for (let g = 0; g < o.games; g++) jobs.push([a, b, g]);
  const results: { a: BotStyle; b: BotStyle; r: Report }[] = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(o.jobs, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [a, b, g] = jobs[next++];
        results.push({ a, b, r: await duel(o, a, b, g) });
        process.stderr.write(`\r${results.length}/${jobs.length} duels`);
      }
    }),
  );
  process.stderr.write(`\r${jobs.length} duels in ${Math.round((performance.now() - t0) / 1000)}s\n`);

  // wins[x][y]: games style x won against style y (from either side).
  const wins: Record<string, Record<string, number>> = {};
  const played: Record<string, Record<string, number>> = {};
  const per: Record<string, { games: number; wins: number; towers: number; raids: number; raidsWon: number; repelled: number; renown: Record<string, number> }> = {};
  const sides = [0, 0];
  const lengths: number[] = [];
  let leads = 0;
  let comebacks = 0;
  for (const { a, b, r } of results) {
    const pair: [BotStyle, BotStyle] = [a, b];
    pair.forEach((x, side) => {
      const y = pair[1 - side];
      ((wins[x] ??= {})[y] ??= 0), ((played[x] ??= {})[y] ??= 0);
      played[x][y]++;
      const s = (per[x] ??= { games: 0, wins: 0, towers: 0, raids: 0, raidsWon: 0, repelled: 0, renown: {} });
      s.games++;
      s.towers += r.towers[side];
      s.raids += r.raids[side];
      s.raidsWon += r.raidsWon[side];
      s.repelled += r.repelled[side];
      for (const [k, v] of Object.entries(r.renownBy[side] ?? {})) s.renown[k] = (s.renown[k] ?? 0) + (v ?? 0);
      if (r.winner === side) {
        wins[x][y]++;
        s.wins++;
      }
    });
    if (r.winner >= 0) sides[r.winner]++;
    if (r.victorySec >= 0) lengths.push(r.victorySec / 60);
    leads += r.leadChanges;
    if (r.winnerDeficit >= 100) comebacks++;
  }
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '-').padStart(6);
  console.log(`\nwin % of row against column (${o.games} seeds × both sides each):`);
  console.log('            ' + o.styles.map((s) => s.padStart(10)).join(''));
  for (const x of o.styles) console.log(x.padEnd(12) + o.styles.map((y) => (x === y ? '—' : pct(wins[x]?.[y] ?? 0, played[x]?.[y] ?? 0).trim()).padStart(10)).join(''));
  console.log('\nstyle         overall   towers  raids won held   renown by source (avg)');
  for (const x of o.styles) {
    const s = per[x];
    const src = Object.entries(s.renown).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${Math.round(v / s.games)}`).join(' · ');
    const f = (n: number) => (n / s.games).toFixed(1).padStart(5);
    console.log(`${x.padEnd(12)}${pct(s.wins, s.games)}   ${f(s.towers)} ${f(s.raids)} ${f(s.raidsWon)} ${f(s.repelled)}   ${src}`);
  }
  lengths.sort((p, q) => p - q);
  console.log(`\nside wins P/R ${sides[0]}/${sides[1]} · length median ${lengths[Math.floor(lengths.length / 2)]?.toFixed(1)} min · avg lead changes ${(leads / results.length).toFixed(1)} · comebacks ${Math.round((100 * comebacks) / results.length)}%`);
  // Dominance alarm: a style that is far ahead overall, or beats every other one.
  for (const x of o.styles) {
    const overall = per[x].wins / per[x].games;
    const beatsAll = o.styles.every((y) => y === x || (wins[x]?.[y] ?? 0) * 2 > (played[x]?.[y] ?? 0));
    if (overall > 0.6 || (beatsAll && o.styles.length > 2)) console.log(`⚠ DOMINANT: ${x} wins ${Math.round(overall * 100)}% overall${beatsAll ? ' and beats every other style' : ''}`);
  }
}
