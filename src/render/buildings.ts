import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, GOODS, costTotal, type Good } from '../sim/defs';
import { CREST_COLORS, isHome } from '../sim/population';
import type { Building, World } from '../sim/world';
import type { Effects } from './effects';
import { buildingGeometry, goodGeometry, scaffoldGeometry } from './models';
import { ModelBuilder, box } from './modelBuilder';
import type { HeightField } from './terrain';
import { withSway } from './wind';

interface View {
  group: THREE.Group;
  model: THREE.Mesh;
  scaffold: THREE.Mesh;
  piles: THREE.Group;
  pileKey: string;
  modelKey: string;
  wasDone: boolean;
  bounce: number;
  smokeTimer: number;
  /** Per-site material with a clipping plane that reveals the building from the ground up. */
  clipMat: THREE.MeshStandardMaterial | null;
  clip: THREE.Plane | null;
  hammerTimer: number;
}

/** Where stock piles sit, in building-local coordinates. */
const PILE_SPOTS: Record<string, Partial<Record<Good, [number, number]>>> = {
  store: { logs: [1.2, -0.45], planks: [1.2, 0.15], stone: [1.2, 0.7], berries: [-1.15, -0.1], fish: [-1.15, 0.55] },
  site: { logs: [0.75, 0.8], planks: [0.75, 0.8], stone: [-0.75, 0.8], berries: [0, 0.8], fish: [0, 0.8] },
  output: { logs: [-0.7, 0.75], planks: [-0.7, 0.75], stone: [-0.7, 0.75], berries: [-0.7, 0.75], fish: [-0.7, 0.75] },
};

const MODEL_HEIGHT = 1.6;

export class BuildingsView {
  readonly group = new THREE.Group();
  private views = new Map<number, View>();
  private geoCache = new Map<string, THREE.BufferGeometry>();
  readonly material = withSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
  private scaffoldGeo = scaffoldGeometry();
  private plinthGeo = new ModelBuilder().add(box(1.84, 1.0, 1.84), 0x8f7f5c, { pos: [0, -0.52, 0] }).build();
  private goodGeo = Object.fromEntries(GOODS.map((g) => [g, goodGeometry(g)])) as Record<Good, THREE.BufferGeometry>;
  /** Called when a construction finishes or a workplace transforms (for sounds / floaters). */
  onComplete: ((id: number, pos: THREE.Vector3) => void) | null = null;

  constructor(private hf: HeightField, private effects: Effects) {}

  geometry(type: Building['type'], crest?: number, tier = 0): THREE.BufferGeometry {
    const key = `${type}:${crest ?? ''}:${tier}`;
    let g = this.geoCache.get(key);
    if (!g) {
      g = buildingGeometry(type, { crest, tier });
      this.geoCache.set(key, g);
    }
    return g;
  }

  /** Ground height a building sits on: the highest footprint corner, with a plinth filling below. */
  baseHeight(x: number, y: number, size: number): number {
    let h = -Infinity;
    for (let dy = 0; dy <= size; dy++) for (let dx = 0; dx <= size; dx++) h = Math.max(h, this.hf.corner(x + dx, y + dy));
    return h;
  }

  update(world: World, dt: number): void {
    for (const [id, v] of this.views) {
      if (!world.buildings.has(id)) {
        this.group.remove(v.group);
        v.clipMat?.dispose();
        const p = v.group.position;
        this.effects.emit('dust', p.x, p.y + 0.2, p.z, 14);
        this.views.delete(id);
      }
    }
    for (const b of world.buildings.values()) {
      // Other settlements stay hidden until your folk have explored their land.
      const seen = b.owner === 0 || (world.explored[world.idx(b.x, b.y)] & 1) !== 0;
      let v = this.views.get(b.id);
      if (!seen) {
        if (v) v.group.visible = false;
        continue;
      }
      if (!v) v = this.create(b);
      v.group.visible = true;
      this.updateView(world, b, v, dt);
    }
  }

  private create(b: Building): View {
    const size = BUILDINGS[b.type].size;
    const group = new THREE.Group();
    group.position.set(b.x + size / 2, this.baseHeight(b.x, b.y, size), b.y + size / 2);
    const plinth = new THREE.Mesh(this.plinthGeo, this.material);
    plinth.receiveShadow = true;
    group.add(plinth);
    const model = new THREE.Mesh(this.geometry(b.type), this.material);
    model.castShadow = true;
    model.receiveShadow = true;
    group.add(model);
    const scaffold = new THREE.Mesh(this.scaffoldGeo, this.material);
    scaffold.castShadow = true;
    group.add(scaffold);
    const piles = new THREE.Group();
    group.add(piles);
    this.group.add(group);
    let clipMat: THREE.MeshStandardMaterial | null = null;
    let clip: THREE.Plane | null = null;
    if (!b.done) {
      clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), group.position.y);
      clipMat = withSway(this.material.clone());
      clipMat.clippingPlanes = [clip];
      clipMat.side = THREE.DoubleSide;
      model.material = clipMat;
    }
    const v: View = { group, model, scaffold, piles, pileKey: '', modelKey: '', wasDone: b.done, bounce: 0, smokeTimer: Math.random(), clipMat, clip, hammerTimer: 0 };
    group.userData.buildingId = b.id;
    this.views.set(b.id, v);
    return v;
  }

  private updateView(world: World, b: Building, v: View, dt: number): void {
    const def = BUILDINGS[b.type];
    const p = v.group.position;

    // Model variant: hut crest banner, workplace trade tier.
    let crest: number | undefined;
    if (isHome(b.type) && b.familyId) {
      const fam = world.families.get(b.familyId);
      if (fam) crest = CREST_COLORS[fam.color];
    }
    const key = `${crest ?? ''}:${b.tier}`;
    if (key !== v.modelKey) {
      const upgraded = v.modelKey !== '' && b.done;
      v.modelKey = key;
      v.model.geometry = this.geometry(b.type, crest, b.tier);
      if (upgraded) {
        v.bounce = 1;
        this.effects.emit('sparkle', p.x, p.y + 1, p.z, 24);
        this.effects.emit('dust', p.x, p.y + 0.1, p.z, 10);
        this.onComplete?.(b.id, p);
      }
    }

    if (b.done && !v.wasDone) {
      v.wasDone = true;
      v.bounce = 1;
      v.model.material = this.material;
      v.clipMat?.dispose();
      v.clipMat = null;
      v.clip = null;
      this.effects.emit('dust', p.x, p.y + 0.1, p.z, 22);
      this.effects.emit('sparkle', p.x, p.y + 0.9, p.z, 16);
      this.onComplete?.(b.id, p);
    }

    const progress = b.done ? 1 : b.work / b.workNeeded;
    v.scaffold.visible = !b.done;
    if (v.clip) {
      // Reveal the building from the ground up, with a short head start so the footings show.
      const geo = v.model.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const reveal = 0.05 + progress * (geo.boundingBox?.max.y ?? MODEL_HEIGHT);
      v.clip.constant = p.y + reveal;
      v.hammerTimer -= dt;
      if (b.builderId && v.hammerTimer <= 0 && progress > 0) {
        v.hammerTimer = 0.35;
        const a = Math.random() * Math.PI * 2;
        this.effects.emit('chips', p.x + Math.cos(a) * 0.5, p.y + reveal, p.z + Math.sin(a) * 0.5, 2);
      }
    }
    let sy = 1;
    if (v.bounce > 0) {
      v.bounce = Math.max(0, v.bounce - dt * 2.2);
      const t = 1 - v.bounce;
      sy = 1 + Math.sin(t * Math.PI * 3) * 0.1 * v.bounce;
    }
    v.model.scale.set(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5);

    // Stock piles: stores, producer output, and unused construction materials.
    const counts: Partial<Record<Good, number>> = {};
    let spots = PILE_SPOTS.output;
    if (def.storage && b.done) {
      spots = PILE_SPOTS.store;
      counts.logs = Math.min(16, b.stock.logs);
      counts.planks = Math.min(12, b.stock.planks);
      counts.stone = Math.min(12, b.stock.stone);
      counts.berries = Math.min(9, Math.ceil(b.stock.berries / 2));
      counts.fish = Math.min(9, Math.ceil(b.stock.fish / 2));
    } else if (!b.done) {
      spots = PILE_SPOTS.site;
      let used = Math.floor(progress * costTotal(b.cost));
      for (const g of GOODS) {
        const take = Math.min(b.delivered[g], used);
        used -= take;
        counts[g] = b.delivered[g] - take;
      }
    } else if (def.job && def.job.kind !== 'plant') {
      counts[def.job.good] = Math.min(8, b.stock[def.job.good]);
      if (def.job.kind === 'process') counts[def.job.input] = Math.min(4, b.stock[def.job.input]);
    }
    const pkey = GOODS.map((g) => counts[g] ?? 0).join(',');
    if (pkey !== v.pileKey) {
      v.pileKey = pkey;
      this.rebuildPiles(v, counts, def.job?.kind === 'process' ? { ...spots, [def.job.input]: [0.7, 0.75] } : spots);
    }

    // Ambient life: chimney smoke from homes, campfire at the wagon, dust from busy workshops.
    v.smokeTimer -= dt;
    if (v.smokeTimer <= 0 && b.done) {
      // A chimney anchor painted in Blender wins; homes with a family and busy workshops smoke from it.
      const chimney = v.model.geometry.userData.smoke as [number, number, number] | undefined;
      if (chimney && (isHome(b.type) ? b.familyId : b.workerId && b.alert === '')) {
        this.effects.emit('smoke', p.x + chimney[0], p.y + chimney[1], p.z + chimney[2], 1);
        v.smokeTimer = 0.45;
      } else if (isHome(b.type) && b.familyId) {
        this.effects.emit('smoke', p.x, p.y + 1.45, p.z - 0.05, 1);
        v.smokeTimer = 0.45;
      } else if (b.type === 'wagon') {
        this.effects.emit('smoke', p.x - 0.45, p.y + 0.15, p.z + 0.75, 1);
        this.effects.emit('ember', p.x - 0.45, p.y + 0.08, p.z + 0.75, 1);
        v.smokeTimer = 0.3;
      } else if (b.type === 'sawpit' && b.alert === '' && b.workerId) {
        this.effects.emit('chips', p.x + 0.1, p.y + 0.45, p.z - 0.1, 2);
        v.smokeTimer = 0.25;
      } else v.smokeTimer = 1;
    }
  }

  /** Stock piles are merged into a single mesh per building to keep draw calls low. */
  private rebuildPiles(v: View, counts: Partial<Record<Good, number>>, spots: Partial<Record<Good, [number, number]>>): void {
    for (const c of v.piles.children) (c as THREE.Mesh).geometry.dispose();
    v.piles.clear();
    const parts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const yRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (const g of GOODS) {
      const n = counts[g] ?? 0;
      const spot = spots[g];
      if (!n || !spot) continue;
      for (let i = 0; i < n; i++) {
        q.identity();
        if (g === 'logs' || g === 'planks') {
          const per = g === 'logs' ? 4 : 2;
          const layer = Math.floor(i / per);
          const k = i % per;
          pos.set(spot[0] + (k - (per - 1) / 2) * (g === 'logs' ? 0.1 : 0.12), 0.05 + layer * (g === 'logs' ? 0.09 : 0.065), spot[1]);
          q.copy(yRot);
        } else if (g === 'stone') {
          const layer = Math.floor(i / 4);
          const k = i % 4;
          pos.set(spot[0] + ((k % 2) - 0.5) * 0.18, 0.05 + layer * 0.1, spot[1] + (Math.floor(k / 2) - 0.5) * 0.14);
        } else {
          pos.set(spot[0] + ((i % 3) - 1) * 0.2, 0.04, spot[1] + (Math.floor(i / 3) - 1) * 0.2);
        }
        parts.push(this.goodGeo[g].clone().applyMatrix4(m.compose(pos, q, one)));
      }
    }
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.castShadow = true;
    v.piles.add(mesh);
  }

  /** World-space position of a building's footprint centre (for selection rings, overlays). */
  centre(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v ? v.group.position.clone() : null;
  }

  dispose(): void {
    for (const g of this.geoCache.values()) g.dispose();
    for (const v of this.views.values()) v.clipMat?.dispose();
    this.material.dispose();
  }
}
