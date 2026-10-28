import * as THREE from 'three';
import { NO_OWNER } from '../sim/territory';
import type { World } from '../sim/world';
import { discoveryGeometry } from './models';
import type { HeightField } from './terrain';

interface SiteView {
  group: THREE.Group;
  beacon: THREE.Mesh;
  phase: number;
}

/**
 * Discoveries in the wild: a prop on the ground and, while unclaimed, a tall shaft of
 * golden light that can be seen from across the valley, a goal pulling the border outwards.
 */
export class SitesView {
  readonly group = new THREE.Group();
  private views = new Map<number, SiteView>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  private beaconGeo = new THREE.CylinderGeometry(0.28, 0.5, 9, 10, 1, true).translate(0, 4.5, 0);
  private beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  constructor(private hf: HeightField, private player = 0) {}

  /** Discovery world position (tile centre on the ground). */
  position(world: World, siteId: number): THREE.Vector3 | null {
    const site = world.sites.find((s) => s.id === siteId);
    if (!site) return null;
    return new THREE.Vector3(site.x + 0.5, this.hf.at(site.x + 0.5, site.y + 0.5), site.y + 0.5);
  }

  update(world: World, time: number): void {
    const bit = 1 << this.player;
    for (const site of world.sites) {
      let v = this.views.get(site.id);
      if (!(site.revealed & bit)) continue;
      if (!v) {
        const group = new THREE.Group();
        const prop = new THREE.Mesh(discoveryGeometry(site.kind), this.material);
        prop.castShadow = true;
        prop.receiveShadow = true;
        const beacon = new THREE.Mesh(this.beaconGeo, this.beaconMat);
        beacon.renderOrder = 3;
        group.add(prop, beacon);
        group.position.set(site.x + 0.5, this.hf.at(site.x + 0.5, site.y + 0.5), site.y + 0.5);
        group.rotation.y = ((site.id * 2.39) % 6.28) - 3.14;
        this.group.add(group);
        v = { group, beacon, phase: site.id * 0.7 };
        this.views.set(site.id, v);
      }
      const open = site.claimedBy === NO_OWNER;
      v.beacon.visible = open;
      if (open) v.beacon.scale.set(1 + Math.sin(time * 1.6 + v.phase) * 0.12, 1, 1 + Math.sin(time * 1.6 + v.phase) * 0.12);
      // Wanderers pack up their camp once they've joined someone.
      if (site.kind === 'wanderers' && !open) v.group.visible = false;
    }
  }
}
