import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];

export interface PartOpts {
  pos?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/**
 * Accumulates primitive parts with flat vertex colours and merges them into one geometry,
 * so each building / prop is a single draw call with one shared material.
 */
export class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number, opts: PartOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const [px, py, pz] = opts.pos ?? [0, 0, 0];
    const [rx, ry, rz] = opts.rot ?? [0, 0, 0];
    const [sx, sy, sz] = opts.scale ?? [1, 1, 1];
    tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
    tmpMatrix.compose(new THREE.Vector3(px, py, pz), tmpQuat, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(tmpMatrix);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    tmpColor.setHex(color);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** A gable roof prism: width along x, depth along z, ridge along x. Origin at eave centre. */
export function gableRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const x = w / 2;
  const z = d / 2;
  const v = [
    // front slope
    -x, 0, z, x, 0, z, x, h, 0,
    -x, 0, z, x, h, 0, -x, h, 0,
    // back slope
    x, 0, -z, -x, 0, -z, -x, h, 0,
    x, 0, -z, -x, h, 0, x, h, 0,
    // gable ends
    -x, 0, -z, -x, 0, z, -x, h, 0,
    x, 0, z, x, 0, -z, x, h, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const dodeca = (r: number) => new THREE.DodecahedronGeometry(r, 0);
export const sphere = (r: number, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
