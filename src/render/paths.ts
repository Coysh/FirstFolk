import * as THREE from 'three';
import { Terrain } from '../sim/mapgen';
import type { TerrainMesh } from './terrain';

const DIRT = new THREE.Color(0xb39566);
const WALKABLE_GRASS = new Set<number>([Terrain.Grass, Terrain.Meadow, Terrain.Forest]);

/**
 * Footpaths emerge where settlers walk: each footstep wears the grass towards bare earth,
 * and unused paths slowly grow back. Purely cosmetic (render-side) but it makes the
 * settlement's logistics readable at a glance — and foreshadows roads.
 */
export class Footpaths {
  private wear: Float32Array;
  private dirty = new Set<number>();
  private timer = 0;
  private decayTimer = 0;
  private c = new THREE.Color();

  constructor(private terrain: TerrainMesh, private size: number) {
    this.wear = new Float32Array(size * size);
  }

  step(x: number, z: number, amount: number): void {
    const i = Math.floor(x);
    const j = Math.floor(z);
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return;
    const k = j * this.size + i;
    if (!WALKABLE_GRASS.has(this.terrain.terrainAt(i, j))) return;
    this.wear[k] = Math.min(100, this.wear[k] + amount);
    this.dirty.add(k);
  }

  update(dt: number): void {
    this.timer += dt;
    this.decayTimer += dt;
    if (this.decayTimer > 6) {
      // Slow regrowth so abandoned routes fade.
      this.decayTimer = 0;
      for (let k = 0; k < this.wear.length; k++) {
        if (this.wear[k] > 0) {
          this.wear[k] = Math.max(0, this.wear[k] - 0.6);
          this.dirty.add(k);
        }
      }
    }
    if (this.timer < 0.75 || !this.dirty.size) return;
    this.timer = 0;
    const base = this.terrain.base;
    const arr = this.terrain.colors.array as Float32Array;
    for (const k of this.dirty) {
      const t = Math.min(1, this.wear[k] / 30) * 0.75;
      const off = k * 18;
      for (let v = 0; v < 6; v++) {
        const o = off + v * 3;
        this.c.setRGB(base[o], base[o + 1], base[o + 2]).lerp(DIRT, t);
        arr[o] = this.c.r;
        arr[o + 1] = this.c.g;
        arr[o + 2] = this.c.b;
      }
    }
    this.dirty.clear();
    this.terrain.colors.needsUpdate = true;
  }
}
