import * as THREE from 'three';
import { BUILDINGS, DISCOVERIES, type Good } from '../sim/defs';
import { NO_OWNER } from '../sim/territory';
import type { Building, World } from '../sim/world';
import type { BuildingsView } from './buildings';
import type { SitesView } from './sites';

export const ICON: Record<string, string> = {
  logs: '/assets/icons/logs.png',
  planks: '/assets/icons/planks.png',
  stone: '/assets/icons/stone.png',
  berries: '/assets/icons/berries.png',
  fish: '/assets/icons/fish.png',
  fisher: '/assets/icons/fisher.png',
  people: '/assets/icons/people.png',
  hammer: '/assets/icons/hammer.png',
  scroll: '/assets/icons/scroll.png',
  woodcutter: '/assets/icons/woodcutter.png',
  forager: '/assets/icons/forager.png',
  quarry: '/assets/icons/quarry.png',
  forester: '/assets/icons/forester.png',
  hut: '/assets/icons/hut.png',
  sawpit: '/assets/icons/sawpit.png',
  storehouse: '/assets/icons/storehouse.png',
  wagon: '/assets/icons/hut.png',
  lookout: '/assets/icons/lookout.png',
};

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
}

/**
 * DOM layer over the canvas for crisp world-anchored UI: problem bubbles above buildings
 * and "+1" floaters when goods are produced or reach a store. Positions are projected each frame.
 */
export class Overlay {
  readonly root: HTMLDivElement;
  private bubbles = new Map<number, { el: HTMLDivElement; key: string }>();
  private floaters: Floater[] = [];
  private pending = new Map<string, { pos: THREE.Vector3; good: Good; n: number; bonus: boolean; t: number }>();
  private pins = new Map<number, HTMLDivElement>();
  private v = new THREE.Vector3();
  visible = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
  }

  /** Queue a "+n" floater; repeated events at the same place within half a second merge. */
  floater(key: string, pos: THREE.Vector3, good: Good, bonus: boolean): void {
    const p = this.pending.get(key);
    if (p) {
      p.n++;
      p.bonus ||= bonus;
    } else {
      // Fan different goods out around the building so their floaters never stack.
      const k = ['logs', 'planks', 'stone', 'berries', 'fish'].indexOf(good);
      const p2 = pos.clone().add(new THREE.Vector3((k - 1.5) * 0.45, 0, (k % 2) * 0.3));
      this.pending.set(key, { pos: p2, good, n: 1 + (bonus ? 1 : 0), bonus, t: 0.45 });
    }
  }

  update(world: World, buildings: BuildingsView, camera: THREE.Camera, w: number, h: number, dt: number, distance: number, sites?: SitesView): void {
    const project = (p: THREE.Vector3, lift: number) => {
      this.v.set(p.x, p.y + lift, p.z).project(camera);
      return { x: ((this.v.x + 1) / 2) * w, y: ((1 - this.v.y) / 2) * h, on: this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 };
    };
    const scale = Math.max(0.6, Math.min(1.1, 26 / distance));

    // Problem bubbles.
    const seen = new Set<number>();
    for (const b of world.buildings.values()) {
      const content = this.visible ? bubbleFor(b) : null;
      if (!content) continue;
      const c = buildings.centre(b.id);
      if (!c) continue;
      seen.add(b.id);
      let bub = this.bubbles.get(b.id);
      if (!bub) {
        const el = document.createElement('div');
        el.className = 'bubble';
        this.root.appendChild(el);
        bub = { el, key: '' };
        this.bubbles.set(b.id, bub);
      }
      if (bub.key !== content.key) {
        bub.key = content.key;
        bub.el.innerHTML = `<img src="${content.icon}" alt=""><span class="glyph ${content.tone}">${content.glyph}</span>`;
        bub.el.title = b.status;
      }
      const s = project(c, 2.0);
      bub.el.style.display = s.on ? '' : 'none';
      bub.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${scale})`;
    }
    for (const [id, bub] of this.bubbles)
      if (!seen.has(id)) {
        bub.el.remove();
        this.bubbles.delete(id);
      }

    // Discovery pins: seen but unclaimed sites, labelled so the player knows what's out there.
    if (sites) {
      for (const site of world.sites) {
        const show = this.visible && site.revealed & 1 && site.claimedBy === NO_OWNER;
        let pin = this.pins.get(site.id);
        if (!show) {
          if (pin) {
            pin.remove();
            this.pins.delete(site.id);
          }
          continue;
        }
        if (!pin) {
          const d = DISCOVERIES[site.kind];
          pin = document.createElement('div');
          pin.className = 'pin';
          pin.innerHTML = `<span class="pin-icon">${d.icon}</span><span class="pin-name">${d.name}</span>`;
          pin.title = `${d.name}: ${d.blurb} Extend your border over it to claim it.`;
          this.root.appendChild(pin);
          this.pins.set(site.id, pin);
        }
        const p = sites.position(world, site.id);
        if (!p) continue;
        const s = project(p, 2.4);
        pin.style.display = s.on ? '' : 'none';
        pin.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${Math.max(0.75, scale)})`;
      }
    }

    // Spawn merged floaters.
    for (const [key, p] of this.pending) {
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.delete(key);
      if (!this.visible) continue;
      const el = document.createElement('div');
      el.className = `floater ${p.bonus ? 'bonus' : ''}`;
      el.innerHTML = `+${p.n}<img src="${ICON[p.good]}" alt="">`;
      this.root.appendChild(el);
      this.floaters.push({ el, pos: p.pos, t: 0 });
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t > 1.4) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      const s = project(f.pos, 1.3 + f.t * 0.9);
      f.el.style.opacity = String(Math.min(1, (1.4 - f.t) * 2.5));
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${scale})`;
      f.el.style.display = s.on ? '' : 'none';
    }
  }

  clear(): void {
    this.root.innerHTML = '';
    this.bubbles.clear();
    this.pins.clear();
    this.floaters = [];
    this.pending.clear();
  }

  dispose(): void {
    this.root.remove();
  }
}

function bubbleFor(b: Building): { key: string; icon: string; glyph: string; tone: string } | null {
  const job = BUILDINGS[b.type].job;
  switch (b.alert) {
    case 'noWorker':
      return { key: 'noWorker', icon: ICON.people, glyph: '?', tone: 'warn' };
    case 'noResource':
      return job && job.kind === 'gather' ? { key: 'noRes', icon: ICON[job.good], glyph: '✕', tone: 'bad' } : { key: 'noRes', icon: ICON.forester, glyph: '✕', tone: 'bad' };
    case 'full':
      return job && job.kind !== 'plant' ? { key: 'full', icon: ICON[job.good], glyph: '!', tone: 'warn' } : null;
    case 'noInput':
      return job && job.kind === 'process' ? { key: 'noInput', icon: ICON[job.input], glyph: '···', tone: 'info' } : null;
    case 'materials':
      return b.delivered.logs + b.delivered.stone + b.delivered.planks === 0 && b.work === 0 ? null : { key: 'mat', icon: ICON.hammer, glyph: '···', tone: 'info' };
    default:
      return null;
  }
}
