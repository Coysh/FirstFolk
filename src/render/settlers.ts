import { GOODS } from '../sim/defs';
import * as THREE from 'three';
import { BUILDINGS, type Good, type Skill, type Tool } from '../sim/defs';
import { tierOf } from '../sim/trades';
import { CREST_COLORS } from '../sim/population';
import { hash2 } from '../sim/rng';
import { comeOfAgeTicks, type Settler, type World } from '../sim/world';
import type { Effects } from './effects';
import { artGeometry, hasArt } from './art';
import { goodGeometry } from './models';
import { ModelBuilder, box, cone, cyl, sphere } from './modelBuilder';
import { C, HAIRS, SKINS, TUNICS } from './palette';
import type { HeightField } from './terrain';
import { withSway } from './wind';

const MAX = 1024;

/** Joint positions in adult model space (feet at y = 0, facing +z). */
const HIP_Y = 0.18;
const SHOULDER_Y = 0.37;
const ARM_LEN = 0.17;
/** Neck and hood-base heights of the Blender settler (settler.py), where the head and hood pivot. */
const NECK_Y = 0.41;
const HOOD_Y = 0.57;

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
    case 'spear':
      b.add(box(0.022, 0.022, 0.66), C.wood, { pos: [0, 0, 0.12] });
      b.add(cone(0.026, 0.09, 4), C.iron, { pos: [0, 0, 0.49], rot: [Math.PI / 2, 0, 0] });
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
  /** Hair is part of the Blender settler only; the code-built one is bald under its hat. */
  private hair: THREE.InstancedMesh | null = null;
  /** Trade gear: leather aprons for Journeymen, a gold badge and feather for Masters. */
  private apron: THREE.InstancedMesh;
  private badge: THREE.InstancedMesh;
  private feather: THREE.InstancedMesh;
  /** Guards carry a round shield in their family's colour. */
  private shield: THREE.InstancedMesh;
  /** A war banner: the first figure of every marching warband carries one (pole, and cloth tinted by side). */
  private bannerPole: THREE.InstancedMesh;
  private bannerCloth: THREE.InstancedMesh;
  /** Everyone of yours hops and cheers until this time (a rank-up, a claimed landmark, victory). */
  private cheerUntil = 0;
  /** Hooks for audio and footpaths. */
  onStrike: ((tool: Tool, x: number, y: number, z: number) => void) | null = null;
  onStep: ((x: number, z: number, amount: number) => void) | null = null;
  private tools: Record<Tool, THREE.InstancedMesh>;
  private cargo: Record<Good, THREE.InstancedMesh>;
  private anim = new Map<number, Anim>();
  /** Figures caught in a clash this frame: where they stand, and which way they face (see prepareClashes). */
  private fighters = new Map<number, { x: number; z: number; dx: number; dz: number; atk: boolean }>();
  /** Townsfolk who turned out for a rally: made up for the clash, like reavers. */
  private militia = new Map<number, Settler>();
  /** Scouts out in the fog, made up the same way: figure id → scout id. */
  private scoutFigs = new Map<number, Settler>();
  private scoutOf = new Map<number, number>();
  /** Positions at the previous tick, for interpolation. */
  private prev = new Map<number, { x: number; z: number }>();
  /** Latest rendered positions (for picking / selection). */
  readonly positions = new Map<number, THREE.Vector3>();

  private base = new THREE.Matrix4();
  private head = new THREE.Matrix4();
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
    // Body parts come from the Blender settler (settler.glb), painted white so each instance's tint
    // (tunic, skin, hair, crest) multiplies in; with `?art=classic` they are the old primitives.
    const painted = (g: THREE.BufferGeometry) => {
      if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      return g;
    };
    const part = (key: string, classic: () => THREE.BufferGeometry) => artGeometry(key) ?? painted(classic());
    this.parts = {
      body: mk(part('settler_body', () => new THREE.CylinderGeometry(0.075, 0.11, 0.22, 7).translate(0, HIP_Y + 0.11, 0)), vmat, true),
      head: mk(part('settler_head', () => new THREE.IcosahedronGeometry(0.085, 1).translate(0, 0.47, 0)), vmat, true),
      hat: mk(part('settler_hood', () => cone(0.095, 0.13, 7).translate(0, 0.585, 0)), vmat, true),
      armL: mk(part('settler_arm', () => limb(0.05, ARM_LEN)), vmat, true),
      armR: mk(part('settler_arm', () => limb(0.05, ARM_LEN)), vmat, true),
      legL: mk(part('settler_leg', () => limb(0.065, HIP_Y)), vmat, true),
      legR: mk(part('settler_leg', () => limb(0.065, HIP_Y)), vmat, true),
    };
    const art = hasArt('settler_body');
    if (art) this.hair = mk(artGeometry('settler_hair')!, vmat, true);
    this.tools = {
      axe: mk(toolGeometry('axe'), vmat, false),
      pick: mk(toolGeometry('pick'), vmat, false),
      hammer: mk(toolGeometry('hammer'), vmat, false),
      shovel: mk(toolGeometry('shovel'), vmat, false),
      basket: mk(toolGeometry('basket'), vmat, false),
      saw: mk(toolGeometry('saw'), vmat, false),
      spear: mk(toolGeometry('spear'), vmat, false),
    };
    this.shield = mk(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 9).rotateZ(Math.PI / 2).translate(-0.14, 0.3, 0.03), mat(), true);
    const pole = new ModelBuilder().add(box(0.018, 1.0, 0.018), C.wood, { pos: [0, 0.5, 0] }).build();
    const cloth = new ModelBuilder().add(box(0.012, 0.2, 0.36), 0xffffff, { pos: [0, 0.9, -0.2] }).build();
    const cp = cloth.getAttribute('position');
    const cs = new Float32Array(cp.count);
    // Flutter grows towards the free edge of the cloth (see withSway).
    for (let k = 0; k < cp.count; k++) cs[k] = Math.min(1, Math.max(0, (-cp.getZ(k) - 0.02) / 0.36));
    cloth.setAttribute('sway', new THREE.BufferAttribute(cs, 1));
    this.bannerPole = mk(pole, vmat, false);
    this.bannerCloth = mk(cloth, withSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide })), true);
    this.apron = mk(new THREE.BoxGeometry(0.15, 0.2, 0.03).translate(0, HIP_Y + 0.1, art ? 0.118 : 0.085), mat(), true);
    this.badge = mk(new THREE.OctahedronGeometry(0.03).translate(0, 0.36, art ? 0.098 : 0.085), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x6b4a00, metalness: 0.6, roughness: 0.3 }), false);
    this.feather = mk((art ? new THREE.ConeGeometry(0.018, 0.16, 4).rotateZ(-0.7).translate(0.115, 0.6, -0.02) : new THREE.ConeGeometry(0.018, 0.16, 4).rotateZ(-0.5).translate(0.07, 0.62, 0)), new THREE.MeshStandardMaterial({ color: 0xfff6e0, flatShading: true }), false);
    this.cargo = Object.fromEntries(GOODS.map((g) => [g, mk(goodGeometry(g).scale(1.3, 1.3, 1.3), vmat, false)])) as typeof this.cargo;
  }

  /** Sim-space position of a settler (tile units, centre of tile = +0.5). */
  private marchingOnUs(world: World, s: Settler): boolean {
    const bandId = this.reaverBand.get(s.id);
    const band = bandId === undefined ? world.warbands.find((w) => w.members.includes(s.id)) : world.warbands.find((w) => w.id === bandId);
    return !!band && band.phase !== 'home' && world.buildings.get(band.targetId)?.owner === 0;
  }

  /** Everyone of yours hops for joy for a few seconds. */
  cheer(time: number, seconds = 4): void {
    this.cheerUntil = Math.max(this.cheerUntil, time + seconds);
  }

  /** The banner colour if this figure leads a marching warband (its first member), else -1. */
  private bandBanner(world: World, s: Settler): number {
    const bandId = this.reaverBand.get(s.id);
    const band = bandId === undefined ? world.warbands.find((w) => w.members.includes(s.id)) : world.warbands.find((w) => w.id === bandId);
    if (!band) return -1;
    const first = bandId === undefined ? band.members[0] === s.id : s.id === -(band.id * 16);
    return first ? (band.owner === 0 ? 0xffd75e : band.owner === 1 ? 0xff6b5e : 0x2b2b33) : -1;
  }

  /** Reavers have no settlers of their own: a figure per 10 strength, made up for each band. */
  private reavers = new Map<number, Settler>();
  private reaverBand = new Map<number, number>();
  private *figures(world: World): Iterable<Settler> {
    yield* world.settlers.values();
    for (const sc of world.scouts) {
      const id = -(sc.id * 16 + 15);
      let s = this.scoutFigs.get(id);
      if (!s) {
        s = { id, owner: sc.owner, familyId: 0, name: '', child: false, age: 0, x: sc.x, y: sc.y, next: -1, progress: 0, stepLen: 1000, path: [], job: { kind: 'idle' } as Settler['job'], busy: 0, carry: null, tool: null, anim: 'walk', faceTile: -1, spouseId: 0 };
        this.scoutFigs.set(id, s);
        this.scoutOf.set(id, sc.id);
      }
      s.anim = sc.phase === 'look' ? 'idle' : 'walk';
      yield s;
    }
    for (const band of world.warbands) {
      const c = band.clash;
      const target = c && world.buildings.get(band.targetId);
      if (!c || !target) continue;
      for (let k = 0; k < c.militia; k++) {
        const id = -(band.id * 16 + 8 + k);
        let s = this.militia.get(id);
        if (!s) {
          s = { id, owner: target.owner, familyId: 0, name: '', child: false, age: 0, x: target.x, y: target.y, next: -1, progress: 0, stepLen: 1000, path: [], job: { kind: 'guard', buildingId: 0, phase: 'watch' }, busy: 0, carry: null, tool: 'spear', anim: 'idle', faceTile: -1, spouseId: 0 };
          this.militia.set(id, s);
        }
        yield s;
      }
    }
    for (const band of world.warbands) {
      if (band.owner >= 0) continue;
      const n = Math.max(2, Math.min(8, Math.round(band.strength / 10)));
      for (let k = 0; k < n; k++) {
        const id = -(band.id * 16 + k);
        let s = this.reavers.get(id);
        if (!s) {
          s = { id, owner: -1, familyId: 0, name: '', child: false, age: 0, x: band.x, y: band.y, next: -1, progress: 0, stepLen: 1000, path: [], job: { kind: 'guard', buildingId: 0, phase: 'away' }, busy: 0, carry: null, tool: 'spear', anim: 'walk', faceTile: -1, spouseId: 0 };
          this.reavers.set(id, s);
          this.reaverBand.set(id, band.id);
        }
        yield s;
      }
    }
  }

  /**
   * Who is fighting where. Each clash draws two lines either side of the post, the raiders on the side
   * they came from. The line walks towards whoever is winning: raiders crowd the post as it falls,
   * defenders shove them back as it holds.
   */
  private prepareClashes(world: World): void {
    this.fighters.clear();
    for (const band of world.warbands) {
      const c = band.clash;
      const target = c && world.buildings.get(band.targetId);
      if (band.phase !== 'clash' || !c || !target) continue;
      const size = BUILDINGS[target.type].size;
      const cx = target.x + size / 2;
      const cz = target.y + size / 2;
      const prev = band.path[band.path.length - 2] ?? band.path[0];
      let dx = 1;
      let dz = 0;
      if (prev !== undefined) {
        dx = (prev % world.size) + 0.5 - cx;
        dz = Math.floor(prev / world.size) + 0.5 - cz;
      }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const push = (c.line - 500) / 500;
      const atkDist = size / 2 + 1.25 - push * 0.55;
      const defDist = Math.max(size / 2 + 0.3, atkDist - 0.85);
      const place = (ids: number[], dist: number, atk: boolean) =>
        ids.forEach((id, k) => {
          const lateral = (k - (ids.length - 1) / 2) * 0.55;
          this.fighters.set(id, { x: cx + dx * dist - dz * lateral, z: cz + dz * dist + dx * lateral, dx: atk ? -dx : dx, dz: atk ? -dz : dz, atk });
        });
      const attackers = band.owner >= 0 ? band.members : Array.from({ length: Math.max(2, Math.min(8, Math.round(band.strength / 10))) }, (_, k) => -(band.id * 16 + k));
      place(attackers, atkDist, true);
      const defenders: number[] = [];
      for (const s of world.settlers.values()) if (defenders.length < 6 && s.job.kind === 'guard' && s.job.buildingId === target.id && s.job.phase === 'watch') defenders.push(s.id);
      for (let k = 0; k < c.militia; k++) defenders.push(-(band.id * 16 + 8 + k));
      place(defenders, defDist, false);
    }
    for (const [id, scoutId] of [...this.scoutOf])
      if (!world.scouts.some((q) => q.id === scoutId)) {
        this.scoutOf.delete(id);
        this.scoutFigs.delete(id);
        this.prev.delete(id);
        this.anim.delete(id);
      }
    // Forget militia whose clash is over.
    for (const id of [...this.militia.keys()])
      if (!this.fighters.has(id)) {
        this.militia.delete(id);
        this.prev.delete(id);
        this.anim.delete(id);
      }
  }

  private simPos(world: World, s: Settler): { x: number; z: number } {
    const fight = this.fighters.get(s.id);
    if (fight) return { x: fight.x, z: fight.z };
    const scoutId = this.scoutOf.get(s.id);
    const sc = scoutId === undefined ? undefined : world.scouts.find((q) => q.id === scoutId);
    if (sc) {
      const next = sc.path[sc.step];
      const f = sc.progress / 1000;
      return { x: sc.x + 0.5 + (next === undefined ? 0 : ((next % world.size) - sc.x) * f), z: sc.y + 0.5 + (next === undefined ? 0 : (Math.floor(next / world.size) - sc.y) * f) };
    }
    if (s.job.kind === 'guard' && s.job.phase === 'away') {
      // Out with a warband: march in a little column around the band's position.
      const bandId = this.reaverBand.get(s.id);
      const band = bandId === undefined ? world.warbands.find((w) => w.members.includes(s.id)) : world.warbands.find((w) => w.id === bandId);
      if (band) {
        const k = bandId === undefined ? band.members.indexOf(s.id) : -s.id - band.id * 16;
        const next = band.path[band.step];
        let bx = band.x;
        let by = band.y;
        if (next !== undefined) {
          const f = band.progress / 1000;
          bx += ((next % world.size) - bx) * f;
          by += (Math.floor(next / world.size) - by) * f;
        }
        return { x: bx + 0.5 + ((k % 2) - 0.5) * 0.5, z: by + 0.5 + (Math.floor(k / 2) - 0.5) * 0.5 };
      }
    }
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
    // Forget reavers whose band has gone home.
    for (const [id, band] of this.reaverBand)
      if (!world.warbands.some((w) => w.id === band)) {
        this.reaverBand.delete(id);
        this.reavers.delete(id);
        this.prev.delete(id);
      }
    this.prepareClashes(world);
    for (const s of this.figures(world)) this.prev.set(s.id, this.simPos(world, s));
  }

  update(world: World, alpha: number, time: number, dt: number): void {
    const counts = { tool: { axe: 0, pick: 0, hammer: 0, shovel: 0, basket: 0, saw: 0, spear: 0 } as Record<Tool, number>, cargo: Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<Good, number> };
    let i = 0;
    let nApron = 0;
    let nBadge = 0;
    let nShield = 0;
    let nBanner = 0;
    this.prepareClashes(world);
    for (const s of this.figures(world)) {
      if (i >= MAX) break;
      const cur = this.simPos(world, s);
      // Warbands marching on us were sighted (we were warned), so they are shown through the fog.
      const sighted = (s.job.kind === 'guard' && s.job.phase === 'away' && this.marchingOnUs(world, s)) || this.fighters.has(s.id);
      if (s.owner !== 0 && !sighted && !(world.explored[world.idx(Math.min(world.size - 1, Math.max(0, Math.floor(cur.x))), Math.min(world.size - 1, Math.max(0, Math.floor(cur.z))))] & 1)) continue;
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
      const fight = this.fighters.get(s.id);
      if (fight) targetYaw = Math.atan2(fight.dx, fight.dz);
      let dyaw = targetYaw - a.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      a.yaw += dyaw * Math.min(1, dt * 12);
      a.px = x;
      a.pz = z;

      // Children grow visibly from toddler to near-adult size.
      const scale = s.child ? 0.55 + 0.32 * Math.min(1, s.age / comeOfAgeTicks()) : 1.15;
      const seed = s.id * 1.37;
      const away = s.job.kind === 'guard' && s.job.phase === 'away';
      const moving = (s.anim === 'walk' || away) && (mdx * mdx + mdz * mdz > 1e-7 || s.next >= 0);

      // --- pose ---------------------------------------------------------
      let legSwing = 0;
      let armL = 0.08 * Math.sin(time * 2 + seed);
      let armR = -armL;
      let lean = 0;
      let bob = 0;
      let crouch = 0;
      // Head and hood: nodding with each blow, bobbing and swaying with each step, the hood tip trailing.
      let nod = Math.sin(time * 1.6 + seed) * 0.02;
      let headSway = 0;
      let hoodTrail = 0;
      if (moving) {
        const w = time * (s.child ? 12 : 10) + seed;
        legSwing = Math.sin(w) * 0.7;
        armL = -Math.sin(w) * 0.55;
        armR = Math.sin(w) * 0.55;
        bob = Math.abs(Math.cos(w)) * 0.025;
        nod = Math.abs(Math.cos(w - 0.7)) * 0.06 - 0.02;
        headSway = Math.sin(w) * 0.05;
        hoodTrail = 0.2 + Math.abs(Math.cos(w - 1.2)) * 0.12;
      }
      if (s.anim === 'work' && s.tool) {
        if (s.tool === 'saw') {
          // Push-pull sawing.
          const w = time * 7 + seed;
          armL = -1.35 + Math.sin(w) * 0.3;
          armR = -1.35 + Math.sin(w) * 0.3;
          lean = 0.12 + Math.sin(w) * 0.06;
          nod = 0.18 + Math.sin(w) * 0.05;
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
          nod = (1 - raise) * 0.3 - 0.05;
          hoodTrail = raise * 0.15;
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
          nod = 0.2;
          crouch = 0.04;
          if (s.tool === 'shovel' && Math.sin(w) > 0.98) this.effects.emit('soil', x + Math.sin(a.yaw) * 0.3, y + 0.05, z + Math.cos(a.yaw) * 0.3, 1);
        }
      }
      if (fight) {
        // A shield-and-spear brawl: thrust, shove, recover, each figure on its own beat.
        const w = time * 5.5 + seed * 2.1;
        const thrust = Math.max(0, Math.sin(w));
        armR = -1.2 - thrust * 0.95;
        armL = -0.55 + Math.sin(w * 0.5) * 0.25;
        lean = 0.1 + thrust * 0.2;
        nod = 0.1;
        legSwing = Math.sin(w * 2) * 0.22;
        bob = thrust * 0.03;
        if (thrust > 0.97 && a.phase <= 0.97) {
          const ex = x + fight.dx * 0.55;
          const ez = z + fight.dz * 0.55;
          this.effects.emit('spark', ex, this.hf.at(ex, ez) + 0.55, ez, 4);
          if (hash2(s.id, Math.floor(time), 5) > 0.6) this.effects.emit('dust', ex, this.hf.at(ex, ez) + 0.1, ez, 2);
          this.onStrike?.('hammer', ex, y, ez);
        }
        a.phase = thrust;
      }
      if (s.carry === 'logs') {
        armR = -2.9;
        armL = moving ? armL * 0.5 : 0;
      } else if (s.carry) {
        armL = -1.15;
        armR = -1.15;
      }
      if (time < this.cheerUntil && s.owner === 0 && !away) {
        // A celebration: hop, arms thrown up, the hood tip flying.
        const w = time * 9 + seed * 3;
        const hop = Math.max(0, Math.sin(w));
        bob += hop * 0.11;
        armL = -2.6 + Math.sin(w * 0.5) * 0.35;
        armR = -2.6 - Math.sin(w * 0.5) * 0.35;
        legSwing = hop * 0.35;
        lean = 0;
        nod = -0.14;
        headSway = Math.sin(w * 0.5) * 0.08;
        hoodTrail = hop * 0.4;
      }

      // --- matrices -----------------------------------------------------
      this.q.setFromAxisAngle(this.yAxis, a.yaw);
      this.base.compose(this.v.set(x, y + bob * scale - crouch, z), this.q, this.s.set(scale, scale, scale));
      if (lean) this.base.multiply(this.t.makeRotationX(lean));

      this.setPart(this.parts.body, i, this.base);
      if (this.hair) {
        // Head, hair and hood pivot at the neck; the hood tip also lags behind the head.
        this.head.copy(this.base).multiply(this.t.makeTranslation(0, NECK_Y, 0)).multiply(this.t.makeRotationX(nod)).multiply(this.t.makeRotationZ(headSway)).multiply(this.t.makeTranslation(0, -NECK_Y, 0));
        this.setPart(this.parts.head, i, this.head);
        this.hair.setMatrixAt(i, this.head);
        this.m.copy(this.head).multiply(this.t.makeTranslation(0, HOOD_Y, 0)).multiply(this.t.makeRotationX(-hoodTrail)).multiply(this.t.makeTranslation(0, -HOOD_Y, 0));
        this.setPart(this.parts.hat, i, this.m);
      } else {
        this.setPart(this.parts.head, i, this.base);
        this.setPart(this.parts.hat, i, this.base);
      }
      this.limb(this.parts.legL, i, -0.045, HIP_Y, legSwing);
      this.limb(this.parts.legR, i, 0.045, HIP_Y, -legSwing);
      this.limb(this.parts.armL, i, -0.105, SHOULDER_Y, armL);
      const handR = this.limb(this.parts.armR, i, 0.105, SHOULDER_Y, armR);

      const guard = s.job.kind === 'guard';
      if (s.tool && !s.carry && (s.job.kind === 'work' || s.job.kind === 'build' || guard)) {
        const mesh = this.tools[s.tool];
        if (guard && !moving) {
          // On watch: the spear stands upright at their side.
          this.m.copy(handR).multiply(this.t.makeTranslation(0, -ARM_LEN, 0)).multiply(this.t.makeRotationX(-Math.PI / 2 - armR));
        } else if (s.anim === 'work' || s.tool === 'basket') {
          this.m.copy(handR).multiply(this.t.makeTranslation(0, -ARM_LEN, 0));
        } else {
          // Walking to or from work: tool resting on the shoulder, so the job reads at a glance.
          this.m.copy(this.base).multiply(this.t.makeTranslation(0.11, 0.42, -0.04)).multiply(this.t.makeRotationX(-2.2));
        }
        mesh.setMatrixAt(counts.tool[s.tool]++, this.m);
      }
      if (guard) {
        const fam = world.families.get(s.familyId);
        this.shield.setMatrixAt(nShield, this.base);
        this.shield.setColorAt(nShield++, this.col.setHex(fam ? CREST_COLORS[fam.color] : 0x888888));
        const flagColour = away ? this.bandBanner(world, s) : -1;
        if (flagColour >= 0) {
          this.m.copy(this.base).multiply(this.t.makeTranslation(-0.17, 0, 0.04));
          this.bannerPole.setMatrixAt(nBanner, this.m);
          this.bannerCloth.setMatrixAt(nBanner, this.m);
          this.bannerCloth.setColorAt(nBanner++, this.col.setHex(flagColour));
        }
      }
      if (moving) this.onStep?.(x, z, dt * (s.carry ? 2.2 : 1.4));

      // Trade gear from the town's craft at their workplace: everyone rises together.
      const work = s.job.kind === 'work' ? world.buildings.get(s.job.buildingId) : undefined;
      const bestSkill: Skill = (work && BUILDINGS[work.type].job?.skill) || 'woodcraft';
      const tier = work && s.owner >= 0 ? tierOf(world.players[s.owner].crafts[bestSkill]) : 0;
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
      this.parts.body.setColorAt(i, this.col.setHex(s.owner < 0 ? 0x3b3a44 : tunic));
      this.parts.armL.setColorAt(i, this.col);
      this.parts.armR.setColorAt(i, this.col);
      this.parts.head.setColorAt(i, this.col.setHex(SKINS[Math.floor(hash2(s.id, 3, 3) * SKINS.length)]));
      this.parts.hat.setColorAt(i, this.col.setHex(fam ? CREST_COLORS[fam.color] : s.owner < 0 ? 0x1e1d24 : 0x888888));
      this.hair?.setColorAt(i, this.col.setHex(s.owner < 0 ? 0x1e1d24 : HAIRS[Math.floor(hash2(s.id, 4, 3) * HAIRS.length)]));
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
    if (this.hair) {
      this.hair.count = i;
      this.hair.instanceMatrix.needsUpdate = true;
      if (this.hair.instanceColor) this.hair.instanceColor.needsUpdate = true;
    }
    this.apron.count = nApron;
    this.apron.instanceMatrix.needsUpdate = true;
    if (this.apron.instanceColor) this.apron.instanceColor.needsUpdate = true;
    this.bannerPole.count = nBanner;
    this.bannerCloth.count = nBanner;
    this.bannerPole.instanceMatrix.needsUpdate = true;
    this.bannerCloth.instanceMatrix.needsUpdate = true;
    if (this.bannerCloth.instanceColor) this.bannerCloth.instanceColor.needsUpdate = true;
    this.shield.count = nShield;
    this.shield.instanceMatrix.needsUpdate = true;
    if (this.shield.instanceColor) this.shield.instanceColor.needsUpdate = true;
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
