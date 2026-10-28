import * as THREE from 'three';
import { SKILLS, type Good, type Skill, type Tool } from '../sim/defs';
import { tierOf } from '../sim/trades';
import { CREST_COLORS } from '../sim/population';
import { hash2 } from '../sim/rng';
import { comeOfAgeTicks, type Settler, type World } from '../sim/world';
import type { Effects } from './effects';
import { goodGeometry } from './models';
import { ModelBuilder, box, cone, cyl, sphere } from './modelBuilder';
import { C, SKINS, TUNICS } from './palette';
import type { HeightField } from './terrain';

const MAX = 1024;

/** Joint positions in adult model space (feet at y = 0, facing +z). */
const HIP_Y = 0.18;
const SHOULDER_Y = 0.37;
const ARM_LEN = 0.17;

function toolGeometry(tool: Tool): THREE.BufferGeometry {
  const b = new ModelBuilder();
  // Tools are held at the hand with the handle pointing along +z (forward when the arm hangs).
  switch (tool) {
    case 'axe':
      b.add(box(0.025, 0.025, 0.3), C.wood, { pos: [0, 0, 0.12] });
      b.add(box(0.02, 0.09, 0.07), C.iron, { pos: [0, 0.03, 0.25] });
      break;
    case 'pick':
      b.add(box(0.025, 0.025, 0.3), C.wood, { pos: [0, 0, 0.12] });
      b.add(box(0.02, 0.2, 0.03), C.iron, { pos: [0, 0, 0.26], rot: [0.25, 0, 0] });
      break;
    case 'hammer':
      b.add(box(0.022, 0.022, 0.2), C.wood, { pos: [0, 0, 0.08] });
      b.add(box(0.05, 0.05, 0.08), C.iron, { pos: [0, 0, 0.18], rot: [Math.PI / 2, 0, 0] });
      break;
    case 'shovel':
      b.add(box(0.022, 0.022, 0.34), C.wood, { pos: [0, 0, 0.12] });
      b.add(box(0.08, 0.015, 0.1), C.iron, { pos: [0, 0, 0.32] });
      break;
    case 'basket':
      b.add(cyl(0.07, 0.05, 0.07, 7), C.lightWood, { pos: [0, -0.06, 0.03] });
      b.add(sphere(0.025, 4, 3), C.berry, { pos: [0.02, -0.02, 0.03] });
      break;
    case 'saw':
      b.add(box(0.025, 0.06, 0.06), C.wood, { pos: [0, 0, 0.02] });
      b.add(box(0.01, 0.07, 0.34), C.iron, { pos: [0, -0.02, 0.2] });
      break;
  }
  return b.build();
}

interface Anim {
  yaw: number;
  phase: number;
  px: number;
  pz: number;
}

/**
 * All settlers are drawn with a handful of InstancedMeshes (one per body part / tool / cargo),
 * posed procedurally every frame — hundreds of animated settlers in ~15 draw calls.
 */
export class SettlersView {
  readonly group = new THREE.Group();
  private parts: Record<'body' | 'head' | 'hat' | 'armL' | 'armR' | 'legL' | 'legR', THREE.InstancedMesh>;
  /** Trade gear: leather aprons for Journeymen, a gold badge and feather for Masters. */
  private apron: THREE.InstancedMesh;
  private badge: THREE.InstancedMesh;
  private feather: THREE.InstancedMesh;
  /** Hooks for audio and footpaths. */
  onStrike: ((tool: Tool, x: number, y: number, z: number) => void) | null = null;
  onStep: ((x: number, z: number, amount: number) => void) | null = null;
  private tools: Record<Tool, THREE.InstancedMesh>;
  private cargo: Record<Good, THREE.InstancedMesh>;
  private anim = new Map<number, Anim>();
  /** Positions at the previous tick, for interpolation. */
  private prev = new Map<number, { x: number; z: number }>();
  /** Latest rendered positions (for picking / selection). */
  readonly positions = new Map<number, THREE.Vector3>();

  private base = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(private hf: HeightField, private effects: Effects) {
    const mat = () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
    const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    const mk = (geo: THREE.BufferGeometry, material: THREE.Material, colored: boolean) => {
      const im = new THREE.InstancedMesh(geo, material, MAX);
      im.castShadow = true;
      im.count = 0;
      im.frustumCulled = false;
      if (colored) im.setColorAt(0, new THREE.Color());
      this.group.add(im);
      return im;
    };
    const limb = (w: number, h: number) => new THREE.BoxGeometry(w, h, w).translate(0, -h / 2, 0);
    this.parts = {
      body: mk(new THREE.CylinderGeometry(0.075, 0.11, 0.22, 7).translate(0, HIP_Y + 0.11, 0), mat(), true),
      head: mk(new THREE.IcosahedronGeometry(0.085, 1).translate(0, 0.47, 0), mat(), true),
      hat: mk(cone(0.095, 0.13, 7).translate(0, 0.585, 0), mat(), true),
      armL: mk(limb(0.05, ARM_LEN), mat(), true),
      armR: mk(limb(0.05, ARM_LEN), mat(), true),
      legL: mk(limb(0.065, HIP_Y), mat(), true),
      legR: mk(limb(0.065, HIP_Y), mat(), true),
    };
    this.tools = {
      axe: mk(toolGeometry('axe'), vmat, false),
      pick: mk(toolGeometry('pick'), vmat, false),
      hammer: mk(toolGeometry('hammer'), vmat, false),
      shovel: mk(toolGeometry('shovel'), vmat, false),
      basket: mk(toolGeometry('basket'), vmat, false),
      saw: mk(toolGeometry('saw'), vmat, false),
    };
    this.apron = mk(new THREE.BoxGeometry(0.15, 0.2, 0.03).translate(0, HIP_Y + 0.1, 0.085), mat(), true);
    this.badge = mk(new THREE.OctahedronGeometry(0.03).translate(0, 0.36, 0.085), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x6b4a00, metalness: 0.6, roughness: 0.3 }), false);
    this.feather = mk(new THREE.ConeGeometry(0.018, 0.16, 4).rotateZ(-0.5).translate(0.07, 0.62, 0), new THREE.MeshStandardMaterial({ color: 0xfff6e0, flatShading: true }), false);
    this.cargo = {
      logs: mk(goodGeometry('logs').scale(1.3, 1.3, 1.3), vmat, false),
      planks: mk(goodGeometry('planks').scale(1.3, 1.3, 1.3), vmat, false),
      stone: mk(goodGeometry('stone').scale(1.3, 1.3, 1.3), vmat, false),
      berries: mk(goodGeometry('berries').scale(1.3, 1.3, 1.3), vmat, false),
    };
  }

  /** Sim-space position of a settler (tile units, centre of tile = +0.5). */
  private simPos(world: World, s: Settler): { x: number; z: number } {
    let x = s.x;
    let y = s.y;
    if (s.next >= 0) {
      const nx = s.next % world.size;
      const ny = (s.next - nx) / world.size;
      const f = s.progress / s.stepLen;
      x += (nx - s.x) * f;
      y += (ny - s.y) * f;
    }
    // Spread people sharing a tile; workers step right up to the tree or rock they work on.
    let ox = (hash2(s.id, 0, 9) - 0.5) * 0.4;
    let oz = (hash2(s.id, 1, 9) - 0.5) * 0.4;
    if (s.anim === 'work' && s.faceTile >= 0 && s.next < 0) {
      const fx = s.faceTile % world.size;
      const fy = (s.faceTile - fx) / world.size;
      const dx = fx - s.x;
      const dy = fy - s.y;
      const len = Math.hypot(dx, dy) || 1;
      ox = (dx / len) * 0.38;
      oz = (dy / len) * 0.38;
    }
    return { x: x + 0.5 + ox, z: y + 0.5 + oz };
  }

  /** Call before each simulation tick to remember where everyone was. */
  snapshot(world: World): void {
    for (const s of world.settlers.values()) this.prev.set(s.id, this.simPos(world, s));
  }

  update(world: World, alpha: number, time: number, dt: number): void {
    const counts = { tool: { axe: 0, pick: 0, hammer: 0, shovel: 0, basket: 0, saw: 0 } as Record<Tool, number>, cargo: { logs: 0, planks: 0, stone: 0, berries: 0 } as Record<Good, number> };
    let i = 0;
    let nApron = 0;
    let nBadge = 0;
    for (const s of world.settlers.values()) {
      if (i >= MAX) break;
      const cur = this.simPos(world, s);
      const prev = this.prev.get(s.id) ?? cur;
      const x = prev.x + (cur.x - prev.x) * alpha;
      const z = prev.z + (cur.z - prev.z) * alpha;
      const y = this.hf.at(x, z);

      let a = this.anim.get(s.id);
      if (!a) {
        a = { yaw: 0, phase: 0, px: x, pz: z };
        this.anim.set(s.id, a);
      }
      // Face movement direction, or the work target.
      let targetYaw = a.yaw;
      const mdx = x - a.px;
      const mdz = z - a.pz;
      if (mdx * mdx + mdz * mdz > 1e-6) targetYaw = Math.atan2(mdx, mdz);
      if (s.anim === 'work' && s.faceTile >= 0) {
        const fx = (s.faceTile % world.size) + 0.5;
        const fz = Math.floor(s.faceTile / world.size) + 0.5;
        targetYaw = Math.atan2(fx - x, fz - z);
      }
      let dyaw = targetYaw - a.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      a.yaw += dyaw * Math.min(1, dt * 12);
      a.px = x;
      a.pz = z;

      // Children grow visibly from toddler to near-adult size.
      const scale = s.child ? 0.55 + 0.32 * Math.min(1, s.age / comeOfAgeTicks()) : 1.15;
      const seed = s.id * 1.37;
      const moving = s.anim === 'walk' && (mdx * mdx + mdz * mdz > 1e-7 || s.next >= 0);

      // --- pose ---------------------------------------------------------
      let legSwing = 0;
      let armL = 0.08 * Math.sin(time * 2 + seed);
      let armR = -armL;
      let lean = 0;
      let bob = 0;
      let crouch = 0;
      if (moving) {
        const w = time * (s.child ? 12 : 10) + seed;
        legSwing = Math.sin(w) * 0.7;
        armL = -Math.sin(w) * 0.55;
        armR = Math.sin(w) * 0.55;
        bob = Math.abs(Math.cos(w)) * 0.025;
      }
      if (s.anim === 'work' && s.tool) {
        if (s.tool === 'saw') {
          // Push-pull sawing.
          const w = time * 7 + seed;
          armL = -1.35 + Math.sin(w) * 0.3;
          armR = -1.35 + Math.sin(w) * 0.3;
          lean = 0.12 + Math.sin(w) * 0.06;
          if (Math.sin(w) > 0.97 && a.phase <= 0.97) this.onStrike?.('saw', x, y, z);
          a.phase = Math.sin(w);
        } else if (s.tool === 'axe' || s.tool === 'pick' || s.tool === 'hammer') {
          const period = s.tool === 'hammer' ? 0.55 : 0.95;
          const p = (time / period + seed) % 1;
          const raise = p < 0.72 ? easeOut(p / 0.72) : 1 - easeIn((p - 0.72) / 0.28);
          const ang = -0.25 - raise * 2.35;
          armL = ang;
          armR = ang;
          lean = (1 - raise) * 0.18;
          // A chip burst at the moment of impact.
          if (a.phase < 0.98 && (p >= 0.98 || p < a.phase) && s.faceTile >= 0) {
            const fx = (s.faceTile % world.size) + 0.5;
            const fz = Math.floor(s.faceTile / world.size) + 0.5;
            const kind = s.tool === 'axe' ? 'chips' : s.tool === 'pick' ? 'stone' : 'chips';
            const ex = x + (fx - x) * 0.6;
            const ez = z + (fz - z) * 0.6;
            this.effects.emit(kind, ex, this.hf.at(ex, ez) + (s.tool === 'axe' ? 0.3 : 0.15), ez, s.tool === 'hammer' ? 2 : 4);
            this.onStrike?.(s.tool, ex, y, ez);
          }
          a.phase = p;
        } else {
          const w = time * (s.tool === 'shovel' ? 5 : 6.5) + seed;
          armL = -0.9 + Math.sin(w) * 0.35;
          armR = -0.9 - Math.sin(w) * 0.35;
          lean = 0.3;
          crouch = 0.04;
          if (s.tool === 'shovel' && Math.sin(w) > 0.98) this.effects.emit('soil', x + Math.sin(a.yaw) * 0.3, y + 0.05, z + Math.cos(a.yaw) * 0.3, 1);
        }
      }
      if (s.carry === 'logs') {
        armR = -2.9;
        armL = moving ? armL * 0.5 : 0;
      } else if (s.carry) {
        armL = -1.15;
        armR = -1.15;
      }

      // --- matrices -----------------------------------------------------
      this.q.setFromAxisAngle(this.yAxis, a.yaw);
      this.base.compose(this.v.set(x, y + bob * scale - crouch, z), this.q, this.s.set(scale, scale, scale));
      if (lean) this.base.multiply(this.t.makeRotationX(lean));

      this.setPart(this.parts.body, i, this.base);
      this.setPart(this.parts.head, i, this.base);
      this.setPart(this.parts.hat, i, this.base);
      this.limb(this.parts.legL, i, -0.045, HIP_Y, legSwing);
      this.limb(this.parts.legR, i, 0.045, HIP_Y, -legSwing);
      this.limb(this.parts.armL, i, -0.105, SHOULDER_Y, armL);
      const handR = this.limb(this.parts.armR, i, 0.105, SHOULDER_Y, armR);

      if (s.tool && !s.carry && (s.job.kind === 'work' || s.job.kind === 'build')) {
        const mesh = this.tools[s.tool];
        if (s.anim === 'work' || s.tool === 'basket') {
          this.m.copy(handR).multiply(this.t.makeTranslation(0, -ARM_LEN, 0));
        } else {
          // Walking to or from work: tool resting on the shoulder, so the job reads at a glance.
          this.m.copy(this.base).multiply(this.t.makeTranslation(0.11, 0.42, -0.04)).multiply(this.t.makeRotationX(-2.2));
        }
        mesh.setMatrixAt(counts.tool[s.tool]++, this.m);
      }
      if (moving) this.onStep?.(x, z, dt * (s.carry ? 2.2 : 1.4));

      // Trade gear from the settler's best skill.
      let bestSkill: Skill = 'woodcraft';
      for (const k of SKILLS) if (s.skills[k] > s.skills[bestSkill]) bestSkill = k;
      const tier = tierOf(s.skills[bestSkill]);
      if (tier >= 1 && !s.child) {
        this.apron.setMatrixAt(nApron, this.base);
        this.apron.setColorAt(nApron++, this.col.setHex(APRON[bestSkill]));
        if (tier >= 2) {
          this.badge.setMatrixAt(nBadge, this.base);
          this.feather.setMatrixAt(nBadge++, this.base);
        }
      }
      if (s.carry) {
        const mesh = this.cargo[s.carry];
        if (s.carry === 'logs') this.m.copy(this.base).multiply(this.t.makeTranslation(0.07, 0.47, 0)).multiply(this.t.makeRotationY(Math.PI / 2 + 0.1));
        else this.m.copy(this.base).multiply(this.t.makeTranslation(0, 0.26, 0.16));
        mesh.setMatrixAt(counts.cargo[s.carry]++, this.m);
      }

      // --- colours ------------------------------------------------------
      const fam = world.families.get(s.familyId);
      const tunic = TUNICS[Math.floor(hash2(s.id, 2, 3) * TUNICS.length)];
      this.parts.body.setColorAt(i, this.col.setHex(tunic));
      this.parts.armL.setColorAt(i, this.col);
      this.parts.armR.setColorAt(i, this.col);
      this.parts.head.setColorAt(i, this.col.setHex(SKINS[Math.floor(hash2(s.id, 3, 3) * SKINS.length)]));
      this.parts.hat.setColorAt(i, this.col.setHex(fam ? CREST_COLORS[fam.color] : 0x888888));
      this.parts.legL.setColorAt(i, this.col.setHex(C.trousers));
      this.parts.legR.setColorAt(i, this.col);

      let pos = this.positions.get(s.id);
      if (!pos) this.positions.set(s.id, (pos = new THREE.Vector3()));
      pos.set(x, y, z);
      i++;
    }

    for (const p of Object.values(this.parts)) {
      p.count = i;
      p.instanceMatrix.needsUpdate = true;
      if (p.instanceColor) p.instanceColor.needsUpdate = true;
    }
    this.apron.count = nApron;
    this.apron.instanceMatrix.needsUpdate = true;
    if (this.apron.instanceColor) this.apron.instanceColor.needsUpdate = true;
    this.badge.count = nBadge;
    this.feather.count = nBadge;
    this.badge.instanceMatrix.needsUpdate = true;
    this.feather.instanceMatrix.needsUpdate = true;
    for (const t of Object.keys(this.tools) as Tool[]) {
      this.tools[t].count = counts.tool[t];
      this.tools[t].instanceMatrix.needsUpdate = true;
    }
    for (const g of Object.keys(this.cargo) as Good[]) {
      this.cargo[g].count = counts.cargo[g];
      this.cargo[g].instanceMatrix.needsUpdate = true;
    }
  }

  private setPart(mesh: THREE.InstancedMesh, i: number, m: THREE.Matrix4) {
    mesh.setMatrixAt(i, m);
  }

  /** Pose a limb hanging from a joint, rotated about x. Returns the limb's matrix. */
  private limb(mesh: THREE.InstancedMesh, i: number, jx: number, jy: number, angle: number): THREE.Matrix4 {
    this.m.copy(this.base).multiply(this.t.makeTranslation(jx, jy, 0)).multiply(this.t.makeRotationX(angle));
    mesh.setMatrixAt(i, this.m);
    return this.m.clone();
  }
}

const APRON: Record<Skill, number> = { woodcraft: 0x8a5a2e, stonework: 0x7d7a74, husbandry: 0x5d7a3a };

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
