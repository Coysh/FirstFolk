import * as THREE from 'three';
import type { Good } from '../sim/defs';
import type { World } from '../sim/world';
import { ModelBuilder, box, cone, cyl, sphere } from './modelBuilder';
import { C } from './palette';
import type { HeightField } from './terrain';

/** What a cart carries shows in its load. */
const LOAD: Record<Good, number> = { logs: C.wood, planks: C.lightWood, stone: C.stone, berries: C.berry, fish: 0x8fa9b8, grain: C.thatchLight, bread: 0xc58a45, ale: C.wood, ore: 0x57606b, tools: C.iron };
const OWNER = [0xf2c14e, 0xd9534f];

/** The cart itself: a plank bed on two big wheels, a yoke and a pair of oxen. The canopy and load take their colours per cart. */
function cartGeometry(canopy: number, load: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.add(box(0.95, 0.1, 0.55), C.lightWood, { pos: [0, 0.34, 0] });
  for (const z of [-0.32, 0.32]) b.add(cyl(0.26, 0.26, 0.06, 10), C.darkTimber, { pos: [-0.05, 0.26, z], rot: [Math.PI / 2, 0, 0] });
  b.add(box(0.5, 0.26, 0.4), load, { pos: [-0.12, 0.52, 0] });
  b.add(sphere(0.2, 7, 5), canopy, { pos: [-0.12, 0.74, 0], scale: [1.5, 0.8, 1] });
  b.add(box(0.7, 0.05, 0.05), C.timber, { pos: [0.8, 0.36, 0] });
  for (const z of [-0.17, 0.17]) {
    b.add(box(0.42, 0.26, 0.2), 0x6e4a2e, { pos: [1.15, 0.4, z] });
    b.add(box(0.16, 0.18, 0.18), 0x5a3b22, { pos: [1.42, 0.5, z] });
    b.add(cone(0.03, 0.14, 4), C.cloth, { pos: [1.45, 0.64, z + (z > 0 ? 0.08 : -0.08)], rot: [0, 0, 0] });
  }
  return b.build();
}

/** Caravans on the road: an ox-cart per caravan, tinted by who sent it, loaded with what it carries. */
export class CaravansView {
  readonly group = new THREE.Group();
  private carts = new Map<number, { mesh: THREE.Mesh; key: string }>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  private geos = new Map<string, THREE.BufferGeometry>();

  constructor(private hf: HeightField) {}

  private geometry(owner: number, good: Good): THREE.BufferGeometry {
    const key = `${owner}:${good}`;
    let g = this.geos.get(key);
    if (!g) this.geos.set(key, (g = cartGeometry(OWNER[owner] ?? OWNER[1], LOAD[good])));
    return g;
  }

  update(world: World): void {
    const seen = new Set<number>();
    for (const c of world.caravans) {
      seen.add(c.id);
      const key = `${c.owner}:${c.phase === 'out' ? c.good : 'x'}`;
      let v = this.carts.get(c.id);
      if (!v) {
        const mesh = new THREE.Mesh(this.geometry(c.owner, c.good), this.material);
        mesh.castShadow = true;
        this.group.add(mesh);
        v = { mesh, key: '' };
        this.carts.set(c.id, v);
      }
      // Empty on the way home.
      if (v.key !== key) {
        v.key = key;
        v.mesh.geometry = this.geometry(c.owner, c.phase === 'out' ? c.good : 'logs');
        if (c.phase === 'home') v.mesh.scale.set(1, 1, 1);
      }
      const next = c.path[c.step];
      const f = c.progress / 1000;
      const nx = next === undefined ? c.x : next % world.size;
      const ny = next === undefined ? c.y : Math.floor(next / world.size);
      const x = c.x + 0.5 + (nx - c.x) * f;
      const z = c.y + 0.5 + (ny - c.y) * f;
      v.mesh.position.set(x, this.hf.at(x, z), z);
      if (nx !== c.x || ny !== c.y) v.mesh.rotation.y = Math.atan2(-(ny - c.y), nx - c.x);
    }
    for (const [id, v] of [...this.carts])
      if (!seen.has(id)) {
        this.group.remove(v.mesh);
        this.carts.delete(id);
      }
  }
}
