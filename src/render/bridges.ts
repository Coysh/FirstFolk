import * as THREE from 'three';
import { spanEnds, type Span } from '../sim/bridges';
import type { World } from '../sim/world';
import { ModelBuilder, box, cyl } from './modelBuilder';
import { C } from './palette';
import type { HeightField } from './terrain';

const GLOW = 2;

/**
 * A plank bridge for a span, built up to `built` tiles (the rest is a stack of planks and stakes).
 * The deck rises gently from bank to bank, with rope rails, piers sunk into the water and a lantern
 * at each end that glows after dusk. Coordinates are world space, so the mesh sits at the origin.
 */
export function bridgeGeometry(hf: HeightField, s: Span, built: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const [ea, eb] = spanEnds(s);
  const hA = hf.at(ea[0] + 0.5, ea[1] + 0.5);
  const hB = hf.at(eb[0] + 0.5, eb[1] + 0.5);
  const along = s.dir === 0 ? [1, 0] : [0, 1];
  const dims = (a: number, h: number, w: number): [number, number, number] => (s.dir === 0 ? [a, h, w] : [w, h, a]);
  const deckY = (k: number) => {
    const t = (k + 1) / (s.len + 1);
    return hA + (hB - hA) * t + 0.16 + 0.22 * 4 * t * (1 - t);
  };
  for (let k = 0; k < Math.min(built, s.len); k++) {
    const cx = s.x + along[0] * k + 0.5;
    const cz = s.y + along[1] * k + 0.5;
    const y = deckY(k);
    b.add(box(...dims(1.04, 0.09, 0.92)), C.lightWood, { pos: [cx, y, cz] });
    for (const o of [-0.3, 0, 0.3]) b.add(box(...dims(0.03, 0.1, 0.9)), C.wood, { pos: [cx + along[0] * o, y + 0.005, cz + along[1] * o] });
    for (const side of [-1, 1]) {
      const sx = cx + (s.dir === 0 ? 0 : side * 0.44);
      const sz = cz + (s.dir === 0 ? side * 0.44 : 0);
      b.add(box(0.07, 0.36, 0.07), C.timber, { pos: [sx, y + 0.22, sz] });
      b.add(box(...dims(1.0, 0.035, 0.035)), C.cloth, { pos: [sx, y + 0.36, sz] });
      b.add(box(...dims(1.0, 0.03, 0.03)), C.clothShade, { pos: [sx, y + 0.2, sz] });
      // Piers: a post driven into the bed under every other tile.
      if (k % 2 === 0) b.add(cyl(0.06, 0.07, y - 0.5, 6), C.darkTimber, { pos: [sx, (y + 0.5) / 2 - 0.04, sz] });
    }
  }
  if (built >= 1) {
    // A lantern on a post at each end, glowing after dusk.
    for (const [k, side] of [[0, 1], [Math.min(built, s.len) - 1, -1]] as const) {
      const cx = s.x + along[0] * k + 0.5;
      const cz = s.y + along[1] * k + 0.5;
      const sx = cx + (s.dir === 0 ? 0 : side * 0.44);
      const sz = cz + (s.dir === 0 ? side * 0.44 : 0);
      const y = deckY(k);
      b.add(cyl(0.025, 0.03, 0.34, 5), C.wood, { pos: [sx, y + 0.55, sz] });
      b.add(box(0.1, 0.12, 0.1), C.glow, { pos: [sx, y + 0.78, sz], sway: GLOW });
      b.add(box(0.14, 0.03, 0.14), C.iron, { pos: [sx, y + 0.86, sz] });
    }
  }
  if (built < s.len) {
    // The next stretch: stakes marking it out and a stack of planks waiting.
    const k = built;
    const cx = s.x + along[0] * k + 0.5;
    const cz = s.y + along[1] * k + 0.5;
    const y = deckY(Math.max(0, k - 1));
    for (const side of [-1, 1]) b.add(cyl(0.03, 0.03, 0.7, 5), C.wood, { pos: [cx + (s.dir === 0 ? 0 : side * 0.44), y + 0.2, cz + (s.dir === 0 ? side * 0.44 : 0)] });
    for (let i = 0; i < 4; i++) b.add(box(...dims(0.4, 0.04, 0.12)), i % 2 ? C.lightWood : 0xd9b07a, { pos: [ea[0] + 0.5 - along[0] * 0.8, hA + 0.06 + i * 0.045, ea[1] + 0.5 - along[1] * 0.8 + (s.dir === 0 ? 0 : 0.35)] });
  }
  return b.build();
}

/** Every bridge in the world, plus the placement ghost. */
export class BridgesView {
  readonly group = new THREE.Group();
  private views = new Map<number, { mesh: THREE.Mesh; built: number }>();
  private ghost: THREE.Mesh;
  private ghostKey = '';

  constructor(
    private hf: HeightField,
    private material: THREE.Material,
    ghostMat: THREE.Material,
  ) {
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat);
    this.ghost.visible = false;
    this.group.add(this.ghost);
  }

  update(world: World): void {
    const live = new Set<number>();
    for (const br of world.bridges) {
      // Others' bridges stay out of sight until your folk have explored the water.
      if (br.owner !== 0 && !(world.explored[world.idx(br.x, br.y)] & 1)) continue;
      live.add(br.id);
      const built = br.done ? br.len : Math.floor((br.work / br.need) * br.len);
      let v = this.views.get(br.id);
      if (!v) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        v = { mesh, built: -1 };
        this.views.set(br.id, v);
      }
      if (v.built !== built) {
        v.mesh.geometry.dispose();
        v.mesh.geometry = bridgeGeometry(this.hf, br, built);
        v.built = built;
      }
    }
    for (const [id, v] of this.views)
      if (!live.has(id)) {
        v.mesh.geometry.dispose();
        this.group.remove(v.mesh);
        this.views.delete(id);
      }
  }

  /** The translucent span being placed (null hides it). */
  setGhost(span: Span | null, ok: boolean): void {
    if (!span) {
      this.ghost.visible = false;
      this.ghostKey = '';
      return;
    }
    const key = `${span.x},${span.y},${span.dir},${span.len}`;
    if (key !== this.ghostKey) {
      this.ghost.geometry.dispose();
      this.ghost.geometry = bridgeGeometry(this.hf, span, span.len);
      this.ghostKey = key;
    }
    const m = this.ghost.material as THREE.MeshStandardMaterial;
    m.color.setHex(ok ? C.ghostOk : C.ghostBad);
    m.emissive.setHex(ok ? C.ghostOk : C.ghostBad);
    this.ghost.visible = true;
  }

  dispose(): void {
    for (const v of this.views.values()) v.mesh.geometry.dispose();
    this.ghost.geometry.dispose();
  }
}
