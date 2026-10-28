/** How even are the two starts? Usage: npx tsx tools/fairness.ts [seeds=200]. Prints worst-case ratios per valley. */
import { generateMap, VALLEYS, type ValleyId } from '../src/sim/mapgen';

const n = Number(process.argv[2] ?? 200);
const worst: Record<string, Record<string, number>> = {};
const count = (m: ReturnType<typeof generateMap>, s: { x: number; y: number }, kind: string, r: number) =>
  m.nodes.filter((q) => q.kind === kind && Math.max(Math.abs(q.x - s.x), Math.abs(q.y - s.y)) <= r).length;
for (let seed = 1; seed <= n; seed++) {
  const m = generateMap(seed);
  const w = (worst[m.valley] ??= {});
  for (const [kind, r] of [['tree', 16], ['rock', 16], ['bush', 16], ['fish', 18]] as const) {
    const a = count(m, m.starts[0], kind, r);
    const b = count(m, m.starts[1], kind, r);
    const ratio = Math.max(a, b) ? Math.min(a, b) / Math.max(a, b) : 1;
    w[kind] = Math.min(w[kind] ?? 1, ratio);
    w[`${kind}Min`] = Math.min(w[`${kind}Min`] ?? 999, Math.min(a, b));
  }
}
for (const v of Object.keys(worst)) console.log(VALLEYS[v as ValleyId].name.padEnd(18), Object.entries(worst[v]).map(([k, x]) => `${k} ${k.endsWith('Min') ? x : x.toFixed(2)}`).join(' · '));
