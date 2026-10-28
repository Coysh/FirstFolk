import * as THREE from 'three';
import type { HeightField } from './terrain';

/** Intersect a ray with the heightfield by marching then bisecting. Cheaper than mesh raycasts. */
export function pickGround(ray: THREE.Ray, hf: HeightField, maxDist = 400): THREE.Vector3 | null {
  const p = new THREE.Vector3();
  const step = 0.35;
  let prevT = 0;
  for (let t = 0; t < maxDist; t += step) {
    ray.at(t, p);
    const ground = Math.max(hf.at(p.x, p.z), hf.waterY);
    if (p.y <= ground) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        ray.at(mid, p);
        if (p.y <= Math.max(hf.at(p.x, p.z), hf.waterY)) hi = mid;
        else lo = mid;
      }
      return ray.at(hi, p);
    }
    prevT = t;
  }
  return null;
}
