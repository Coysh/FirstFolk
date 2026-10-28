import * as THREE from 'three';
import type { BuildingType, Good } from '../sim/defs';
import { ModelBuilder, box, cone, cyl, dodeca, gableRoof, ico, sphere } from './modelBuilder';
import { C } from './palette';

/**
 * Code-built low-poly models. Every building is centred on its 2×2 footprint with the
 * door facing +z (towards the entrance tile). Trade-tier variants (M1) slot in here.
 */
export interface BuildingModelOpts {
  crest?: number;
  /** Trade tier (0 novice, 1 journeyman, 2 master): the workplace visibly grows with its worker. */
  tier?: number;
}

function fence(b: ModelBuilder, x0: number, x1: number, z: number, posts: number) {
  for (let i = 0; i < posts; i++) b.add(box(0.04, 0.22, 0.04), C.wood, { pos: [x0 + ((x1 - x0) * i) / (posts - 1), 0.11, z] });
  b.add(box(Math.abs(x1 - x0), 0.03, 0.02), C.lightWood, { pos: [(x0 + x1) / 2, 0.16, z] });
  b.add(box(Math.abs(x1 - x0), 0.03, 0.02), C.lightWood, { pos: [(x0 + x1) / 2, 0.08, z] });
}

function cottage(b: ModelBuilder, wall: number, roof: number, w = 1.05, d = 0.85, h = 0.55, ox = 0, oz = 0) {
  b.add(box(w + 0.1, 0.12, d + 0.1), C.stoneDark, { pos: [ox, 0.02, oz] });
  b.add(box(w, h, d), wall, { pos: [ox, 0.06 + h / 2, oz] });
  // timber frame posts and beam
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.add(box(0.07, h, 0.07), C.timber, { pos: [ox + (sx * w) / 2, 0.06 + h / 2, oz + (sz * d) / 2] });
  b.add(box(w + 0.02, 0.06, 0.07), C.timber, { pos: [ox, 0.06 + h * 0.55, oz + d / 2] });
  // Ridge runs front-to-back so both slopes catch the light from the strategy camera.
  b.add(gableRoof(d + 0.26, w + 0.2, 0.6), roof, { pos: [ox, 0.06 + h, oz], rot: [0, Math.PI / 2, 0] });
  b.add(box(0.06, 0.06, d + 0.3), C.thatchDark, { pos: [ox, 0.06 + h + 0.6, oz] });
  // plastered gable end above the door
  b.add(gableRoof(0.04, w, 0.56), wall, { pos: [ox, 0.06 + h, oz + d / 2 - 0.01], rot: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
  b.add(box(0.24, 0.36, 0.04), C.door, { pos: [ox - w * 0.18, 0.24, oz + d / 2 + 0.01] });
  b.add(box(0.18, 0.14, 0.04), C.darkTimber, { pos: [ox + w * 0.22, 0.38, oz + d / 2 + 0.01] });
}

function logPile(b: ModelBuilder, x: number, z: number, n = 3) {
  const rows = [[-0.09, 0], [0.09, 0], [0, 0.13]];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = rows[i % 3];
    b.add(cyl(0.06, 0.06, 0.45, 6), C.wood, { pos: [x + dx, 0.07 + dy, z], rot: [0, 0, Math.PI / 2] });
  }
}

export function buildingGeometry(type: BuildingType, opts: BuildingModelOpts = {}): THREE.BufferGeometry {
  const b = new ModelBuilder();
  switch (type) {
    case 'wagon': {
      const y = 0.38;
      b.add(box(1.25, 0.18, 0.66), C.wood, { pos: [0, y, 0] });
      b.add(box(1.25, 0.16, 0.04), C.darkTimber, { pos: [0, y + 0.14, 0.31] });
      b.add(box(1.25, 0.16, 0.04), C.darkTimber, { pos: [0, y + 0.14, -0.31] });
      for (const sx of [-0.42, 0.42])
        for (const sz of [-0.36, 0.36]) {
          b.add(cyl(0.22, 0.22, 0.06, 10), C.darkTimber, { pos: [sx, 0.22, sz], rot: [Math.PI / 2, 0, 0] });
          b.add(cyl(0.05, 0.05, 0.08, 6), C.iron, { pos: [sx, 0.22, sz], rot: [Math.PI / 2, 0, 0] });
        }
      // canvas cover hoops
      const cover = new THREE.CylinderGeometry(0.36, 0.36, 1.1, 10, 1, false, -Math.PI / 2, Math.PI);
      b.add(cover, C.cloth, { pos: [0, y + 0.12, 0], rot: [0, 0, Math.PI / 2] });
      for (const sx of [-0.5, 0, 0.5]) b.add(new THREE.TorusGeometry(0.37, 0.018, 4, 10, Math.PI), C.clothShade, { pos: [sx, y + 0.12, 0], rot: [0, Math.PI / 2, 0] });
      b.add(box(0.7, 0.04, 0.04), C.wood, { pos: [-0.95, 0.3, 0], rot: [0, 0, 0.15] });
      // crates, sacks and a little campfire
      b.add(box(0.26, 0.24, 0.26), C.lightWood, { pos: [0.55, 0.12, 0.62] });
      b.add(box(0.2, 0.18, 0.2), C.wood, { pos: [0.72, 0.09, 0.38], rot: [0, 0.4, 0] });
      b.add(sphere(0.13), C.clothShade, { pos: [0.3, 0.1, 0.7], scale: [1, 0.8, 1] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(dodeca(0.05), C.stoneDark, { pos: [-0.45 + Math.cos(a) * 0.16, 0.03, 0.75 + Math.sin(a) * 0.16] });
      }
      b.add(cyl(0.025, 0.025, 0.28, 5), C.wood, { pos: [-0.45, 0.05, 0.75], rot: [0.3, 0, Math.PI / 2] });
      b.add(cyl(0.025, 0.025, 0.28, 5), C.wood, { pos: [-0.45, 0.05, 0.75], rot: [-0.3, 1.2, Math.PI / 2] });
      break;
    }
    case 'woodcutter': {
      const t = opts.tier ?? 0;
      if (t === 0) {
        // Novice: a modest lean-to cottage, chopping block and a few logs.
        cottage(b, C.plaster, C.thatch, 0.95, 0.75, 0.48, -0.15, -0.18);
        b.add(cyl(0.13, 0.15, 0.18, 8), C.lightWood, { pos: [0.55, 0.09, 0.55] });
        b.add(box(0.03, 0.28, 0.03), C.wood, { pos: [0.55, 0.3, 0.55], rot: [0, 0, 0.5] });
        b.add(box(0.1, 0.06, 0.02), C.iron, { pos: [0.49, 0.42, 0.55], rot: [0, 0, 0.5] });
        logPile(b, 0.62, -0.2, 3);
      } else {
        // Carpenter's lodge: bigger timber-framed house, saw bench, plank stacks.
        cottage(b, C.plaster, t >= 2 ? C.thatchDark : C.thatch, 1.15, 0.85, 0.6, -0.15, -0.2);
        b.add(box(0.5, 0.05, 0.18), C.lightWood, { pos: [0.55, 0.32, 0.5] });
        for (const x of [0.36, 0.74]) b.add(box(0.05, 0.3, 0.16), C.wood, { pos: [x, 0.15, 0.5] });
        b.add(box(0.04, 0.12, 0.3), C.iron, { pos: [0.55, 0.42, 0.5] });
        for (let i = 0; i < 4; i++) b.add(box(0.5, 0.035, 0.12), C.lightWood, { pos: [0.66, 0.03 + i * 0.04, -0.35], rot: [0, 0.1 * i, 0] });
        logPile(b, -0.75, 0.55, 3);
        if (t >= 2) {
          // Master: a lifting crane and a carved sign.
          b.add(box(0.07, 1.1, 0.07), C.timber, { pos: [0.85, 0.55, -0.75] });
          b.add(box(0.6, 0.06, 0.06), C.timber, { pos: [0.6, 1.08, -0.75] });
          b.add(cyl(0.008, 0.008, 0.4, 3), 0x3b2a1e, { pos: [0.35, 0.86, -0.75] });
          b.add(box(0.3, 0.16, 0.03), C.thatch, { pos: [-0.15, 0.8, 0.24] });
        }
      }
      break;
    }
    case 'forester': {
      cottage(b, C.wattle, C.moss, 0.95, 0.8, 0.5, -0.1, -0.15);
      for (const [x, z] of [[0.55, 0.45], [0.7, 0.2], [0.45, 0.68]]) {
        b.add(cyl(0.07, 0.06, 0.1, 6), C.wood, { pos: [x, 0.05, z] });
        b.add(cone(0.08, 0.2, 6), C.leafLight, { pos: [x, 0.2, z] });
      }
      b.add(cyl(0.05, 0.05, 0.1, 6), C.iron, { pos: [-0.65, 0.05, 0.55] });
      fence(b, -0.85, 0.85, 0.85, 3);
      break;
    }
    case 'quarry': {
      const t = opts.tier ?? 0;
      b.add(box(1.1, 0.12, 0.9), C.stoneDark, { pos: [-0.1, 0.02, -0.15] });
      b.add(box(1.0, 0.45, 0.12), C.stone, { pos: [-0.1, 0.3, -0.55] });
      b.add(box(0.12, 0.45, 0.8), C.stone, { pos: [-0.55, 0.3, -0.18] });
      b.add(box(0.12, 0.45, 0.8), C.stone, { pos: [0.35, 0.3, -0.18] });
      b.add(box(1.25, 0.07, 1.05), C.thatchDark, { pos: [-0.1, 0.6, -0.12], rot: [0.32, 0, 0] });
      b.add(box(0.08, 0.5, 0.08), C.timber, { pos: [-0.6, 0.3, 0.3] });
      b.add(box(0.08, 0.5, 0.08), C.timber, { pos: [0.4, 0.3, 0.3] });
      b.add(dodeca(0.22), C.rock, { pos: [-0.75, 0.12, -0.75] });
      b.add(dodeca(0.16), C.rockDark, { pos: [0.75, 0.1, -0.7] });
      const blocks = t === 0 ? [[0.55, 0.4, 0.16], [0.7, 0.15, 0.12]] : [[0.55, 0.4, 0.16], [0.7, 0.15, 0.12], [0.45, 0.65, 0.1], [0.75, 0.55, 0.13]];
      for (const [x, z, sz] of blocks) b.add(box(sz * 1.6, sz, sz * 1.2), C.stone, { pos: [x, sz / 2, z], rot: [0, x * 3, 0] });
      if (t >= 1) {
        // Mason's yard: dressed blocks stacked square, a work bench with chisel.
        for (let i = 0; i < 3; i++) b.add(box(0.26, 0.12, 0.18), 0xc2bcb0, { pos: [-0.6, 0.06 + i * 0.12, 0.6] });
        b.add(box(0.4, 0.05, 0.2), C.lightWood, { pos: [0.1, 0.3, 0.6] });
        b.add(box(0.05, 0.28, 0.18), C.wood, { pos: [-0.05, 0.14, 0.6] });
        b.add(box(0.05, 0.28, 0.18), C.wood, { pos: [0.25, 0.14, 0.6] });
        b.add(box(0.14, 0.1, 0.1), 0xc2bcb0, { pos: [0.1, 0.38, 0.6] });
      }
      if (t >= 2) {
        b.add(box(0.07, 1.0, 0.07), C.timber, { pos: [0.85, 0.5, 0.85] });
        b.add(box(0.5, 0.06, 0.06), C.timber, { pos: [0.65, 0.98, 0.85] });
        b.add(box(0.18, 0.18, 0.18), 0xc2bcb0, { pos: [0.45, 0.6, 0.85] });
      }
      b.add(box(0.03, 0.32, 0.03), C.wood, { pos: [-0.65, 0.16, 0.5], rot: [0, 0, -0.4] });
      b.add(box(0.2, 0.04, 0.03), C.iron, { pos: [-0.72, 0.31, 0.5], rot: [0, 0, -0.4] });
      break;
    }
    case 'forager': {
      const t = opts.tier ?? 0;
      cottage(b, C.plaster, C.thatchDark, 0.95, 0.8, 0.5, -0.12, -0.15);
      const baskets = t === 0 ? [[0.5, 0.55], [0.72, 0.3]] : [[0.5, 0.55], [0.72, 0.3], [0.3, 0.75], [0.75, 0.62]];
      for (const [x, z] of baskets) {
        b.add(cyl(0.13, 0.1, 0.12, 8), C.lightWood, { pos: [x, 0.06, z] });
        for (let i = 0; i < 4; i++) b.add(sphere(0.04, 5, 4), C.berry, { pos: [x + ((i % 2) - 0.5) * 0.08, 0.13, z + (i < 2 ? -0.03 : 0.04)] });
      }
      b.add(box(0.03, 0.4, 0.03), C.wood, { pos: [0.65, 0.2, -0.3] });
      b.add(box(0.03, 0.4, 0.03), C.wood, { pos: [0.65, 0.2, -0.7] });
      b.add(box(0.03, 0.03, 0.45), C.wood, { pos: [0.65, 0.38, -0.5] });
      for (const z of [-0.4, -0.55]) b.add(box(0.02, 0.15, 0.08), C.leaf, { pos: [0.65, 0.29, z] });
      if (t >= 1) {
        // Gatherer: a little herb garden with a wattle fence.
        fence(b, -0.85, -0.3, 0.85, 4);
        for (const x of [-0.7, -0.5]) b.add(ico(0.08, 0), C.leafLight, { pos: [x, 0.07, 0.62] });
      }
      break;
    }
    case 'sawpit': {
      // Open-sided shed over a saw trestle, logs waiting on one side, planks on the other.
      for (const [x, z] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.4], [0.7, 0.4]]) b.add(box(0.08, 0.75, 0.08), C.timber, { pos: [x, 0.38, z] });
      b.add(gableRoof(1.7, 1.25, 0.5), C.thatch, { pos: [0, 0.75, -0.1], rot: [0, Math.PI / 2, 0] });
      b.add(box(1.0, 0.05, 0.22), C.wood, { pos: [0, 0.4, -0.1] });
      for (const x of [-0.35, 0.35]) {
        b.add(box(0.05, 0.42, 0.05), C.wood, { pos: [x, 0.2, -0.2], rot: [0.25, 0, 0] });
        b.add(box(0.05, 0.42, 0.05), C.wood, { pos: [x, 0.2, 0.0], rot: [-0.25, 0, 0] });
      }
      b.add(cyl(0.09, 0.09, 0.9, 7), C.wood, { pos: [0, 0.5, -0.1], rot: [0, 0, Math.PI / 2] });
      b.add(box(0.02, 0.35, 0.5), C.iron, { pos: [0.1, 0.5, -0.1] });
      logPile(b, -0.6, 0.75, 3);
      for (let i = 0; i < 3; i++) b.add(box(0.55, 0.035, 0.13), C.lightWood, { pos: [0.55, 0.03 + i * 0.04, 0.75] });
      b.add(box(1.6, 0.04, 1.4), 0x8a7650, { pos: [0, 0.0, -0.1] });
      break;
    }
    case 'storehouse': {
      // Timber barn on stone footings with big doors and a loading ramp.
      b.add(box(1.4, 0.2, 1.1), C.stone, { pos: [0, 0.1, -0.15] });
      b.add(box(1.3, 0.62, 1.0), C.wood, { pos: [0, 0.51, -0.15] });
      for (const x of [-0.65, -0.22, 0.22, 0.65]) b.add(box(0.06, 0.62, 1.02), C.timber, { pos: [x, 0.51, -0.15] });
      b.add(gableRoof(1.3, 1.55, 0.66), C.thatch, { pos: [0, 0.82, -0.15], rot: [0, Math.PI / 2, 0] });
      b.add(gableRoof(0.04, 1.3, 0.62), C.wood, { pos: [0, 0.82, 0.34], rot: [0, Math.PI / 2, 0] });
      b.add(box(0.5, 0.48, 0.04), C.darkTimber, { pos: [0, 0.44, 0.36] });
      b.add(box(0.02, 0.48, 0.05), C.timber, { pos: [0, 0.44, 0.38] });
      b.add(box(0.5, 0.06, 0.3), C.wood, { pos: [0, 0.1, 0.52], rot: [-0.25, 0, 0] });
      b.add(box(0.24, 0.22, 0.24), C.lightWood, { pos: [-0.62, 0.11, 0.6] });
      b.add(cyl(0.11, 0.11, 0.26, 8), C.wood, { pos: [0.62, 0.13, 0.62] });
      break;
    }
    case 'hut': {
      b.add(cyl(0.68, 0.72, 0.1, 10), C.stoneDark, { pos: [0, 0.03, -0.05] });
      b.add(cyl(0.6, 0.62, 0.48, 10), C.wattle, { pos: [0, 0.32, -0.05] });
      b.add(cone(0.82, 0.8, 10), C.thatch, { pos: [0, 0.96, -0.05] });
      b.add(cone(0.2, 0.18, 10), C.thatchDark, { pos: [0, 1.38, -0.05] });
      b.add(box(0.26, 0.36, 0.06), C.door, { pos: [0, 0.26, 0.56] });
      b.add(box(0.36, 0.05, 0.08), C.timber, { pos: [0, 0.46, 0.56] });
      if (opts.crest !== undefined) {
        b.add(cyl(0.02, 0.02, 0.9, 5), C.wood, { pos: [0.62, 0.45, 0.45] });
        b.add(box(0.03, 0.22, 0.26), opts.crest, { pos: [0.62, 0.78, 0.32] });
      }
      // woodpile, a little vegetable patch and a water butt
      b.add(cyl(0.05, 0.05, 0.3, 6), C.wood, { pos: [-0.6, 0.05, 0.45], rot: [0, 0, Math.PI / 2] });
      b.add(cyl(0.05, 0.05, 0.3, 6), C.wood, { pos: [-0.6, 0.15, 0.45], rot: [0, 0, Math.PI / 2] });
      b.add(box(0.5, 0.05, 0.32), 0x6b4f33, { pos: [-0.55, 0.02, -0.7] });
      for (const x of [-0.7, -0.55, -0.4]) b.add(ico(0.06, 0), C.leafLight, { pos: [x, 0.08, -0.7] });
      b.add(cyl(0.1, 0.1, 0.22, 8), C.wood, { pos: [0.7, 0.11, -0.45] });
      break;
    }
  }
  return b.build();
}

/** Small item meshes for stock piles, carried goods and construction materials. */
export function goodGeometry(good: Good): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (good === 'logs') b.add(cyl(0.05, 0.05, 0.36, 6), C.wood, { rot: [0, 0, Math.PI / 2] });
  else if (good === 'planks') {
    b.add(box(0.36, 0.03, 0.1), C.lightWood, { pos: [0, 0, 0] });
    b.add(box(0.36, 0.03, 0.1), 0xd9b07a, { pos: [0.01, 0.032, 0.005] });
  }
  else if (good === 'stone') b.add(box(0.16, 0.1, 0.12), C.stone);
  else {
    b.add(cyl(0.09, 0.07, 0.08, 7), C.lightWood);
    b.add(sphere(0.035, 5, 4), C.berry, { pos: [0.03, 0.05, 0] });
    b.add(sphere(0.035, 5, 4), C.berry, { pos: [-0.03, 0.05, 0.02] });
  }
  return b.build();
}

export function scaffoldGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(1.7, 0.06, 1.7), C.lightWood, { pos: [0, 0.03, 0] });
  for (const sx of [-0.8, 0.8])
    for (const sz of [-0.8, 0.8]) b.add(cyl(0.025, 0.025, 1.0, 5), C.wood, { pos: [sx, 0.5, sz] });
  b.add(box(1.6, 0.03, 0.03), C.wood, { pos: [0, 0.7, 0.8] });
  b.add(box(1.6, 0.03, 0.03), C.wood, { pos: [0, 0.7, -0.8] });
  b.add(box(0.03, 0.03, 1.6), C.wood, { pos: [0.8, 0.45, 0] });
  b.add(box(0.03, 0.03, 1.6), C.wood, { pos: [-0.8, 0.45, 0] });
  return b.build();
}

