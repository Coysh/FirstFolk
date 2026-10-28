import * as THREE from 'three';
import { NO_OWNER } from '../sim/territory';
import { DISCOVERIES } from '../sim/defs';
import type { World } from '../sim/world';
import { discoveryGeometry } from './models';
import type { HeightField } from './terrain';

interface SiteView {
  group: THREE.Group;
  beacon: THREE.Mesh;
  flag: THREE.Group | null;
  phase: number;
}

/** Banner colours for whoever holds a landmark: you (gold) or the rival (red). */
const HOLDER_COLORS = [0xf2c14e, 0xd9534f];

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
        let flag: THREE.Group | null = null;
        if (DISCOVERIES[site.kind].renown) {
          // Landmarks fly the holder's banner, so you can see at a glance who has what.
          flag = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: 0x5a3b22, flatShading: true }));
          const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.9).translate(0, 2.2, 0.47), new THREE.MeshStandardMaterial({ color: HOLDER_COLORS[0], flatShading: true, side: THREE.DoubleSide }));
          cloth.name = 'cloth';
          flag.add(pole, cloth);
          flag.position.set(0.9, 0, -0.4);
          flag.castShadow = true;
          group.add(flag);
        }
        v = { group, beacon, flag, phase: site.id * 0.7 };
        this.views.set(site.id, v);
      }
      const open = site.claimedBy === NO_OWNER;
      v.beacon.visible = open;
      if (open) v.beacon.scale.set(1 + Math.sin(time * 1.6 + v.phase) * 0.12, 1, 1 + Math.sin(time * 1.6 + v.phase) * 0.12);
      if (v.flag) {
        v.flag.visible = site.heldBy !== NO_OWNER;
        if (site.heldBy !== NO_OWNER) {
          const cloth = v.flag.getObjectByName('cloth') as THREE.Mesh;
          (cloth.material as THREE.MeshStandardMaterial).color.setHex(HOLDER_COLORS[site.heldBy === this.player ? 0 : 1]);
          cloth.rotation.y = Math.sin(time * 2.1 + v.phase) * 0.18;
        }
      }
      // Wanderers pack up their camp once they've joined someone.
      if (site.kind === 'wanderers' && !open) v.group.visible = false;
    }
  }
}
