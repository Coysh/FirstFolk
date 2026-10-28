/**
 * Valley gallery and stats. Usage: npx tsx tools/valleys.ts [--out screenshots/valleys.png] [--seeds 300] [--pick 1,2,3]
 * Draws one top-down map per valley (water, shore, grass, forest, rock, mountain; starts as discs, prizes as dots)
 * and prints how the generator behaves over many seeds.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateMap, VALLEY_IDS, VALLEYS, valleyOf, Terrain, isWalkableTerrain } from '../src/sim/mapgen';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = opt('out', 'screenshots/valleys.png');
const nSeeds = Number(opt('seeds', '300'));
const COLORS: Record<number, [number, number, number]> = {
  [Terrain.Water]: [70, 120, 170],
  [Terrain.Sand]: [226, 210, 160],
  [Terrain.Grass]: [143, 191, 90],
  [Terrain.Meadow]: [169, 207, 102],
  [Terrain.Forest]: [58, 118, 72],
  [Terrain.Rock]: [160, 154, 139],
  [Terrain.Mountain]: [96, 90, 84],
};

// ---- stats over many seeds
const tally: Record<string, number> = {};
let fallbacks = 0;
for (let seed = 1; seed <= nSeeds; seed++) {
  const m = generateMap(seed);
  tally[m.valley] = (tally[m.valley] ?? 0) + 1;
  if (m.valley !== valleyOf(seed)) fallbacks++;
}
console.log('valleys over', nSeeds, 'seeds:', JSON.stringify(tally), '· connectivity fallbacks:', fallbacks);

// ---- gallery: the first seed of each valley (or --pick seeds)
const picks: number[] = opt('pick', '').split(',').filter(Boolean).map(Number);
if (!picks.length) for (const id of VALLEY_IDS) picks.push([...Array(200).keys()].map((k) => k + 1).find((s) => valleyOf(s) === id)!);
const S = 4;
const cell = 128 * S;
const tiles: { input: Buffer; left: number; top: number }[] = [];
for (let k = 0; k < picks.length; k++) {
  const m = generateMap(picks[k]);
  const N = m.size;
  const px = Buffer.alloc(N * S * N * S * 3);
  const set = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= N * S || y >= N * S) return;
    const o = (y * N * S + x) * 3;
    px[o] = c[0];
    px[o + 1] = c[1];
    px[o + 2] = c[2];
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let j = 0; j < S * S; j++) set(x * S + (j % S), y * S + Math.floor(j / S), COLORS[m.terrain[y * N + x]]);
  for (const n of m.nodes) if (n.kind === 'fish') for (let j = 0; j < S; j++) set(n.x * S + j, n.y * S + 1, [190, 220, 240]);
  const disc = (cx: number, cy: number, r: number, c: number[]) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx * S + x, cy * S + y, c);
  };
  for (const s of m.sites) disc(s.x, s.y, 5, [255, 215, 90]);
  m.starts.forEach((s, i) => disc(s.x, s.y, 12, i ? [220, 70, 60] : [60, 90, 220]));
  tiles.push({ input: await sharp(px, { raw: { width: N * S, height: N * S, channels: 3 } }).png().toBuffer(), left: (k % 3) * (cell + 8), top: Math.floor(k / 3) * (cell + 8) });
  console.log(`${VALLEYS[m.valley].name}: seed ${picks[k]}, trees ${m.nodes.filter((n) => n.kind === 'tree').length}, rocks ${m.nodes.filter((n) => n.kind === 'rock').length}, bushes ${m.nodes.filter((n) => n.kind === 'bush').length}, fish ${m.nodes.filter((n) => n.kind === 'fish').length}, water ${Math.round((100 * m.terrain.filter((t) => t === Terrain.Water).length) / (N * N))}%`);
}
mkdirSync(dirname(out), { recursive: true });
const cols = 3;
const rows = Math.ceil(picks.length / cols);
await sharp({ create: { width: cols * (cell + 8), height: rows * (cell + 8), channels: 3, background: { r: 30, g: 24, b: 18 } } }).composite(tiles).png().toFile(out);
console.log('saved', out);
void isWalkableTerrain;
