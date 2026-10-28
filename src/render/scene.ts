import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../sim/defs';
import type { SimEvent, World } from '../sim/world';
import type { Quality } from '../settings';
import { BuildingsView } from './buildings';
import { CameraRig } from './camera';
import { buildDecor } from './decor';
import { Effects } from './effects';
import { FogOfWar } from './fow';
import { Wildlife } from './life';
import { buildingGeometry } from './models';
import { Nature } from './nature';
import { C } from './palette';
import { Footpaths } from './paths';
import { pickGround } from './picking';
import { isWinter } from '../sim/seasons';
import { SitesView } from './sites';
import { SettlersView } from './settlers';
import { SKY, Sky } from './sky';
import { HeightField, TerrainMesh, Water } from './terrain';
import { windTime } from './wind';

export interface Ghost {
  type: BuildingType;
  x: number;
  y: number;
  ok: boolean;
}

export type Progress = (fraction: number, label: string) => Promise<void>;

/** Yield to the browser so the loading screen can paint between heavy steps. */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.localClippingEnabled = true;
  return renderer;
}

/** Owns one Three.js scene and every view of a simulation. Reads sim state; never mutates it. */
export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly hf: HeightField;
  readonly rig: CameraRig;
  effects!: Effects;
  buildings!: BuildingsView;
  settlers!: SettlersView;
  private nature!: Nature;
  private water!: Water;
  private terrain!: TerrainMesh;
  private paths!: Footpaths;
  private sky!: Sky;
  private wildlife!: Wildlife;
  private decor!: THREE.Group;
  sites!: SitesView;
  private sun!: THREE.DirectionalLight;
  private ghostMesh!: THREE.Mesh;
  private ghostTiles!: THREE.Mesh;
  private ghostType: BuildingType | null = null;
  private ghostMat = new THREE.MeshStandardMaterial({ color: C.ghostOk, emissive: C.ghostOk, emissiveIntensity: 0.45, transparent: true, opacity: 0.72, flatShading: true, depthWrite: false });
  private tileMat = new THREE.MeshBasicMaterial({ color: C.ghostOk, transparent: true, opacity: 0.5, depthWrite: false });
  private ring!: THREE.Mesh;
  private hoverRing!: THREE.Mesh;
  private rangeRing!: THREE.Mesh;
  private boostRings: THREE.Mesh[] = [];
  readonly fow: FogOfWar;
  private borderGlow = 0;
  private borderGoal = 0;
  private snowAcc = 0;
  private raycaster = new THREE.Raycaster();
  /** Slow orbit for the title screen. */
  cinematic = false;
  private time = 0;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    private canvas: HTMLCanvasElement,
    readonly world: World,
    private quality: Quality,
  ) {
    this.hf = new HeightField(world.map);
    this.rig = new CameraRig(this.hf, world.size);
    this.fow = new FogOfWar(world.size);
  }

  /** Build the scene step by step, reporting real progress for the loading screen. */
  async build(progress: Progress = async () => {}): Promise<void> {
    const world = this.world;
    this.applyQuality(this.quality);
    this.scene.fog = new THREE.Fog(SKY.horizon, 45, 110);

    await progress(0.1, 'Shaping the valley');
    this.terrain = new TerrainMesh(world.map, this.hf);
    this.scene.add(this.terrain.mesh);
    this.paths = new Footpaths(this.terrain, world.size);
    this.water = new Water(world.map, this.hf);
    this.scene.add(this.water.mesh);

    await progress(0.3, 'Painting the sky');
    this.sky = new Sky(world.size);
    this.scene.add(this.sky.group);
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x7a6644, 1.35));
    this.sun = new THREE.DirectionalLight(0xffe3bd, 2.9);
    this.sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    await progress(0.45, 'Planting forests and meadows');
    this.decor = buildDecor(world.map, this.hf, this.quality === 'low' ? 0.35 : this.quality === 'balanced' ? 0.7 : 1);
    this.scene.add(this.decor);
    this.effects = new Effects(this.hf);
    this.nature = new Nature(this.hf);
    this.nature.update(world, 0);
    this.scene.add(this.nature.group, this.effects.group);

    await progress(0.62, 'Raising homes and workshops');
    this.buildings = new BuildingsView(this.hf, this.effects);
    this.settlers = new SettlersView(this.hf, this.effects);
    this.settlers.onStep = (x, z, a) => this.paths.step(x, z, a);
    const wagon = [...world.buildings.values()].find((b) => b.type === 'wagon');
    const home = wagon ? { x: wagon.x + 1, y: wagon.y + 1 } : { x: world.size / 2, y: world.size / 2 };
    this.wildlife = new Wildlife(world.map, this.hf, home);
    this.sites = new SitesView(this.hf);
    this.scene.add(this.buildings.group, this.settlers.group, this.wildlife.group, this.sites.group);
    this.buildings.update(world, 0);

    await progress(0.75, 'Gathering the folk');
    this.ghostMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
    this.ghostMesh.visible = false;
    this.ghostTiles = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.tileMat);
    this.ghostTiles.visible = false;
    const ringGeo = new THREE.RingGeometry(0.34, 0.44, 32).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.95, depthWrite: false }));
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, depthWrite: false }));
    for (const r of [this.ring, this.hoverRing, this.rangeRing]) {
      r.visible = false;
      r.renderOrder = 2;
    }
    this.scene.add(this.ghostMesh, this.ghostTiles, this.ring, this.hoverRing, this.rangeRing);
    // Fog of war and borders on the land and everything growing on it.
    this.fow.apply(this.terrain.mesh.material as THREE.Material, true);
    for (const o of [this.water.mesh, this.nature.group, this.decor]) this.fow.applyAll(o);
    this.fow.update(world);
    this.rig.lookAt(home.x, home.y + 2, true);
    this.resize();

    await progress(0.85, 'Lighting the hearths');
    // Compile shaders up front so the first seconds of play don't stutter.
    await this.renderer.compileAsync(this.scene, this.rig.camera);
    await progress(1, 'Ready');
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'balanced' ? Math.min(dpr, 1.5) : 1);
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.sun) this.sun.castShadow = q !== 'low';
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    this.rig.camera.aspect = aspect;
    // Keep a similar horizontal field of view on portrait phones.
    this.rig.camera.fov = aspect < 1 ? Math.min(60, 32 / Math.pow(aspect, 0.55)) : 32;
    this.rig.camera.updateProjectionMatrix();
  }

  beforeTick(): void {
    this.settlers.snapshot(this.world);
  }

  handleEvents(events: SimEvent[]): void {
    const seen = (x: number, y: number) => (this.world.explored[this.world.idx(x, y)] & 1) !== 0;
    for (const e of events) {
      if ((e.type === 'treeFelled' || e.type === 'rockMined' || e.type === 'saplingPlanted') && !seen(e.x, e.y)) continue;
      if (e.type === 'treeFelled') this.effects.fellTree(e.x, e.y);
      else if (e.type === 'rockMined' && e.depleted) this.effects.emit('stone', e.x + 0.5, this.hf.at(e.x + 0.5, e.y + 0.5) + 0.2, e.y + 0.5, 14);
      else if (e.type === 'claimed') {
        const p = this.sites.position(this.world, e.siteId);
        if (p) {
          this.effects.emit('sparkle', p.x, p.y + 0.6, p.z, 40);
          this.effects.emit('dust', p.x, p.y + 0.2, p.z, 16);
        }
      } else if (e.type === 'territoryGrew' && e.owner === 0) this.effects.emit('sparkle', e.x + 0.5, this.hf.at(e.x + 0.5, e.y + 0.5) + 1.5, e.y + 0.5, 24);
      else if (e.type === 'rankUp' && e.owner === 0) {
        const wagon = [...this.world.buildings.values()].find((b) => b.owner === 0 && b.type === 'wagon');
        if (wagon) this.effects.emit('sparkle', wagon.x + 1, this.hf.at(wagon.x + 1, wagon.y + 1) + 1.5, wagon.y + 1, 60);
      } else if (e.type === 'deed' && seen(Math.max(0, e.x), Math.max(0, e.y)) && e.deed !== 'timber' && e.deed !== 'harvest' && e.deed !== 'lessons') {
        const y = this.hf.at(e.x + 0.5, e.y + 0.5);
        this.effects.emit('sparkle', e.x + 0.5, y + 1.2, e.y + 0.5, 70);
        this.effects.emit('dust', e.x + 0.5, y + 0.2, e.y + 0.5, 24);
      } else if (e.type === 'holdingChanged') {
        const p = this.sites.position(this.world, e.siteId);
        if (p && seen(Math.floor(p.x), Math.floor(p.z))) this.effects.emit('sparkle', p.x, p.y + 1.5, p.z, 50);
      } else if (e.type === 'died' && e.legend && seen(e.x, e.y)) this.effects.emit('sparkle', e.x + 0.5, this.hf.at(e.x + 0.5, e.y + 0.5) + 1, e.y + 0.5, 40);
      else if (e.type === 'saplingPlanted') this.effects.emit('sparkle', e.x + 0.5, this.hf.at(e.x + 0.5, e.y + 0.5) + 0.2, e.y + 0.5, 6);
    }
  }

  setGhost(g: Ghost | null): void {
    this.borderGoal = g ? 1 : 0;
    this.rangeRing.visible = false;
    if (!g) {
      this.ghostMesh.visible = false;
      this.ghostTiles.visible = false;
      return;
    }
    if (g.type !== this.ghostType) {
      this.ghostType = g.type;
      this.ghostMesh.geometry = buildingGeometry(g.type);
    }
    const size = BUILDINGS[g.type].size;
    const base = this.buildings.baseHeight(g.x, g.y, size);
    this.ghostMesh.position.set(g.x + size / 2, base + 0.02, g.y + size / 2);
    this.ghostMesh.visible = true;
    const color = g.ok ? C.ghostOk : C.ghostBad;
    this.ghostMat.color.setHex(color);
    this.ghostMat.emissive.setHex(color);
    this.tileMat.color.setHex(color);
    this.ghostTiles.scale.set(size, 1, size + 1);
    this.ghostTiles.position.set(g.x + size / 2, base + 0.05, g.y + (size + 1) / 2);
    this.ghostTiles.visible = true;
    // Work radius for gatherers and foresters.
    const job = BUILDINGS[g.type].job;
    if (job && (job.kind === 'gather' || job.kind === 'plant')) {
      const ex = g.x + 0.5;
      const ez = g.y + size + 0.5;
      this.rangeRing.position.set(ex, this.hf.at(ex, ez) + 0.1, ez);
      this.rangeRing.scale.setScalar(job.radius + 0.5);
      this.rangeRing.visible = true;
    }
  }

  setSelection(pos: THREE.Vector3 | null, radius = 0.4): void {
    this.ring.visible = !!pos;
    if (pos) {
      this.ring.position.set(pos.x, pos.y + 0.05, pos.z);
      this.ring.scale.setScalar(radius / 0.4);
    }
  }

  setHover(pos: THREE.Vector3 | null, radius = 0.4): void {
    this.hoverRing.visible = !!pos;
    if (pos) {
      this.hoverRing.position.set(pos.x, pos.y + 0.04, pos.z);
      this.hoverRing.scale.setScalar(radius / 0.4);
    }
  }

  groundHeight(x: number, z: number): number {
    return this.hf.at(x, z);
  }

  /**
   * Festivals: a ring of light on the ground showing where influence surges, in the colour
   * of whoever holds it, pulsing until it ends.
   */
  private updateBoostRings(): void {
    let i = 0;
    for (const p of this.world.players)
      for (const b of p.boosts) {
        if (b.until <= this.world.tick || !(this.world.explored[this.world.idx(b.x, b.y)] & 1)) continue;
        let ring = this.boostRings[i];
        if (!ring) {
          ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }));
          ring.renderOrder = 2;
          this.scene.add(ring);
          this.boostRings.push(ring);
        }
        (ring.material as THREE.MeshBasicMaterial).color.setHex(p.id === 0 ? 0xffd75e : 0xff6b5e);
        ring.position.set(b.x + 0.5, this.hf.at(b.x + 0.5, b.y + 0.5) + 0.25, b.y + 0.5);
        ring.scale.setScalar(b.r * (0.96 + Math.sin(this.time * 3) * 0.04));
        ring.visible = true;
        i++;
      }
    for (; i < this.boostRings.length; i++) this.boostRings[i].visible = false;
  }

  /** Ground point under a screen position (CSS pixels relative to the canvas). */
  groundAt(sx: number, sy: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((sx / this.canvas.clientWidth) * 2 - 1, -(sy / this.canvas.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    return pickGround(this.raycaster.ray, this.hf);
  }

  /** Nearest settler within `radiusPx` of a screen position. */
  settlerAt(sx: number, sy: number, radiusPx = 26): number | null {
    let best: number | null = null;
    let bestD = radiusPx * radiusPx;
    const v = new THREE.Vector3();
    for (const [id, p] of this.settlers.positions) {
      if (!this.world.settlers.has(id)) continue;
      v.set(p.x, p.y + 0.3, p.z).project(this.rig.camera);
      const px = ((v.x + 1) / 2) * this.canvas.clientWidth;
      const py = ((1 - v.y) / 2) * this.canvas.clientHeight;
      const d = (px - sx) ** 2 + (py - sy) ** 2;
      if (d < bestD && v.z < 1) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /** Building under a screen position, with a little forgiveness around the footprint. */
  buildingAt(sx: number, sy: number): number | null {
    const p = this.groundAt(sx, sy);
    if (!p) return null;
    for (const [dx, dz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
      const x = Math.floor(p.x + dx);
      const z = Math.floor(p.z + dz);
      if (!this.world.inBounds(x, z)) continue;
      const id = this.world.buildingAt[this.world.idx(x, z)];
      if (id) return id;
    }
    return null;
  }

  render(alpha: number, dt: number): void {
    this.time += dt;
    windTime.value = this.time;
    if (this.cinematic) this.rig.rotate(dt * 0.05, true);
    this.rig.update(dt);
    const t = this.rig.target;
    // Keep the shadow frustum tight around what the camera sees.
    const span = Math.min(48, 10 + this.rig.distance * 0.8);
    const cam = this.sun.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 1;
    cam.far = 140;
    cam.updateProjectionMatrix();
    this.sun.position.set(t.x + SKY.sunDir.x * 50, t.y + SKY.sunDir.y * 50, t.z + SKY.sunDir.z * 50);
    this.sun.target.position.copy(t);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.rig.distance * 1.5;
    fog.far = this.rig.distance * 3.4 + 35;

    this.fow.update(this.world);
    this.updateBoostRings();
    this.fow.uniforms.uFowStrength.value = this.cinematic ? 0.55 : 1;
    // Frost creeps in with winter and thaws with spring.
    const snowGoal = isWinter(this.world) ? 1 : 0;
    const snow = this.fow.uniforms.uSnow;
    snow.value += (snowGoal - snow.value) * Math.min(1, dt * 0.35);
    if (snowGoal && !this.cinematic) {
      this.snowAcc += dt * Math.min(60, 10 + this.rig.distance);
      const n = Math.floor(this.snowAcc);
      this.snowAcc -= n;
      if (n) this.effects.snowfall(t.x, t.z, 6 + this.rig.distance * 0.5, t.y + 5, n);
    }
    this.borderGlow += (this.borderGoal - this.borderGlow) * Math.min(1, dt * 8);
    this.fow.uniforms.uBorderGlow.value = this.borderGlow;
    this.sky.update(dt, this.rig.camera);
    this.water.update(this.time);
    this.nature.update(this.world, this.time);
    this.buildings.update(this.world, dt);
    this.sites.update(this.world, this.time);
    this.settlers.update(this.world, alpha, this.time, dt);
    this.paths.update(dt);
    this.wildlife.update(this.time, dt);
    this.effects.update(dt);
    if (this.ring.visible) this.ring.rotation.y += dt * 0.8;
    this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.buildings?.dispose();
    this.renderer.renderLists.dispose();
  }
}
