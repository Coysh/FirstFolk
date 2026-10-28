import * as THREE from 'three';
import { Terrain, type MapData } from '../sim/mapgen';
import { hash2 } from '../sim/rng';
import { ModelBuilder, box, cone, cyl, dodeca, ico, sphere } from './modelBuilder';
import type { HeightField } from './terrain';
import { withWind } from './wind';

type Kind = 'tuft' | 'flower' | 'fern' | 'reed' | 'pebble' | 'mushroom';

/**
 * Purely cosmetic ground detail: grass tufts, wildflowers, forest ferns and mushrooms,
 * shoreline reeds and pebbles. Render-only and seeded from tile hashes, so it costs the
 * simulation nothing. `density` scales with the graphics quality setting.
 */
export function buildDecor(map: MapData, hf: HeightField, density = 1): THREE.Group {
  const group = new THREE.Group();
  const N = map.size;
  const geos: Record<Kind, THREE.BufferGeometry> = {
    tuft: new ModelBuilder()
      .add(cone(0.035, 0.18, 3), 0x5e8f3a, { pos: [0, 0.09, 0], rot: [0.25, 0, 0] })
      .add(cone(0.03, 0.15, 3), 0x6fa244, { pos: [0.04, 0.07, 0.02], rot: [-0.3, 0, 0.3] })
      .add(cone(0.03, 0.13, 3), 0x527f33, { pos: [-0.04, 0.06, -0.01], rot: [0, 0, -0.35] })
      .build(),
    flower: new ModelBuilder().add(cone(0.01, 0.14, 3), 0x5e8f3a, { pos: [0, 0.07, 0] }).add(sphere(0.04, 5, 3), 0xffffff, { pos: [0, 0.15, 0] }).build(),
    fern: new ModelBuilder()
      .add(box(0.05, 0.01, 0.3), 0x3f7a3a, { pos: [0, 0.07, 0.12], rot: [0.5, 0, 0] })
      .add(box(0.05, 0.01, 0.3), 0x4a8a40, { pos: [0.1, 0.07, -0.06], rot: [0.5, 2.1, 0] })
      .add(box(0.05, 0.01, 0.3), 0x3f7a3a, { pos: [-0.1, 0.07, -0.06], rot: [0.5, -2.1, 0] })
      .build(),
    reed: new ModelBuilder()
      .add(cyl(0.01, 0.015, 0.45, 3), 0x7f9a4a, { pos: [0, 0.22, 0] })
      .add(cyl(0.01, 0.015, 0.38, 3), 0x8aa654, { pos: [0.05, 0.19, 0.03], rot: [0, 0, 0.12] })
      .add(cyl(0.025, 0.025, 0.1, 5), 0x6b4a2f, { pos: [0, 0.46, 0] })
      .build(),
    pebble: new ModelBuilder().add(dodeca(0.06), 0x9a958c, { scale: [1.2, 0.6, 1] }).add(dodeca(0.04), 0x857f74, { pos: [0.08, 0, 0.03], scale: [1, 0.6, 1] }).build(),
    mushroom: new ModelBuilder().add(cyl(0.015, 0.02, 0.06, 5), 0xf3ead8, { pos: [0, 0.03, 0] }).add(ico(0.04, 0), 0xc0392b, { pos: [0, 0.07, 0], scale: [1, 0.55, 1] }).build(),
  };
  const items: Record<Kind, { m: THREE.Matrix4; c?: number }[]> = { tuft: [], flower: [], fern: [], reed: [], pebble: [], mushroom: [] };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const petals = [0xfff4c2, 0xf6c3d9, 0xfad04a, 0xc9b6f2, 0xffffff];
  const isWater = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && map.terrain[j * N + i] === Terrain.Water;

  const put = (kind: Kind, x: number, y: number, k: number, scale: number, color?: number) => {
    const px = x + hash2(x, y * 4 + k, 42);
    const pz = y + hash2(x * 4 + k, y * 4, 43);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(px, hf.at(px, pz), pz), q.setFromAxisAngle(up, hash2(x, y, 45 + k) * 20), new THREE.Vector3(scale, scale, scale));
    items[kind].push({ m, c: color });
  };

  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = map.terrain[y * N + x];
      for (let k = 0; k < 3; k++) {
        const r = hash2(x * 4 + k, y, 41);
        if (r > density) continue;
        const s = 0.8 + hash2(x, y, 44 + k) * 0.6;
        if (t === Terrain.Grass) {
          if (r < 0.42) put('tuft', x, y, k, s);
        } else if (t === Terrain.Meadow) {
          if (r < 0.3) put('flower', x, y, k, s, petals[Math.floor(hash2(x, y, 60 + k) * petals.length)]);
          else if (r < 0.55) put('tuft', x, y, k, s);
        } else if (t === Terrain.Forest) {
          if (r < 0.3) put('fern', x, y, k, s);
          else if (r < 0.34) put('mushroom', x, y, k, s);
          else if (r < 0.45) put('tuft', x, y, k, s * 0.8);
        } else if (t === Terrain.Sand) {
          const shore = isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1);
          if (shore && r < 0.5) put('reed', x, y, k, s);
          else if (r < 0.12) put('pebble', x, y, k, s);
        } else if (t === Terrain.Rock) {
          if (r < 0.35) put('pebble', x, y, k, s * 1.3);
        }
      }
    }

  const col = new THREE.Color();
  for (const kind of Object.keys(items) as Kind[]) {
    const list = items[kind];
    if (!list.length) continue;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    if (kind === 'tuft' || kind === 'reed' || kind === 'flower') withWind(mat, kind === 'reed' ? 0.12 : 0.18, 0.02);
    const mesh = new THREE.InstancedMesh(geos[kind], mat, list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c !== undefined) mesh.setColorAt(i, col.setHex(it.c));
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
