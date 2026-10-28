import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Blender-built models (tools/blender → public/models/*.glb), baked into the same flat-coloured,
 * non-indexed geometry the code builders make, so the renderer's shared materials, instancing,
 * construction reveal and procedural animation all keep working. Anything missing from the GLBs
 * falls back to its code model in models.ts, and `?art=classic` skips them for an in-game A/B.
 */

/** Faces painted exactly this colour in Blender take the family crest at runtime. */
const NEUTRAL_CREST = 0xf4ecd6;

const geos = new Map<string, THREE.BufferGeometry>();
const anchors = new Map<string, THREE.Vector3>();
const partsOf = new Map<string, ArtPart[]>();

/** An animated piece of a model, authored as `<model>#<mode>` with a `<model>#<mode>@pivot` empty. */
export interface ArtPart {
  /** `spinz`: turns about the z axis through the pivot (windmill sails). */
  mode: string;
  /** Centred on the pivot, so rotating the mesh turns it about its own axle. */
  geo: THREE.BufferGeometry;
  pivot: THREE.Vector3;
}
let pending: Promise<void> | null = null;

export const artWanted = (): boolean => typeof location === 'undefined' || !/[?&]art=classic\b/.test(location.search);

/** Bake one mesh node: world transform applied, float attributes, `color` (vec3) and `sway` (float). */
function bake(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry;
  const pos = src.getAttribute('position');
  const col = src.getAttribute('color');
  const swy = src.getAttribute('_sway');
  const idx = src.index;
  const count = idx ? idx.count : pos.count;
  const p = new Float32Array(count * 3);
  const c = new Float32Array(count * 3);
  const s = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const i = idx ? idx.getX(k) : k;
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
    p[k * 3] = v.x;
    p[k * 3 + 1] = v.y;
    p[k * 3 + 2] = v.z;
    c[k * 3] = col ? col.getX(i) : 1;
    c[k * 3 + 1] = col ? col.getY(i) : 1;
    c[k * 3 + 2] = col ? col.getZ(i) : 1;
    s[k] = swy ? swy.getX(i) : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('sway', new THREE.BufferAttribute(s, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Register every mesh node (by name) and every `model@anchor` empty of a parsed glTF scene. */
export function indexScene(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    else if (o.name.includes('@')) anchors.set(o.name, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
  });
  for (const mesh of meshes) {
    const g = bake(mesh);
    const [base, mode] = mesh.name.split('#');
    const pivot = mode && anchors.get(`${mesh.name}@pivot`);
    if (mode && pivot) {
      g.translate(-pivot.x, -pivot.y, -pivot.z);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      (partsOf.get(base) ?? partsOf.set(base, []).get(base)!).push({ mode, geo: g, pivot });
    } else geos.set(mesh.name, g);
  }
}

/** The animated parts of a model (the Great Granary's windmill sails), if it has any. */
export const artParts = (key: string): readonly ArtPart[] => partsOf.get(key) ?? [];

export function loadArt(base = '/'): Promise<void> {
  pending ??= (async () => {
    if (!artWanted()) return;
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      for (const file of ['buildings', 'landmarks', 'settler']) indexScene((await loader.loadAsync(`${base}models/${file}.glb`)).scene);
    } catch (e) {
      console.warn('FirstFolk: Blender art failed to load, using code models', e);
      geos.clear();
      anchors.clear();
      partsOf.clear();
    }
  })();
  return pending;
}

export const hasArt = (key: string): boolean => geos.has(key);

/**
 * A model by name. Crest-marker faces take `crest` (or a neutral cloth colour when there is none);
 * `userData.smoke` carries the chimney anchor, if the model has one. Models without marker faces
 * are shared, so don't mutate the result.
 */
export function artGeometry(key: string, crest?: number): THREE.BufferGeometry | null {
  const base = geos.get(key);
  if (!base) return null;
  const smoke = anchors.get(`${key}@smoke`);
  if (smoke) base.userData.smoke = [smoke.x, smoke.y, smoke.z];
  const color = base.getAttribute('color') as THREE.BufferAttribute;
  let marked = false;
  for (let i = 0; i < color.count && !marked; i++) marked = color.getX(i) > 0.9 && color.getY(i) < 0.1 && color.getZ(i) > 0.9;
  if (!marked) return base;
  const g = base.clone();
  const out = g.getAttribute('color') as THREE.BufferAttribute;
  const tint = new THREE.Color(crest ?? NEUTRAL_CREST);
  for (let i = 0; i < out.count; i++) if (out.getX(i) > 0.9 && out.getY(i) < 0.1 && out.getZ(i) > 0.9) out.setXYZ(i, tint.r, tint.g, tint.b);
  g.userData = { ...base.userData };
  return g;
}
