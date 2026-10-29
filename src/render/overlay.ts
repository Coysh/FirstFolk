import { STEADING_CHAR } from '../sim/steadingDefs';
import * as THREE from 'three';
import { BUILDINGS, DISCOVERIES, type Good } from '../sim/defs';
import { NO_OWNER } from '../sim/territory';
import { watched } from '../sim/renown';
import { BALANCE } from '../sim/balance';
import { hallOf, huscarls } from '../sim/warfare';
import { armyParts, hallSlots } from '../sim/army';
import type { Building, World } from '../sim/world';
import type { BuildingsView } from './buildings';
import type { SitesView } from './sites';

/** A glyph as an icon, for goods and buildings that have no painted art yet. */
const glyph = (g: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="48" font-size="46" text-anchor="middle">${g}</text></svg>`)}`;

export const ICON: Record<string, string> = {
  grain: glyph('🌾'),
  bread: glyph('🍞'),
  ale: glyph('🍺'),
  ore: glyph('⛓️'),
  tools: glyph('🔨'),
  farm: glyph('🌾'),
  bakehouse: glyph('🍞'),
  brewhouse: glyph('🍺'),
  mine: glyph('⛏️'),
  smithy: glyph('🔨'),
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
  renown: '/assets/icons/renown.png',
  shield: '/assets/icons/shield.png',
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
  private warPins = new Map<number, HTMLDivElement>();
  private armyPin: { el: HTMLDivElement; key: string } | null = null;
  private v = new THREE.Vector3();
  visible = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
  }

  /** A golden "+n renown" that rises from where it was earned. */
  renownFloater(pos: THREE.Vector3, n: number): void {
    if (!this.visible) return;
    const el = document.createElement('div');
    el.className = 'floater renown';
    el.textContent = `+${n} ★`;
    this.root.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0 });
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
      const content = this.visible && b.owner === 0 ? bubbleFor(b, world) : null;
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

    // The army, over your Mustering Hall: huscarls at home, the strength they would march with, and the drill.
    const hall = this.visible ? hallOf(world, 0) : undefined;
    const hc = hall ? buildings.centre(hall.id) : undefined;
    if (hall && hc) {
      const a = world.players[0].army;
      const n = huscarls(world, hall);
      const slots = hallSlots(world, 0);
      const strength = armyParts(world, 0, n).strength;
      const key = `${n}|${slots}|${strength}|${a.drill}`;
      if (!this.armyPin) {
        const el = document.createElement('div');
        el.className = 'pin army-pin';
        this.root.appendChild(el);
        this.armyPin = { el, key: '' };
      }
      if (this.armyPin.key !== key) {
        this.armyPin.key = key;
        this.armyPin.el.innerHTML = `<span class="pin-icon">⚔</span><span class="pin-name">${n}/${slots} huscarls</span><span class="pin-rate">${strength} strong · drill ${'●'.repeat(a.drill)}${'○'.repeat(BALANCE.army.drillMax - a.drill)}</span>`;
        this.armyPin.el.title = 'Your warband: click the hall to see what it is made of and how to strengthen it.';
      }
      const sc = project(hc, 2.8);
      this.armyPin.el.style.display = sc.on ? '' : 'none';
      this.armyPin.el.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -100%) scale(${Math.max(0.75, scale)})`;
    } else if (this.armyPin) {
      this.armyPin.el.remove();
      this.armyPin = null;
    }

    // Discovery pins: seen but unclaimed sites, labelled so the player knows what's out there.
    if (sites) {
      for (const site of world.sites) {
        const d = DISCOVERIES[site.kind];
        // Unclaimed finds, and every landmark (labelled with who holds it).
        const show = this.visible && site.revealed & 1 && (site.claimedBy === NO_OWNER || !!d.renown);
        let pin = this.pins.get(site.id);
        if (!show) {
          if (pin) {
            pin.remove();
            this.pins.delete(site.id);
          }
          continue;
        }
        if (!pin) {
          pin = document.createElement('div');
          pin.className = 'pin';
          const sname = site.st ? `${STEADING_CHAR[site.st.char].icon} ${site.st.name}` : d.name;
          pin.innerHTML = `<span class="pin-icon">${site.st ? '' : d.icon}</span><span class="pin-name">${sname}</span><span class="pin-rate"></span>`;
          pin.title = site.st ? `${site.st.name}: ${STEADING_CHAR[site.st.char].blurb} Send a cart with what they want; the first to deliver wins their favour.` : `${d.name}: ${d.blurb} Extend your border over it to claim it.`;
          this.root.appendChild(pin);
          this.pins.set(site.id, pin);
        }
        // Your landmarks pay only while a manned post watches them: say so when none does.
        const watch = site.heldBy === 0 && d.renown ? watched(world, 0, site.x, site.y) : '';
        if (site.st) {
          const ally = site.st.ally;
          const sstate = ally === 0 ? 'mine' : ally > 0 ? 'theirs' : 'open';
          const txt = ally === 0 ? 'stands with you' : ally > 0 ? 'stands with the rival' : site.st.want ? (site.st.want.kind === 'guard' ? 'wants a manned post' : `wants ${site.st.want.n} ${site.st.want.good}`) : 'looking for friends';
          if (pin.dataset.state !== `${sstate}|${txt}`) {
            pin.dataset.state = `${sstate}|${txt}`;
            pin.className = `pin ${sstate} landmark`;
            (pin.querySelector('.pin-rate') as HTMLElement).textContent = txt;
          }
          const sp = sites.position(world, site.id);
          if (sp) {
            const sc = project(sp, 2.6);
            pin.style.display = sc.on ? '' : 'none';
            pin.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -100%) scale(${Math.max(0.75, scale)})`;
          }
          continue;
        }
        const state = site.heldBy === 0 ? (d.renown && !watch ? 'mine unwatched' : watch === 'stockade' ? 'mine tended' : 'mine') : site.heldBy > 0 ? 'theirs' : 'open';
        if (pin.dataset.state !== state) {
          pin.dataset.state = state;
          pin.className = `pin ${state} ${d.renown ? 'landmark' : ''}`;
          const rate = pin.querySelector('.pin-rate') as HTMLElement;
          rate.textContent = d.renown
            ? state === 'mine unwatched'
              ? 'yours · unwatched: man a post nearby'
              : state === 'mine tended'
                ? `yours · +${d.renown + BALANCE.tendedBonus}★/min (stockade)`
                : state === 'mine'
                  ? `yours · +${d.renown}★/min`
                  : state === 'theirs'
                    ? `rival’s · +${d.renown}★/min`
                    : `+${d.renown}★/min`
            : '';
        }
        const p = sites.position(world, site.id);
        if (!p) continue;
        const s = project(p, 2.4);
        pin.style.display = s.on ? '' : 'none';
        pin.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${Math.max(0.75, scale)})`;
      }
    }

    // Warbands on the march: a war pin over each one in sight, so a raid reads from afar.
    const bandsSeen = new Set<number>();
    for (const band of world.warbands) {
      const next = band.path[band.step];
      const f = band.progress / 1000;
      const bx = band.x + (next === undefined ? 0 : ((next % world.size) - band.x) * f);
      const by = band.y + (next === undefined ? 0 : (Math.floor(next / world.size) - band.y) * f);
      const onUs = band.phase !== 'home' && world.buildings.get(band.targetId)?.owner === 0;
      if (!this.visible || (!onUs && !(world.explored[world.idx(Math.round(bx), Math.round(by))] & 1))) continue;
      bandsSeen.add(band.id);
      let pin = this.warPins.get(band.id);
      if (!pin) {
        pin = document.createElement('div');
        this.root.appendChild(pin);
        this.warPins.set(band.id, pin);
      }
      const side = band.owner === 0 ? 'mine' : 'theirs';
      const label = `${band.owner === 0 ? 'Your huscarls' : band.owner < 0 ? 'Reavers' : 'Rival raiders'} · ${band.clash ? `${band.clash.attack} vs ${band.clash.defence} · fighting!` : band.strength}${band.phase === 'home' ? ' · going home' : ''}`;
      if (pin.dataset.label !== label) {
        pin.dataset.label = label;
        pin.className = `pin war ${side}`;
        pin.innerHTML = `<span class="pin-icon">⚔️</span><span class="pin-name">${label}</span>`;
      }
      const v = new THREE.Vector3(bx + 0.5, 0, by + 0.5);
      v.y = buildings.baseHeight(Math.round(bx), Math.round(by), 1);
      const s = project(v, 1.9);
      pin.style.display = s.on ? '' : 'none';
      pin.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${Math.max(0.75, scale)})`;
    }
    for (const [id, pin] of this.warPins)
      if (!bandsSeen.has(id)) {
        pin.remove();
        this.warPins.delete(id);
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
      const s = project(f.pos, (f.el.classList.contains('renown') ? 0.4 : 1.3) + f.t * 0.9);
      f.el.style.opacity = String(Math.min(1, (1.4 - f.t) * 2.5));
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${scale})`;
      f.el.style.display = s.on ? '' : 'none';
    }
  }

  clear(): void {
    this.root.innerHTML = '';
    this.bubbles.clear();
    this.pins.clear();
    this.warPins.clear();
    this.armyPin = null;
    this.floaters = [];
    this.pending.clear();
  }

  dispose(): void {
    this.root.remove();
  }
}

function bubbleFor(b: Building, world: World): { key: string; icon: string; glyph: string; tone: string } | null {
  const job = BUILDINGS[b.type].job;
  const slots = BUILDINGS[b.type].garrison;
  // An unmanned post pushes at half strength (from Hamlet): it needs a guard.
  if (b.done && slots && b.guarded === 0 && world.players[b.owner].rank >= 1) return { key: 'unguarded', icon: ICON.shield, glyph: '?', tone: 'warn' };
  switch (b.alert) {
    case 'noWorker':
      return { key: 'noWorker', icon: ICON.people, glyph: '?', tone: 'warn' };
    case 'noResource':
      return job && job.kind === 'gather' ? { key: 'noRes', icon: ICON[job.good], glyph: '✕', tone: 'bad' } : { key: 'noRes', icon: ICON.forester, glyph: '✕', tone: 'bad' };
    case 'full':
      return job && job.kind !== 'plant' ? { key: 'full', icon: ICON[job.good], glyph: '!', tone: 'warn' } : null;
    case 'noInput':
      return job && job.kind === 'process' && job.input ? { key: 'noInput', icon: ICON[job.input], glyph: '···', tone: 'info' } : null;
    case 'materials':
      return b.delivered.logs + b.delivered.stone + b.delivered.planks === 0 && b.work === 0 ? null : { key: 'mat', icon: ICON.hammer, glyph: '···', tone: 'info' };
    default:
      return null;
  }
}
