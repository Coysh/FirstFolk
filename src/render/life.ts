import * as THREE from 'three';
import { Terrain, type MapData } from '../sim/mapgen';
import { hash2 } from '../sim/rng';
import { ModelBuilder, box, cone, ico } from './modelBuilder';
import type { HeightField } from './terrain';

/**
 * Cosmetic wildlife: wheeling birds, butterflies over meadows and grazing deer at forest
 * edges. Render-only; never touches the simulation.
 */
export class Wildlife {
  readonly group = new THREE.Group();
  private birds: THREE.InstancedMesh;
  private flies: THREE.InstancedMesh;
  private deer: THREE.Group[] = [];
  private flocks: { cx: number; cz: number; r: number; h: number; n: number; speed: number; phase: number }[] = [];
  private flySpots: { x: number; z: number; ph: number; color: THREE.Color }[] = [];
  private deerState: { x: number; z: number; tx: number; tz: number; yaw: number; graze: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(private map: MapData, private hf: HeightField, home: { x: number; y: number }) {
    const N = map.size;
    // Birds: a body and two wings flapping via scale; merged into one tiny model.
    const bird = new ModelBuilder()
      .add(box(0.08, 0.05, 0.22), 0x3b3330)
      .add(box(0.5, 0.015, 0.12), 0x4a403b, { pos: [0, 0.01, 0] })
      .build();
    this.birds = new THREE.InstancedMesh(bird, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), 40);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);
    for (let i = 0; i < 4; i++) {
      this.flocks.push({
        cx: home.x + (hash2(i, 1, 70) - 0.5) * 50,
        cz: home.y + (hash2(i, 2, 70) - 0.5) * 50,
        r: 6 + hash2(i, 3, 70) * 10,
        h: 9 + hash2(i, 4, 70) * 6,
        n: 3 + Math.floor(hash2(i, 5, 70) * 5),
        speed: 0.25 + hash2(i, 6, 70) * 0.2,
        phase: hash2(i, 7, 70) * 6,
      });
    }

    const fly = new THREE.PlaneGeometry(0.12, 0.08).rotateX(-Math.PI / 2);
    this.flies = new THREE.InstancedMesh(fly, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 120);
    this.flies.frustumCulled = false;
    const colors = [0xfff4b0, 0xffffff, 0xf6b7d2, 0xffc46b];
    for (let j = 2; j < N - 2 && this.flySpots.length < 120; j += 2)
      for (let i = 2; i < N - 2 && this.flySpots.length < 120; i += 2)
        if (map.terrain[j * N + i] === Terrain.Meadow && hash2(i, j, 71) > 0.82)
          this.flySpots.push({ x: i + 0.5, z: j + 0.5, ph: hash2(i, j, 72) * 10, color: new THREE.Color(colors[Math.floor(hash2(i, j, 73) * colors.length)]) });
    this.flySpots.forEach((f, i) => this.flies.setColorAt(i, f.color));
    this.flies.count = this.flySpots.length;
    this.group.add(this.flies);

    // A few deer near forest edges, away from the start clearing.
    const deerGeo = new ModelBuilder()
      .add(box(0.22, 0.2, 0.5), 0x9a6a3e, { pos: [0, 0.38, 0] })
      .add(box(0.05, 0.28, 0.05), 0x7a5230, { pos: [-0.07, 0.14, 0.18] })
      .add(box(0.05, 0.28, 0.05), 0x7a5230, { pos: [0.07, 0.14, 0.18] })
      .add(box(0.05, 0.28, 0.05), 0x7a5230, { pos: [-0.07, 0.14, -0.18] })
      .add(box(0.05, 0.28, 0.05), 0x7a5230, { pos: [0.07, 0.14, -0.18] })
      .add(box(0.1, 0.24, 0.1), 0x9a6a3e, { pos: [0, 0.56, 0.26], rot: [0.5, 0, 0] })
      .add(box(0.12, 0.1, 0.18), 0x8a5c34, { pos: [0, 0.68, 0.34] })
      .add(cone(0.02, 0.16, 4), 0x5a4a3a, { pos: [-0.05, 0.8, 0.3] })
      .add(cone(0.02, 0.16, 4), 0x5a4a3a, { pos: [0.05, 0.8, 0.3] })
      .add(ico(0.04, 0), 0xf3eadc, { pos: [0, 0.42, -0.26] })
      .build();
    const deerMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    let placed = 0;
    for (let k = 0; k < 400 && placed < 7; k++) {
      const i = 4 + Math.floor(hash2(k, 0, 74) * (N - 8));
      const j = 4 + Math.floor(hash2(k, 1, 74) * (N - 8));
      if (map.terrain[j * N + i] !== Terrain.Grass && map.terrain[j * N + i] !== Terrain.Meadow) continue;
      if (Math.hypot(i - home.x, j - home.y) < 18) continue;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(deerGeo, deerMat);
      mesh.castShadow = true;
      g.add(mesh);
      this.group.add(g);
      this.deer.push(g);
      this.deerState.push({ x: i + 0.5, z: j + 0.5, tx: i + 0.5, tz: j + 0.5, yaw: hash2(k, 2, 74) * 6, graze: 2 + hash2(k, 3, 74) * 4 });
      placed++;
    }
  }

  update(time: number, dt: number): void {
    let b = 0;
    for (const f of this.flocks) {
      for (let k = 0; k < f.n; k++) {
        const a = time * f.speed + f.phase + k * 0.35;
        const r = f.r + Math.sin(k * 1.7) * 1.5;
        const x = f.cx + Math.cos(a) * r;
        const z = f.cz + Math.sin(a) * r;
        const y = f.h + Math.sin(time * 0.8 + k) * 0.6;
        this.e.set(0, -a, Math.sin(time * 9 + k) * 0.35);
        this.q.setFromEuler(this.e);
        const flap = 0.5 + Math.abs(Math.sin(time * 9 + k * 1.3)) * 0.8;
        this.m.compose(this.v.set(x, y, z), this.q, this.s.set(flap, 1, 1));
        this.birds.setMatrixAt(b++, this.m);
      }
    }
    this.birds.count = b;
    this.birds.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.flySpots.length; i++) {
      const f = this.flySpots[i];
      const t = time * 0.7 + f.ph;
      const x = f.x + Math.sin(t * 1.3) * 0.9;
      const z = f.z + Math.cos(t * 0.9) * 0.9;
      const y = this.hf.at(x, z) + 0.35 + Math.sin(t * 3) * 0.12;
      this.e.set(0, t, 0);
      this.q.setFromEuler(this.e);
      const flap = 0.3 + Math.abs(Math.sin(time * 14 + f.ph)) * 0.9;
      this.m.compose(this.v.set(x, y, z), this.q, this.s.set(flap, 1, 1));
      this.flies.setMatrixAt(i, this.m);
    }
    this.flies.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.deer.length; i++) {
      const d = this.deerState[i];
      const g = this.deer[i];
      const dx = d.tx - d.x;
      const dz = d.tz - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const step = Math.min(dist, dt * 0.9);
        d.x += (dx / dist) * step;
        d.z += (dz / dist) * step;
        d.yaw = Math.atan2(dx, dz);
      } else {
        d.graze -= dt;
        if (d.graze <= 0) {
          d.graze = 3 + Math.random() * 6;
          const nx = d.x + (Math.random() - 0.5) * 6;
          const nz = d.z + (Math.random() - 0.5) * 6;
          const t = this.map.terrain[Math.floor(nz) * this.map.size + Math.floor(nx)];
          if (t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest) {
            d.tx = nx;
            d.tz = nz;
          }
        }
      }
      g.position.set(d.x, this.hf.at(d.x, d.z), d.z);
      g.rotation.y = d.yaw;
      // Grazing: head bob via a slight pitch.
      g.rotation.x = dist > 0.05 ? 0 : Math.max(0, Math.sin(time * 0.7 + i)) * 0.18;
    }
  }
}
