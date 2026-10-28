import * as THREE from 'three';
import { treeGeometry, treeKind, jitter } from './nature';
import type { HeightField } from './terrain';

const MAX_PARTICLES = 1500;

export type ParticleKind = 'chips' | 'stone' | 'leaves' | 'dust' | 'smoke' | 'ember' | 'sparkle' | 'soil' | 'snow';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  drag: number;
  grow: number;
  color: THREE.Color;
}

const KIND: Record<ParticleKind, { colors: number[]; size: [number, number]; speed: number; up: number; gravity: number; life: [number, number]; drag: number; grow: number }> = {
  chips: { colors: [0xd9a86c, 0xc48a4f, 0xf0c88a], size: [0.03, 0.06], speed: 1.4, up: 1.8, gravity: 7, life: [0.5, 0.9], drag: 0.5, grow: 0 },
  stone: { colors: [0xb8b2a6, 0x8e887d, 0xd6d0c4], size: [0.03, 0.06], speed: 1.2, up: 1.6, gravity: 8, life: [0.4, 0.8], drag: 0.5, grow: 0 },
  leaves: { colors: [0x5f9a3e, 0x86bb4c, 0x3f7a4a], size: [0.04, 0.07], speed: 1.6, up: 1.4, gravity: 1.5, life: [0.9, 1.6], drag: 2.2, grow: 0 },
  dust: { colors: [0xe8dcc0, 0xd8c8a4], size: [0.1, 0.2], speed: 1.5, up: 0.5, gravity: -0.3, life: [0.6, 1.1], drag: 2.5, grow: 1.2 },
  smoke: { colors: [0xd8d4cc, 0xc4c0b8, 0xeeeae2], size: [0.06, 0.11], speed: 0.08, up: 0.45, gravity: -0.05, life: [2.0, 3.2], drag: 0.3, grow: 1.4 },
  ember: { colors: [0xffb347, 0xff7a1a], size: [0.025, 0.04], speed: 0.15, up: 0.7, gravity: -0.1, life: [0.4, 0.9], drag: 0.5, grow: -0.6 },
  sparkle: { colors: [0xfff2a8, 0xffffff, 0xffd86b], size: [0.04, 0.07], speed: 1.0, up: 1.8, gravity: 2, life: [0.6, 1.1], drag: 1, grow: -0.5 },
  soil: { colors: [0x6b4f33, 0x8a6a45], size: [0.03, 0.05], speed: 0.9, up: 1.4, gravity: 7, life: [0.4, 0.7], drag: 0.5, grow: 0 },
  snow: { colors: [0xffffff, 0xeef4ff], size: [0.03, 0.05], speed: 0.25, up: -0.6, gravity: 0.15, life: [5, 7], drag: 0.1, grow: 0 },
};

interface FallingTree {
  mesh: THREE.Mesh;
  t: number;
  axis: THREE.Vector3;
  base: THREE.Vector3;
  scale: number;
  rot: number;
  landed: boolean;
}

export class Effects {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private trees: FallingTree[] = [];
  private treeGeo = { conifer: treeGeometry('conifer'), broad: treeGeometry('broad'), birch: treeGeometry('birch') };
  private treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, transparent: true });
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private rand = mulberry(1234);

  constructor(private hf: HeightField) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), MAX_PARTICLES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    this.group.add(this.mesh);
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, n: number): void {
    const k = KIND[kind];
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = k.speed * (0.4 + this.rand() * 0.8);
      const life = k.life[0] + this.rand() * (k.life[1] - k.life[0]);
      this.parts.push({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: k.up * (0.6 + this.rand() * 0.6),
        life,
        max: life,
        size: k.size[0] + this.rand() * (k.size[1] - k.size[0]),
        gravity: k.gravity,
        drag: k.drag,
        grow: k.grow,
        color: new THREE.Color(k.colors[Math.floor(this.rand() * k.colors.length)]),
      });
    }
  }

  /** Gentle snowfall over an area (call each frame with a small count). */
  snowfall(cx: number, cz: number, radius: number, top: number, n: number): void {
    for (let i = 0; i < n; i++) this.emit('snow', cx + (this.rand() - 0.5) * radius * 2, top, cz + (this.rand() - 0.5) * radius * 2, 1);
  }

  fellTree(tx: number, ty: number): void {
    const kind = treeKind(tx, ty);
    const j = jitter(tx, ty);
    const x = tx + 0.5 + j.dx;
    const z = ty + 0.5 + j.dz;
    const mesh = new THREE.Mesh(this.treeGeo[kind], this.treeMat.clone());
    mesh.castShadow = true;
    const dir = this.rand() * Math.PI * 2;
    this.trees.push({
      mesh,
      t: 0,
      axis: new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir)),
      base: new THREE.Vector3(x, this.hf.at(x, z), z),
      scale: j.scale,
      rot: j.rot,
      landed: false,
    });
    this.group.add(mesh);
    this.emit('leaves', x, this.hf.at(x, z) + 0.9, z, 6);
  }

  update(dt: number): void {
    // Falling trees: accelerate over, bounce of leaves on impact, then sink away.
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const ft = this.trees[i];
      ft.t += dt;
      const fall = Math.min(1, ft.t / 0.9);
      const angle = fall * fall * (Math.PI / 2 - 0.1);
      this.q.setFromAxisAngle(ft.axis, angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ft.rot));
      const sink = Math.max(0, ft.t - 1.3) * 0.5;
      ft.mesh.position.set(ft.base.x, ft.base.y - sink, ft.base.z);
      ft.mesh.quaternion.copy(this.q);
      ft.mesh.scale.setScalar(ft.scale);
      if (fall >= 1 && !ft.landed) {
        ft.landed = true;
        const tip = new THREE.Vector3(0, 0.9 * ft.scale, 0).applyQuaternion(this.q).add(ft.base);
        this.emit('leaves', tip.x, tip.y + 0.1, tip.z, 14);
        this.emit('dust', tip.x, tip.y, tip.z, 6);
      }
      (ft.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 1 - Math.max(0, ft.t - 1.6) * 1.5);
      if (ft.t > 2.3) {
        this.group.remove(ft.mesh);
        (ft.mesh.material as THREE.Material).dispose();
        this.trees.splice(i, 1);
      }
    }

    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const ground = this.hf.at(p.x, p.z);
      if (p.y < ground + 0.01) {
        p.y = ground + 0.01;
        p.vy = Math.abs(p.vy) * 0.25;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const age = 1 - p.life / p.max;
      const size = Math.max(0.001, p.size * (1 + p.grow * age)) * Math.min(1, p.life * 4);
      this.q.setFromAxisAngle(this.v.set(0.3, 1, 0.2).normalize(), p.life * 6);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(size, size, size));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Small cosmetic PRNG (render-side only; never used by the simulation). */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
