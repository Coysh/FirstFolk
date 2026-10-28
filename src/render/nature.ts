import * as THREE from 'three';
import { BALANCE } from '../sim/balance';
import { hash2 } from '../sim/rng';
import type { World } from '../sim/world';
import { ModelBuilder, box, cone, cyl, dodeca, ico, sphere } from './modelBuilder';
import { C } from './palette';
import type { HeightField } from './terrain';
import { withWind } from './wind';

export type TreeKind = 'conifer' | 'broad' | 'birch';

const MAX = 6000;

export function treeKind(x: number, y: number): TreeKind {
  const h = hash2(x, y, 5);
  return h > 0.48 ? 'conifer' : h > 0.14 ? 'broad' : 'birch';
}

export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (kind === 'conifer') {
    b.add(cyl(0.06, 0.1, 0.5, 5), C.bark, { pos: [0, 0.25, 0] });
    b.add(cone(0.46, 0.72, 7), C.conifer, { pos: [0, 0.68, 0] });
    b.add(cone(0.36, 0.6, 7), 0x4a8a52, { pos: [0, 1.02, 0] });
    b.add(cone(0.23, 0.46, 7), 0x55965a, { pos: [0, 1.32, 0] });
  } else if (kind === 'broad') {
    b.add(cyl(0.07, 0.11, 0.6, 5), C.bark, { pos: [0, 0.3, 0] });
    b.add(cyl(0.03, 0.04, 0.3, 4), C.bark, { pos: [0.12, 0.62, 0], rot: [0, 0, -0.7] });
    b.add(ico(0.46, 0), C.leaf, { pos: [0, 0.9, 0] });
    b.add(ico(0.32, 0), C.leafLight, { pos: [0.22, 1.08, 0.1] });
    b.add(ico(0.28, 0), 0x6aa24a, { pos: [-0.22, 1.0, -0.12] });
  } else {
    b.add(cyl(0.045, 0.06, 0.95, 5), 0xece6da, { pos: [0, 0.47, 0] });
    b.add(box(0.05, 0.03, 0.05), 0x3b3530, { pos: [0, 0.35, 0.04] });
    b.add(box(0.05, 0.03, 0.05), 0x3b3530, { pos: [0.02, 0.6, -0.03] });
    b.add(ico(0.3, 0), 0xa7c95a, { pos: [0, 1.0, 0], scale: [1, 1.35, 1] });
    b.add(ico(0.2, 0), 0xbdd66e, { pos: [0.12, 1.25, 0.05] });
  }
  return b.build();
}

/** Deterministic cosmetic jitter per tile, so trees don't sit on a visible grid. */
export function jitter(x: number, y: number): { dx: number; dz: number; rot: number; scale: number } {
  return {
    dx: (hash2(x, y, 1) - 0.5) * 0.3,
    dz: (hash2(x, y, 2) - 0.5) * 0.3,
    rot: hash2(x, y, 3) * Math.PI * 2,
    scale: 0.85 + hash2(x, y, 4) * 0.35,
  };
}

const vertexMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
const tint = new THREE.Color();

export class Nature {
  readonly group = new THREE.Group();
  private trees: Record<TreeKind, THREE.InstancedMesh>;
  private stumps: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh;
  private bushes: THREE.InstancedMesh;
  private berries: THREE.InstancedMesh;
  private version = -1;
  private lastRebuild = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private hf: HeightField) {
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX);
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.trees = {
      conifer: mk(treeGeometry('conifer'), withWind(vertexMat(), 0.045, 0.4)),
      broad: mk(treeGeometry('broad'), withWind(vertexMat(), 0.06, 0.5)),
      birch: mk(treeGeometry('birch'), withWind(vertexMat(), 0.08, 0.5)),
    };
    for (const t of Object.values(this.trees)) t.setColorAt(0, tint.setRGB(1, 1, 1));
    const stump = new ModelBuilder().add(cyl(0.08, 0.1, 0.12, 6), C.bark, { pos: [0, 0.06, 0] }).add(cyl(0.075, 0.075, 0.01, 6), C.lightWood, { pos: [0, 0.125, 0] }).build();
    this.stumps = mk(stump, vertexMat());
    const rock = new ModelBuilder()
      .add(dodeca(0.3), C.rock, { pos: [0, 0.15, 0], scale: [1.1, 0.8, 1] })
      .add(dodeca(0.17), C.rockDark, { pos: [0.24, 0.08, 0.12] })
      .add(dodeca(0.12), C.rock, { pos: [-0.2, 0.05, 0.18] })
      .build();
    this.rocks = mk(rock, vertexMat());
    const bush = new ModelBuilder().add(ico(0.26, 0), C.bush, { pos: [0, 0.2, 0], scale: [1.2, 0.85, 1.1] }).add(ico(0.16, 0), C.leaf, { pos: [0.15, 0.28, 0.05] }).build();
    this.bushes = mk(bush, withWind(vertexMat(), 0.08, 0.1));
    this.berries = mk(sphere(0.05, 5, 4), new THREE.MeshStandardMaterial({ color: C.berry, flatShading: true, roughness: 0.5 }));
    this.berries.castShadow = false;
  }

  update(world: World, time: number): void {
    // Saplings grow continuously, so refresh about once a second even without changes.
    if (world.natureVersion === this.version && time - this.lastRebuild < 1) return;
    this.version = world.natureVersion;
    this.lastRebuild = time;
    const nt: Record<TreeKind, number> = { conifer: 0, broad: 0, birch: 0 };
    let ns = 0;
    let nr = 0;
    let nbush = 0;
    let nberry = 0;
    for (const n of world.nodes.values()) {
      const j = jitter(n.x, n.y);
      const x = n.x + 0.5 + j.dx;
      const z = n.y + 0.5 + j.dz;
      const y = this.hf.at(x, z);
      if (n.kind === 'tree') {
        if (n.stump > 0) {
          this.place(this.stumps, ns++, x, y, z, j.rot, 1);
          continue;
        }
        const grown = n.growth > 0 ? 0.25 + 0.75 * (1 - n.growth / BALANCE.saplingGrowTicks) : 1;
        const kind = treeKind(n.x, n.y);
        const mesh = this.trees[kind];
        const i = nt[kind]++;
        this.place(mesh, i, x, y, z, j.rot, j.scale * grown);
        // Subtle per-tree tint so forests aren't a uniform green.
        const v = hash2(n.x, n.y, 8);
        mesh.setColorAt(i, tint.setRGB(0.88 + v * 0.22, 0.92 + v * 0.14, 0.86 + (1 - v) * 0.16));
      } else if (n.kind === 'rock') {
        this.place(this.rocks, nr++, x, y, z, j.rot, 0.55 + (0.45 * n.amount) / n.max);
      } else {
        this.place(this.bushes, nbush++, x, y, z, j.rot, j.scale * 0.9);
        for (let i = 0; i < n.amount; i++) {
          const a = j.rot + i * 1.7;
          this.place(this.berries, nberry++, x + Math.cos(a) * 0.22, y + 0.2 + (i % 2) * 0.1, z + Math.sin(a) * 0.2, 0, 1);
        }
      }
    }
    const fin = (m: THREE.InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    };
    for (const k of Object.keys(this.trees) as TreeKind[]) {
      fin(this.trees[k], nt[k]);
      if (this.trees[k].instanceColor) this.trees[k].instanceColor!.needsUpdate = true;
    }
    fin(this.stumps, ns);
    fin(this.rocks, nr);
    fin(this.bushes, nbush);
    fin(this.berries, nberry);
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rot: number, scale: number) {
    if (i >= MAX) return;
    this.q.setFromAxisAngle(this.up, rot);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    mesh.setMatrixAt(i, this.m);
  }
}
