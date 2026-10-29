import * as THREE from 'three';
import { HEIGHT_STEP, Terrain, type MapData } from '../sim/mapgen';
import { fbm } from '../sim/noise';
import { hash2 } from '../sim/rng';
import { TERRAIN_COLORS } from './palette';

/** Render-only vertical exaggeration: gentle sim hills read as proper rolling countryside. */
export const VERTICAL = 1.35;

/** Height sampler matching the rendered triangles exactly (each tile split along its a–d diagonal). */
export class HeightField {
  constructor(private map: MapData) {}

  corner(x: number, y: number): number {
    const N = this.map.size;
    x = Math.max(0, Math.min(N, x));
    y = Math.max(0, Math.min(N, y));
    return this.map.heights[y * (N + 1) + x] * HEIGHT_STEP * VERTICAL;
  }

  /** World height at world coords (x, z), where tile (i, j) spans [i, i+1] × [j, j+1]. */
  at(x: number, z: number): number {
    const N = this.map.size;
    x = Math.max(0, Math.min(N - 0.001, x));
    z = Math.max(0, Math.min(N - 0.001, z));
    const i = Math.floor(x);
    const j = Math.floor(z);
    const u = x - i;
    const v = z - j;
    const a = this.corner(i, j);
    const b = this.corner(i + 1, j);
    const c = this.corner(i, j + 1);
    const d = this.corner(i + 1, j + 1);
    return u > v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v;
  }

  get waterY(): number {
    return this.map.waterLevel * HEIGHT_STEP * VERTICAL - 0.05;
  }
}

/**
 * Low-poly terrain with painterly colour variation: large soft patches, slope shading,
 * warm sun-facing tints, shoreline sand and snowy peaks. Base colours are kept so
 * footpaths (see paths.ts) can wear into the grass and fade again.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh;
  readonly base: Float32Array;
  readonly colors: THREE.BufferAttribute;

  constructor(private map: MapData, hf: HeightField) {
    const N = map.size;
    const positions = new Float32Array(N * N * 18);
    const colors = new Float32Array(N * N * 18);
    const col = new THREE.Color();
    const tint = new THREE.Color();
    const dry = new THREE.Color(0xc7c46a);
    const lush = new THREE.Color(0x5f9a45);
    let p = 0;
    const seed = 991;

    const push = (pts: number[][], color: THREE.Color) => {
      for (const [x, y, z] of pts) {
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        colors[p] = color.r;
        colors[p + 1] = color.g;
        colors[p + 2] = color.b;
        p += 3;
      }
    };

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const t = map.terrain[j * N + i];
        const a = [i, hf.corner(i, j), j];
        const b = [i + 1, hf.corner(i + 1, j), j];
        const c = [i, hf.corner(i, j + 1), j + 1];
        const d = [i + 1, hf.corner(i + 1, j + 1), j + 1];
        const avg = (a[1] + b[1] + c[1] + d[1]) / 4;
        const slope = Math.max(a[1], b[1], c[1], d[1]) - Math.min(a[1], b[1], c[1], d[1]);
        const patch = fbm(i * 0.06, j * 0.06, seed, 3);
        const fine = fbm(i * 0.25, j * 0.25, seed + 5, 2);
        for (let tri = 0; tri < 2; tri++) {
          col.setHex(TERRAIN_COLORS[t]);
          if (t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest) {
            // Large soft patches of drier and lusher grass.
            if (patch > 0.55) col.lerp(dry, Math.min(0.3, (patch - 0.55) * 0.9));
            else if (patch < 0.42) col.lerp(lush, Math.min(0.35, (0.42 - patch) * 1.2));
            if (t === Terrain.Meadow && hash2(i, j * 2 + tri, 13) > 0.9) col.lerp(tint.setHex(0xe8d36a), 0.35);
            // Steeper ground shows earth.
            if (slope > 0.35) col.lerp(tint.setHex(0x8a7650), Math.min(0.55, (slope - 0.35) * 1.2));
          }
          if ((t === Terrain.Mountain || t === Terrain.Rock) && avg > 6.6) col.setHex(0xf3f1ea);
          if (t === Terrain.Sand && fine > 0.55) col.lerp(tint.setHex(0xd4bd84), 0.4);
          const n = hash2(i * 2 + tri, j, 77) - 0.5;
          col.multiplyScalar(1 + n * 0.05 + (fine - 0.5) * 0.1);
          if (tri === 0) push([a, d, b], col);
          else push([a, c, d], col);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.colors = new THREE.BufferAttribute(colors, 3);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.colors);
    geo.computeVertexNormals();
    this.base = colors.slice();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }

  terrainAt(i: number, j: number): number {
    return this.map.terrain[j * this.map.size + i];
  }
}

/** Gently animated low-poly water sheet with a soft shoreline foam ring baked into vertex colours. */
export class Water {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;

  constructor(map: MapData, hf: HeightField) {
    const N = map.size;
    const seg = 96;
    const geo = new THREE.PlaneGeometry(N + 60, N + 60, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(N / 2, hf.waterY, N / 2);
    this.base = (geo.getAttribute('position').array as Float32Array).slice();
    // Lighter where the water is shallow (near shores), deeper blue in channels.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color(0x8fd0d8);
    const deep = new THREE.Color(0x3f8fb8);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const depth = hf.waterY - hf.at(x, z);
      c.copy(shallow).lerp(deep, Math.min(1, Math.max(0, depth / 0.7)));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      roughness: 0.18,
      metalness: 0.1,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }

  /** Ice: a pale, solid sheet in winter. */
  setFrozen(on: boolean): void {
    const m = this.mesh.material as THREE.MeshStandardMaterial;
    m.color.setHex(on ? 0xe6f4fb : 0xffffff);
    m.opacity = on ? 0.96 : 0.82;
    m.roughness = on ? 0.05 : 0.18;
  }

  update(time: number): void {
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.base[i];
      const z = this.base[i + 2];
      arr[i + 1] = this.base[i + 1] + Math.sin(x * 0.7 + time * 1.3) * 0.03 + Math.cos(z * 0.9 + time * 1.1) * 0.03;
    }
    pos.needsUpdate = true;
  }
}
