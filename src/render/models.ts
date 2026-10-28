import * as THREE from 'three';
import type { BuildingType, DiscoveryKind, Good } from '../sim/defs';
import { artGeometry } from './art';
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

/** The founders' camp grows into a hall with each settlement rank (Hamlet, Village, Town). */
function hall(b: ModelBuilder, rank: number) {
  const w = 1.5 + rank * 0.12;
  const d = 1.05;
  const h = 0.62 + rank * 0.06;
  if (rank >= 2) b.add(box(w + 0.3, 0.2, d + 0.3), C.stone, { pos: [0, 0.08, -0.15] });
  cottage(b, rank >= 2 ? C.plaster : C.wattle, rank >= 3 ? C.thatchDark : C.thatch, w, d, h, 0, -0.15);
  // carved ridge posts at each gable end
  for (const z of [-0.15 - d / 2 - 0.1, -0.15 + d / 2 + 0.1]) b.add(cone(0.05, 0.3, 4), C.darkTimber, { pos: [0, 0.06 + h + 0.72, z] });
  // a hearth fire out front, crates and the old wagon's wheel kept as a keepsake
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(dodeca(0.05), C.stoneDark, { pos: [0.6 + Math.cos(a) * 0.15, 0.03, 0.7 + Math.sin(a) * 0.15] });
  }
  b.add(cone(0.07, 0.16, 5), C.ember, { pos: [0.6, 0.08, 0.7] });
  b.add(box(0.24, 0.22, 0.24), C.lightWood, { pos: [-0.75, 0.11, 0.6] });
  b.add(cyl(0.2, 0.2, 0.05, 10), C.darkTimber, { pos: [-0.85, 0.22, 0.25], rot: [0.2, 0, Math.PI / 2] });
  // banners: one per rank
  for (let i = 0; i < rank; i++) {
    const x = -0.55 + i * 0.55;
    b.add(cyl(0.025, 0.025, 1.6, 5), C.wood, { pos: [x, 0.8, 0.5] });
    b.add(box(0.03, 0.42, 0.28), [0xc0392b, 0x2e86c1, 0xf2c14e][i], { pos: [x, 1.38, 0.36] });
  }
  if (rank >= 3) {
    // Town: a stone tower with a gilded flag.
    b.add(box(0.5, 1.6, 0.5), C.stone, { pos: [0.95, 0.8, -0.55] });
    b.add(cone(0.45, 0.6, 4), C.thatchDark, { pos: [0.95, 1.9, -0.55], rot: [0, Math.PI / 4, 0] });
    b.add(cyl(0.02, 0.02, 0.5, 5), C.wood, { pos: [0.95, 2.4, -0.55] });
    b.add(box(0.03, 0.18, 0.3), 0xf2c14e, { pos: [0.95, 2.55, -0.4] });
  }
}

function logPile(b: ModelBuilder, x: number, z: number, n = 3) {
  const rows = [[-0.09, 0], [0.09, 0], [0, 0.13]];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = rows[i % 3];
    b.add(cyl(0.06, 0.06, 0.45, 6), C.wood, { pos: [x + dx, 0.07 + dy, z], rot: [0, 0, Math.PI / 2] });
  }
}

export function buildingGeometry(type: BuildingType, opts: BuildingModelOpts = {}): THREE.BufferGeometry {
  // Blender-built model first: trade tiers are `<type>_<tier>` (a higher tier than modelled reuses the
  // best one), and a single model is just `<type>`. Anything else falls through to the code model below.
  let art: THREE.BufferGeometry | null = null;
  for (let t = opts.tier ?? 0; t >= 0 && !art; t--) art = artGeometry(`${type}_${t}`, opts.crest);
  art ??= artGeometry(type, opts.crest);
  if (art) return art;
  const b = new ModelBuilder();
  switch (type) {
    case 'wagon': {
      const rank = opts.tier ?? 0;
      if (rank >= 1) {
        hall(b, rank);
        break;
      }
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
    case 'fisher': {
      // A reed-thatched hut with drying racks, a little jetty and an upturned boat.
      cottage(b, C.wattle, C.thatchDark, 0.95, 0.75, 0.48, -0.2, -0.25);
      for (const x of [0.35, 0.85]) b.add(box(0.05, 0.6, 0.05), C.wood, { pos: [x, 0.3, 0.2] });
      b.add(box(0.6, 0.04, 0.04), C.wood, { pos: [0.6, 0.58, 0.2] });
      for (const x of [0.45, 0.6, 0.75]) b.add(sphere(0.05, 5, 4), 0x8fa9b8, { pos: [x, 0.45, 0.2], scale: [0.8, 2.2, 0.6] });
      b.add(new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.darkTimber, { pos: [-0.45, 0.02, 0.6], scale: [1.6, 0.6, 0.8], rot: [Math.PI, 0.3, 0] });
      b.add(cyl(0.12, 0.12, 0.08, 10), C.cloth, { pos: [0.65, 0.04, -0.6] });
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
    case 'lookout': {
      // A tall timber watchtower on a stone base, with a platform, roof and the family banner.
      b.add(box(1.0, 0.16, 1.0), C.stoneDark, { pos: [0, 0.06, -0.1] });
      for (const sx of [-0.36, 0.36])
        for (const sz of [-0.46, 0.26]) b.add(box(0.09, 1.7, 0.09), C.timber, { pos: [sx, 0.9, sz], rot: [-sz * 0.08, 0, sx * 0.08] });
      for (const y of [0.55, 1.05]) {
        b.add(box(0.8, 0.05, 0.05), C.wood, { pos: [0, y, -0.46], rot: [0, 0, 0.5] });
        b.add(box(0.8, 0.05, 0.05), C.wood, { pos: [0, y, 0.26], rot: [0, 0, -0.5] });
      }
      b.add(box(0.95, 0.07, 0.95), C.lightWood, { pos: [0, 1.7, -0.1] });
      fence(b, -0.45, 0.45, 0.36, 4);
      b.add(box(0.95, 0.16, 0.03), C.wood, { pos: [0, 1.82, 0.37] });
      b.add(box(0.95, 0.16, 0.03), C.wood, { pos: [0, 1.82, -0.57] });
      b.add(cone(0.78, 0.55, 4), C.thatch, { pos: [0, 2.25, -0.1], rot: [0, Math.PI / 4, 0] });
      b.add(cyl(0.02, 0.02, 0.6, 5), C.wood, { pos: [0, 2.75, -0.1] });
      b.add(box(0.03, 0.2, 0.32), opts.crest ?? 0xc0392b, { pos: [0, 2.9, 0.07] });
      // ladder
      for (let i = 0; i < 6; i++) b.add(box(0.28, 0.03, 0.03), C.lightWood, { pos: [0, 0.2 + i * 0.27, 0.42] });
      for (const x of [-0.14, 0.14]) b.add(box(0.03, 1.6, 0.03), C.wood, { pos: [x, 0.85, 0.42] });
      break;
    }
    case 'watchtower': {
      // A square stone-footed tower with a timber upper storey, a hip roof and a big banner.
      b.add(box(1.1, 0.9, 1.1), C.stone, { pos: [0, 0.45, -0.1] });
      for (let i = 0; i < 4; i++) b.add(box(1.14, 0.05, 1.14), C.stoneDark, { pos: [0, 0.2 + i * 0.22, -0.1] });
      b.add(box(1.0, 0.9, 1.0), C.plaster, { pos: [0, 1.35, -0.1] });
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.6, 0.4]) b.add(box(0.08, 0.9, 0.08), C.timber, { pos: [sx, 1.35, sz] });
      b.add(box(1.25, 0.08, 1.25), C.lightWood, { pos: [0, 1.84, -0.1] });
      fence(b, -0.6, 0.6, 0.5, 5);
      b.add(cone(0.95, 0.75, 4), C.thatchDark, { pos: [0, 2.3, -0.1], rot: [0, Math.PI / 4, 0] });
      b.add(cyl(0.025, 0.025, 0.8, 5), C.wood, { pos: [0, 2.9, -0.1] });
      b.add(box(0.03, 0.3, 0.45), opts.crest ?? 0x2e86c1, { pos: [0, 3.1, 0.14] });
      b.add(box(0.26, 0.4, 0.05), C.door, { pos: [0, 0.2, 0.46] });
      b.add(box(0.2, 0.22, 0.05), C.darkTimber, { pos: [0, 1.4, 0.41] });
      break;
    }
    case 'musterhall': {
      // A long timber hall where the huscarls drill: shields along the wall, a weapon rack,
      // a straw practice dummy and a war banner.
      b.add(box(1.7, 0.12, 1.0), C.stoneDark, { pos: [0, 0.02, -0.25] });
      b.add(box(1.6, 0.55, 0.85), C.darkTimber, { pos: [0, 0.34, -0.25] });
      for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) b.add(box(0.07, 0.55, 0.88), C.timber, { pos: [x, 0.34, -0.25] });
      b.add(gableRoof(1.05, 1.85, 0.7), C.thatchDark, { pos: [0, 0.6, -0.25] });
      for (const x of [-0.9, 0.9]) b.add(cone(0.06, 0.32, 4), C.darkTimber, { pos: [x, 1.38, -0.25], rot: [0, 0, x > 0 ? -0.5 : 0.5] });
      b.add(box(0.28, 0.4, 0.05), C.door, { pos: [0, 0.26, 0.19] });
      // Painted shields hung along the front wall.
      for (const [x, c] of [[-0.6, 0xc0392b], [-0.3, 0xf2c14e], [0.3, 0x2e86c1], [0.6, opts.crest ?? 0xc0392b]] as const)
        b.add(cyl(0.11, 0.11, 0.03, 9), c, { pos: [x, 0.45, 0.2], rot: [Math.PI / 2, 0, 0] });
      // A spear rack and a practice dummy in the yard.
      b.add(box(0.5, 0.05, 0.05), C.wood, { pos: [-0.5, 0.45, 0.62] });
      for (const x of [-0.7, -0.57, -0.44, -0.31]) b.add(box(0.02, 0.85, 0.02), C.wood, { pos: [x, 0.42, 0.58], rot: [0.12, 0, 0] });
      b.add(cyl(0.025, 0.025, 0.7, 5), C.wood, { pos: [0.55, 0.35, 0.62] });
      b.add(cyl(0.12, 0.1, 0.32, 7), C.thatch, { pos: [0.55, 0.55, 0.62] });
      b.add(box(0.5, 0.05, 0.05), C.wood, { pos: [0.55, 0.6, 0.62] });
      b.add(cyl(0.025, 0.03, 1.8, 5), C.wood, { pos: [0.85, 0.9, 0.3] });
      b.add(box(0.03, 0.36, 0.42), opts.crest ?? 0xc0392b, { pos: [0.85, 1.6, 0.5] });
      break;
    }
    case 'stockade': {
      // A palisade of sharpened stakes around a little guardhouse, with a gate facing the road.
      b.add(cyl(0.95, 0.98, 0.06, 14), 0x7a6646, { pos: [0, 0.02, -0.05] });
      const stakes = 22;
      for (let i = 0; i < stakes; i++) {
        const a = (i / stakes) * Math.PI * 2;
        // Leave a gap for the gate at the front (+z).
        if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.32) continue;
        const h = 0.62 + ((i * 7) % 5) * 0.03;
        const x = Math.sin(a) * 0.86;
        const z = -0.05 + Math.cos(a) * 0.86;
        b.add(cyl(0.055, 0.06, h, 5), C.timber, { pos: [x, h / 2, z] });
        b.add(cone(0.06, 0.14, 5), C.lightWood, { pos: [x, h + 0.07, z] });
      }
      // A walkway band and two gate posts with a lintel.
      for (const x of [-0.3, 0.3]) b.add(box(0.1, 0.95, 0.1), C.darkTimber, { pos: [x, 0.47, 0.78] });
      b.add(box(0.72, 0.1, 0.12), C.darkTimber, { pos: [0, 0.92, 0.78] });
      // The guardhouse: stone footing, timber walls, a steep roof and the family banner.
      b.add(box(0.7, 0.14, 0.62), C.stoneDark, { pos: [0, 0.07, -0.2] });
      b.add(box(0.6, 0.5, 0.52), C.wood, { pos: [0, 0.39, -0.2] });
      b.add(cone(0.55, 0.55, 4), C.thatchDark, { pos: [0, 0.9, -0.2], rot: [0, Math.PI / 4, 0] });
      b.add(box(0.18, 0.3, 0.04), C.door, { pos: [0, 0.22, 0.07] });
      // A shield and crossed spears by the door.
      b.add(cyl(0.12, 0.12, 0.03, 9), opts.crest ?? 0xc0392b, { pos: [0.22, 0.42, 0.08], rot: [Math.PI / 2, 0, 0] });
      b.add(box(0.02, 0.7, 0.02), C.wood, { pos: [-0.22, 0.4, 0.08], rot: [0, 0, 0.35] });
      b.add(box(0.02, 0.7, 0.02), C.wood, { pos: [-0.22, 0.4, 0.08], rot: [0, 0, -0.35] });
      b.add(cyl(0.02, 0.02, 1.1, 5), C.wood, { pos: [0.55, 0.9, -0.55] });
      b.add(box(0.03, 0.26, 0.38), opts.crest ?? 0xc0392b, { pos: [0.55, 1.32, -0.37] });
      break;
    }
    case 'longhouse': {
      // A long timber hall with a turf-and-thatch roof running the length of the plot.
      b.add(box(1.8, 0.12, 1.2), C.stoneDark, { pos: [0, 0.02, -0.1] });
      b.add(box(1.7, 0.55, 1.05), C.wood, { pos: [0, 0.34, -0.1] });
      for (const x of [-0.85, -0.42, 0, 0.42, 0.85]) b.add(box(0.07, 0.55, 1.08), C.timber, { pos: [x, 0.34, -0.1] });
      b.add(gableRoof(1.25, 1.95, 0.75), C.thatch, { pos: [0, 0.6, -0.1] });
      b.add(box(1.95, 0.07, 0.07), C.thatchDark, { pos: [0, 1.36, -0.1] });
      for (const x of [-0.9, 0.9]) b.add(cone(0.06, 0.3, 4), C.darkTimber, { pos: [x, 1.45, -0.1], rot: [0, 0, x > 0 ? -0.5 : 0.5] });
      b.add(box(0.28, 0.4, 0.05), C.door, { pos: [-0.3, 0.26, 0.44] });
      b.add(box(0.2, 0.14, 0.05), C.darkTimber, { pos: [0.35, 0.4, 0.44] });
      if (opts.crest !== undefined) {
        b.add(cyl(0.02, 0.02, 1.0, 5), C.wood, { pos: [0.8, 0.5, 0.55] });
        b.add(box(0.03, 0.22, 0.26), opts.crest, { pos: [0.8, 0.88, 0.42] });
      }
      b.add(cyl(0.1, 0.1, 0.22, 8), C.wood, { pos: [-0.8, 0.11, 0.6] });
      logPile(b, 0.2, 0.75, 3);
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
    case 'outpost': {
      // A scouts' camp: two tents, a fire, and a tall pole flying the family's banner.
      for (const [x, z, r] of [[-0.35, -0.3, 0.5], [0.4, -0.1, 0.42]] as const) {
        b.add(cone(r, r * 1.5, 4), C.cloth, { pos: [x, r * 0.75, z], rot: [0, Math.PI / 4, 0] });
        b.add(box(0.12, r * 0.9, 0.04), C.clothShade, { pos: [x, r * 0.45, z + r * 0.62] });
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add(dodeca(0.05), C.stoneDark, { pos: [0.1 + Math.cos(a) * 0.14, 0.03, 0.55 + Math.sin(a) * 0.14] });
      }
      b.add(cone(0.07, 0.16, 5), C.ember, { pos: [0.1, 0.08, 0.55] });
      b.add(cyl(0.035, 0.04, 2.4, 5), C.wood, { pos: [-0.75, 1.2, 0.35] });
      b.add(box(0.03, 0.34, 0.5), opts.crest ?? 0xc0392b, { pos: [-0.75, 2.2, 0.6] });
      logPile(b, 0.62, 0.62, 2);
      break;
    }
    case 'henge': {
      // The Stone Circle: a ring of great standing stones with lintels, around an altar stone.
      b.add(cyl(1.4, 1.45, 0.06, 20), C.moss, { pos: [0, 0.02, 0] });
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = 0.95 + (i % 3) * 0.12;
        b.add(box(0.28, h, 0.18), i % 2 ? C.stone : C.rock, { pos: [Math.cos(a) * 1.15, h / 2, Math.sin(a) * 1.15], rot: [0, -a, 0] });
        if (i % 2 === 0) {
          const a2 = ((i + 1) / n) * Math.PI * 2;
          const mid = (a + a2) / 2;
          b.add(box(0.75, 0.13, 0.2), C.stoneDark, { pos: [Math.cos(mid) * 1.13, 1.12, Math.sin(mid) * 1.13], rot: [0, -mid + Math.PI / 2, 0] });
        }
      }
      b.add(box(0.7, 0.22, 0.4), C.stoneDark, { pos: [0, 0.11, 0] });
      b.add(cone(0.07, 0.18, 5), C.ember, { pos: [0, 0.3, 0] });
      b.add(cyl(0.03, 0.03, 1.8, 5), C.wood, { pos: [1.3, 0.9, 1.25] });
      b.add(box(0.03, 0.3, 0.45), opts.crest ?? 0xf2c14e, { pos: [1.3, 1.6, 1.48] });
      break;
    }
    case 'meadhall': {
      // The Mead Hall: a long carved hall with dragon-head gables and a feasting yard.
      b.add(box(2.7, 0.18, 1.9), C.stoneDark, { pos: [0, 0.05, -0.25] });
      b.add(box(2.5, 0.8, 1.55), C.wood, { pos: [0, 0.54, -0.25] });
      for (let i = 0; i < 7; i++) b.add(box(0.08, 0.8, 1.6), C.timber, { pos: [-1.2 + i * 0.4, 0.54, -0.25] });
      b.add(gableRoof(1.95, 2.8, 1.05), C.thatchDark, { pos: [0, 0.94, -0.25] });
      b.add(box(2.85, 0.09, 0.09), C.timber, { pos: [0, 2.0, -0.25] });
      for (const x of [-1.42, 1.42]) {
        b.add(cone(0.08, 0.5, 4), C.darkTimber, { pos: [x, 2.15, -0.25], rot: [0, 0, x > 0 ? -0.6 : 0.6] });
        b.add(sphere(0.09), C.darkTimber, { pos: [x * 1.12, 2.35, -0.25] });
      }
      b.add(box(0.5, 0.6, 0.06), C.door, { pos: [0, 0.4, 0.54] });
      for (const x of [-0.9, 0.9]) b.add(box(0.26, 0.18, 0.06), C.darkTimber, { pos: [x, 0.65, 0.54] });
      // Feasting yard: trestle tables and a roaring fire.
      for (const x of [-0.85, 0.85]) {
        b.add(box(0.7, 0.05, 0.22), C.lightWood, { pos: [x, 0.24, 1.05] });
        for (const sx of [-0.28, 0.28]) b.add(box(0.05, 0.22, 0.05), C.wood, { pos: [x + sx, 0.11, 1.05] });
      }
      b.add(cone(0.12, 0.28, 5), C.ember, { pos: [0, 0.14, 1.15] });
      for (const x of [-1.25, 1.25]) {
        b.add(cyl(0.03, 0.03, 2.1, 5), C.wood, { pos: [x, 1.05, 0.75] });
        b.add(box(0.03, 0.42, 0.34), opts.crest ?? 0xc0392b, { pos: [x, 1.85, 0.58] });
      }
      break;
    }
    case 'granary': {
      // The Great Granary: a store raised on staddle stones under a vast thatch, with sacks and baskets.
      for (const sx of [-0.95, 0, 0.95])
        for (const sz of [-0.85, 0.25]) {
          b.add(cyl(0.07, 0.1, 0.4, 6), C.stone, { pos: [sx, 0.2, sz - 0.2] });
          b.add(cyl(0.2, 0.16, 0.08, 8), C.stone, { pos: [sx, 0.44, sz - 0.2] });
        }
      b.add(box(2.3, 0.1, 1.5), C.lightWood, { pos: [0, 0.52, -0.5] });
      b.add(box(2.1, 0.75, 1.3), C.wood, { pos: [0, 0.94, -0.5] });
      for (let i = 0; i < 6; i++) b.add(box(0.07, 0.75, 1.34), C.timber, { pos: [-1.05 + i * 0.42, 0.94, -0.5] });
      b.add(gableRoof(1.8, 2.5, 1.1), C.thatch, { pos: [0, 1.31, -0.5] });
      b.add(box(2.55, 0.08, 0.08), C.thatchDark, { pos: [0, 2.42, -0.5] });
      b.add(box(0.36, 0.5, 0.06), C.door, { pos: [0, 0.98, 0.17] });
      for (let i = 0; i < 4; i++) b.add(box(0.36, 0.04, 0.12), C.lightWood, { pos: [0, 0.1 + i * 0.13, 0.35 + i * 0.05], rot: [0.3, 0, 0] });
      for (const [x, z] of [[-0.9, 0.95], [-0.62, 1.05], [0.75, 1.0], [1.0, 0.82]] as const) b.add(sphere(0.16), C.cloth, { pos: [x, 0.15, z], scale: [1, 1.2, 1] });
      b.add(cyl(0.18, 0.14, 0.25, 8), C.wood, { pos: [0.5, 0.12, 1.15] });
      for (const x of [-0.42, -0.3, 0.42]) b.add(sphere(0.06), C.berry, { pos: [x + 0.92, 0.28, 1.15] });
      break;
    }
    default:
      b.add(box(1.2, 0.8, 1.2), C.wood, { pos: [0, 0.4, 0] });
  }
  return b.build();
}

/** Props marking discoveries in the wild, centred on their tile. */
export function discoveryGeometry(kind: DiscoveryKind): THREE.BufferGeometry {
  const b = new ModelBuilder();
  switch (kind) {
    case 'cart':
      b.add(box(0.9, 0.12, 0.5), C.wood, { pos: [0, 0.3, 0], rot: [0, 0.3, 0.18] });
      b.add(cyl(0.2, 0.2, 0.05, 9), C.darkTimber, { pos: [-0.3, 0.2, 0.3], rot: [Math.PI / 2, 0, 0.3] });
      b.add(cyl(0.2, 0.2, 0.05, 9), C.darkTimber, { pos: [0.45, 0.05, -0.2], rot: [0.1, 0, Math.PI / 2] });
      b.add(box(0.26, 0.22, 0.26), C.lightWood, { pos: [0.1, 0.47, 0], rot: [0, 0.6, 0] });
      b.add(sphere(0.14), C.clothShade, { pos: [-0.25, 0.45, -0.05], scale: [1, 0.75, 1] });
      b.add(cyl(0.05, 0.05, 0.4, 6), C.wood, { pos: [0.3, 0.42, 0.1], rot: [0, 0, Math.PI / 2] });
      break;
    case 'ruins':
      b.add(box(1.2, 0.08, 0.9), C.stoneDark, { pos: [0, 0.03, 0] });
      for (const [x, h] of [[-0.45, 0.9], [0.45, 0.65]]) b.add(box(0.2, h, 0.2), C.stone, { pos: [x, h / 2, -0.2] });
      b.add(box(1.1, 0.16, 0.24), C.stone, { pos: [-0.05, 0.86, -0.2], rot: [0, 0, -0.18] });
      b.add(box(0.3, 0.2, 0.2), C.stoneDark, { pos: [0.2, 0.1, 0.3], rot: [0, 0.5, 0.2] });
      b.add(box(0.2, 0.14, 0.34), C.stone, { pos: [-0.3, 0.07, 0.35], rot: [0, -0.3, 0] });
      b.add(ico(0.16, 0), C.moss, { pos: [-0.45, 0.95, -0.2], scale: [1.2, 0.4, 1.2] });
      break;
    case 'wanderers':
      b.add(cone(0.45, 0.7, 4), C.cloth, { pos: [-0.2, 0.35, -0.1], rot: [0, Math.PI / 4, 0] });
      b.add(cone(0.32, 0.55, 4), C.clothShade, { pos: [0.4, 0.27, -0.3], rot: [0, 0.3, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(dodeca(0.05), C.stoneDark, { pos: [0.25 + Math.cos(a) * 0.15, 0.03, 0.35 + Math.sin(a) * 0.15] });
      }
      b.add(cone(0.08, 0.18, 5), C.ember, { pos: [0.25, 0.09, 0.35] });
      break;
    case 'stones':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 0.6 + ((i * 37) % 5) * 0.08;
        b.add(box(0.2, h, 0.13), i % 2 ? C.stone : C.stoneDark, { pos: [Math.cos(a) * 0.7, h / 2, Math.sin(a) * 0.7], rot: [0, -a, ((i % 3) - 1) * 0.08] });
      }
      b.add(box(0.5, 0.12, 0.3), C.stone, { pos: [0, 0.06, 0] });
      break;
    case 'starstone':
      // A scorched crater with a dark, glowing star-stone at its heart.
      b.add(cyl(0.95, 1.05, 0.08, 14), C.rockDark, { pos: [0, 0.02, 0] });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.add(dodeca(0.16), C.rock, { pos: [Math.cos(a) * 0.95, 0.06, Math.sin(a) * 0.95] });
      }
      b.add(dodeca(0.42), 0x2b2540, { pos: [0, 0.32, 0], scale: [1, 1.25, 0.9] });
      for (const [x, y, z] of [[0.18, 0.55, 0.12], [-0.2, 0.42, -0.1], [0.05, 0.75, -0.05]] as const) b.add(ico(0.09, 0), 0x9fe8ff, { pos: [x, y, z] });
      break;
    case 'barrow':
      // A long grassy mound with a dark stone doorway and a capstone.
      b.add(sphere(0.9, 9, 6), C.moss, { pos: [0, -0.15, -0.1], scale: [1.2, 0.55, 0.9] });
      for (const x of [-0.18, 0.18]) b.add(box(0.12, 0.42, 0.14), C.stone, { pos: [x, 0.21, 0.62] });
      b.add(box(0.5, 0.1, 0.18), C.stoneDark, { pos: [0, 0.45, 0.62] });
      b.add(box(0.24, 0.32, 0.04), 0x1d140c, { pos: [0, 0.16, 0.66] });
      break;
    case 'hermit':
      // A tiny turf-roofed hut with a crooked chimney and a herb patch.
      b.add(box(0.6, 0.38, 0.5), C.wattle, { pos: [0, 0.19, 0] });
      b.add(gableRoof(0.66, 0.74, 0.36), C.moss, { pos: [0, 0.38, 0] });
      b.add(box(0.1, 0.32, 0.1), C.stoneDark, { pos: [0.22, 0.6, -0.1], rot: [0, 0, 0.12] });
      b.add(box(0.16, 0.26, 0.04), C.door, { pos: [-0.1, 0.13, 0.26] });
      for (const x of [0.3, 0.42, 0.54]) b.add(ico(0.06, 0), C.leafLight, { pos: [x, 0.06, 0.4] });
      break;
    case 'hoard':
      // A half-buried chest spilling silver, with a spade left in the earth.
      b.add(box(0.5, 0.3, 0.34), C.darkTimber, { pos: [0, 0.12, 0], rot: [0, 0.4, 0.1] });
      b.add(box(0.52, 0.06, 0.36), C.iron, { pos: [0, 0.3, 0], rot: [0, 0.4, 0.1] });
      for (const [x, z] of [[0.3, 0.25], [0.38, 0.12], [0.22, 0.34], [-0.3, 0.3]] as const) b.add(cyl(0.06, 0.06, 0.02, 8), 0xe8e4d8, { pos: [x, 0.02, z] });
      b.add(box(0.05, 0.6, 0.05), C.wood, { pos: [-0.35, 0.3, -0.2], rot: [0.2, 0, -0.3] });
      b.add(box(0.16, 0.2, 0.03), C.iron, { pos: [-0.27, 0.05, -0.17], rot: [0.2, 0, -0.3] });
      break;
    case 'spring':
      // A clear pool ringed with mossy stones, steam rising.
      b.add(cyl(0.55, 0.6, 0.06, 12), 0x5fb0c9, { pos: [0, 0.03, 0] });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add(dodeca(0.12), i % 3 ? C.stone : C.moss, { pos: [Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62] });
      }
      for (const [x, z, h] of [[-0.1, 0.05, 0.5], [0.12, -0.1, 0.65]] as const) b.add(sphere(0.09), 0xf4f1ea, { pos: [x, h, z], scale: [1, 1.4, 1] });
      break;
    case 'shrine':
      // A carved wooden shrine: two posts, a little roof, an offering stone with a candle.
      for (const x of [-0.3, 0.3]) b.add(cyl(0.05, 0.06, 0.9, 6), C.darkTimber, { pos: [x, 0.45, 0] });
      b.add(gableRoof(0.4, 0.86, 0.26), C.thatchDark, { pos: [0, 0.9, 0] });
      b.add(box(0.36, 0.2, 0.24), C.stone, { pos: [0, 0.1, 0] });
      b.add(cyl(0.03, 0.03, 0.1, 6), 0xf4ead0, { pos: [0, 0.25, 0] });
      b.add(cone(0.025, 0.06, 5), C.ember, { pos: [0, 0.33, 0] });
      break;
    default:
      // Resource prizes get a carved waymarker post.
      b.add(cyl(0.06, 0.07, 0.9, 6), C.timber, { pos: [0, 0.45, 0] });
      b.add(box(0.36, 0.18, 0.04), C.lightWood, { pos: [0.12, 0.72, 0], rot: [0, 0, -0.1] });
      b.add(cone(0.08, 0.14, 4), C.thatch, { pos: [0, 0.97, 0] });
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
  else if (good === 'fish') {
    b.add(sphere(0.06, 6, 4), 0x8fa9b8, { scale: [2.2, 0.8, 1] });
    b.add(cone(0.05, 0.08, 4), 0x6f8a99, { pos: [-0.16, 0, 0], rot: [0, 0, Math.PI / 2] });
    b.add(sphere(0.05, 6, 4), 0x9fb7c4, { pos: [0.02, 0.06, 0.04], scale: [2, 0.8, 1], rot: [0, 0.5, 0] });
  }
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

