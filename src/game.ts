import { signal } from '@preact/signals';
import * as THREE from 'three';
import { audio, type Sfx } from './audio/audio';
import { TICK_MS } from './sim/balance';
import { canPlace } from './sim/commands';
import { BUILDINGS, DISCOVERIES, RANK_NAMES, type BuildingType, type Tool } from './sim/defs';
import { serializeWorld } from './sim/save';
import { BOONS } from './sim/boons';
import { eventDef } from './sim/events';
import { plural } from './sim/population';
import { objectiveStatus, type ObjectiveStatus } from './sim/scenario';
import { TRADES, tradeTitle } from './sim/trades';
import type { SimEvent, World } from './sim/world';
import type { Overlay } from './render/overlay';
import type { GameRenderer } from './render/scene';
import { writeSave } from './settings';

export const PLAYER = 0;

export type Mode = { kind: 'select' } | { kind: 'place'; type: BuildingType };
export type Selection = { kind: 'building'; id: number } | { kind: 'settler'; id: number } | null;

export interface Toast {
  id: number;
  icon: string;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'big';
}

export interface GhostState {
  type: BuildingType;
  x: number;
  y: number;
  ok: boolean;
  reason?: string;
  /** Resources within the work radius, for placement feedback. */
  inRange?: number;
}

const AUTOSAVE_SECONDS = 45;
const STRIKE_SFX: Record<Tool, Sfx> = { axe: 'chop', pick: 'pick', hammer: 'hammer', saw: 'saw', shovel: 'shovel', basket: 'click' };

/**
 * Glue between simulation, renderer, input and UI: runs the fixed-timestep loop, turns
 * player intents into Commands, and publishes UI state through signals.
 */
export class Game {
  readonly speed = signal(1);
  readonly paused = signal(false);
  /** The in-game menu (pause) is open: simulation halts. */
  readonly menuOpen = signal(false);
  readonly mode = signal<Mode>({ kind: 'select' });
  readonly ghost = signal<GhostState | null>(null);
  readonly selection = signal<Selection>(null);
  /** Bumped a few times a second; UI components read the world when it changes. */
  readonly version = signal(0);
  readonly objectives = signal<ObjectiveStatus[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly victory = signal<string | null>(null);
  readonly banner = signal<{ title: string; sub: string } | null>(null);
  /** True when the last placement interaction came from touch (shows a confirm button). */
  readonly touchPlacing = signal(false);
  readonly lastSaved = signal<number | null>(null);

  private acc = 0;
  private uiTimer = 0;
  private autosaveTimer = AUTOSAVE_SECONDS;
  private toastId = 0;
  private hovered: { kind: 'building' | 'settler'; id: number } | null = null;

  constructor(
    readonly world: World,
    readonly view: GameRenderer,
    readonly overlay: Overlay,
  ) {
    view.settlers.onStrike = (tool, x, _y, z) => audio.play(STRIKE_SFX[tool], this.distanceTo(x, z), this.hearing());
  }

  /** Called once the loading screen has faded: sweeping intro camera and first hint. */
  begin(fresh: boolean): void {
    this.objectives.value = objectiveStatus(this.world, PLAYER);
    const rig = this.view.rig;
    rig.distance = 58;
    rig.yaw = fresh ? -0.9 : -0.4;
    rig.goalYaw = 0;
    rig.goalDistance = 21;
    if (fresh) this.toast('/assets/icons/hut.png', 'Your family has arrived in the valley. Build a Woodcutter near the trees!', 'info');
    else this.toast('/assets/icons/scroll.png', 'Welcome back. Your folk carried on where you left them.', 'info');
  }

  private distanceTo(x: number, z: number): number {
    const t = this.view.rig.target;
    return Math.hypot(t.x - x, t.z - z);
  }

  private hearing(): number {
    return 10 + this.view.rig.distance * 0.9;
  }

  frame(dt: number): void {
    const running = !this.paused.value && !this.menuOpen.value;
    if (running) {
      this.acc += dt * 1000 * this.speed.value;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < 16) {
        this.view.beforeTick();
        this.world.step();
        this.acc -= TICK_MS;
        steps++;
      }
      if (steps === 16) this.acc = 0;
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) this.save(false);
    }
    const events = this.world.drainEvents();
    if (events.length) {
      this.view.handleEvents(events);
      this.handleEvents(events);
    }
    this.view.render(running ? this.acc / TICK_MS : 1, dt);
    this.updateSelectionRing();
    const canvas = this.view.renderer.domElement;
    this.overlay.update(this.world, this.view.buildings, this.view.rig.camera, canvas.clientWidth, canvas.clientHeight, dt, this.view.rig.distance, this.view.sites);
    audio.update(dt, Math.min(1, this.view.rig.distance / 60));

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.2;
      this.version.value++;
      this.objectives.value = objectiveStatus(this.world, PLAYER);
    }
  }

  save(manual: boolean): boolean {
    this.autosaveTimer = AUTOSAVE_SECONDS;
    const ok = writeSave(serializeWorld(this.world));
    if (ok) this.lastSaved.value = Date.now();
    if (manual) this.toast('/assets/icons/scroll.png', ok ? 'Game saved' : 'Could not save: browser storage is unavailable', ok ? 'good' : 'warn');
    return ok;
  }

  private posOf(buildingId: number): THREE.Vector3 | null {
    return this.view.buildings.centre(buildingId);
  }

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'buildingComplete': {
          const p = this.posOf(e.id);
          if (p) audio.play('complete', this.distanceTo(p.x, p.z), this.hearing() * 1.5);
          if (e.buildingType !== 'wagon') this.toast(icon(e.buildingType), `${BUILDINGS[e.buildingType].name} finished`, 'good');
          break;
        }
        case 'buildingPlaced':
          audio.play('place');
          break;
        case 'produced': {
          const p = this.posOf(e.buildingId);
          if (p) this.overlay.floater(`p${e.buildingId}`, p, e.good, e.bonus);
          break;
        }
        case 'delivered': {
          const b = this.world.buildings.get(e.buildingId);
          const p = this.posOf(e.buildingId);
          if (b?.done && p) {
            this.overlay.floater(`d${e.buildingId}${e.good}`, p, e.good, false);
            audio.play('deliver', this.distanceTo(p.x, p.z), this.hearing());
          }
          break;
        }
        case 'familyApproaching':
          audio.play('arrive');
          this.toast('/assets/icons/people.png', `The ${e.surname} family (${e.size}) are settling in. They know a little ${TRADES[e.skill].name.toLowerCase()}.`, 'good');
          break;
        case 'cameOfAge':
          this.toast('/assets/icons/people.png', `${e.name} ${e.surname} has come of age and learned from the family`, 'info');
          break;
        case 'born':
          audio.play('arrive');
          this.toast('/assets/icons/people.png', `${e.name} is born to the ${e.surname} family`, 'good');
          break;
        case 'tierUp': {
          const s = this.world.settlers.get(e.settlerId);
          const fam = s && this.world.families.get(s.familyId);
          const trade = TRADES[e.skill];
          audio.play('tierUp');
          this.toast(icon(this.world.buildings.get(e.buildingId)?.type ?? 'woodcutter'), `${s?.name} ${fam?.surname ?? ''} is now a ${tradeTitle(e.skill, e.tier)}! ${trade.perks[e.tier]}`, 'big');
          break;
        }
        case 'unlocked':
          this.toast(icon(e.buildingType), `New building: ${BUILDINGS[e.buildingType].name}`, 'good');
          break;
        case 'hungry':
          audio.play('warn');
          this.toast('/assets/icons/berries.png', 'Your folk are hungry and working slowly. Build another Forager.', 'warn');
          break;
        case 'fed':
          this.toast('/assets/icons/berries.png', 'Bellies are full again', 'good');
          break;
        case 'discovered':
          if (e.owner !== PLAYER) break;
          audio.play('objective');
          this.toast('/assets/icons/scroll.png', `Spotted beyond the border: ${DISCOVERIES[e.kind].name}. Build a Lookout towards it to claim it!`, 'info');
          break;
        case 'claimed': {
          const d = DISCOVERIES[e.kind];
          if (e.owner !== PLAYER) {
            this.toast('/assets/icons/scroll.png', `Your rival claimed the ${d.name}.`, 'warn');
            break;
          }
          audio.play('tierUp');
          this.banner.value = { title: `${d.icon} ${d.name} claimed!`, sub: e.text };
          setTimeout(() => (this.banner.value = null), 4200);
          break;
        }
        case 'rumour':
          if (e.owner !== PLAYER) break;
          audio.play('objective');
          this.toast('/assets/icons/people.png', `A traveller tells of the ${DISCOVERIES[e.kind].name} to the ${e.dir}. Push your border that way!`, 'info');
          break;
        case 'boonOffered':
          if (e.owner === PLAYER) audio.play('objective');
          break;
        case 'boonChosen':
          if (e.owner !== PLAYER) break;
          audio.play('tierUp');
          this.toast('/assets/icons/people.png', `The ${plural(e.surname)} are now ${BOONS[e.boon].name}: ${BOONS[e.boon].blurb}`, 'good');
          break;
        case 'married': {
          if (e.owner !== PLAYER) break;
          const a = this.world.settlers.get(e.a);
          const b = this.world.settlers.get(e.b);
          audio.play('arrive');
          this.toast('/assets/icons/hut.png', `${a?.name} and ${b?.name} marry and found a new ${e.surname} household, with the gifts of both families`, 'good');
          break;
        }
        case 'season':
          if (e.season === 3) {
            audio.play('warn');
            this.toast('/assets/icons/berries.png', 'Winter has come. Berries sleep and folk eat more, but Fishers still work.', 'warn');
          } else if (e.season === 0) this.toast('/assets/icons/forester.png', `Spring! Another winter survived (${this.world.players[PLAYER].winters}). The bushes wake.`, 'good');
          break;
        case 'winterComing':
          audio.play('warn');
          this.toast('/assets/icons/berries.png', 'Winter is coming. Stock up on food: build Foragers, and Fishers if you can.', 'warn');
          break;
        case 'rankUp':
          if (e.owner !== PLAYER) break;
          audio.play('tierUp');
          this.banner.value = {
            title: `Your camp is now a ${RANK_NAMES[e.rank]}!`,
            sub: e.unlocks.length ? `New: ${e.unlocks.map((t) => BUILDINGS[t].name).join(', ')} · the border grows · a family earns a boon` : 'The border grows · a family earns a boon',
          };
          setTimeout(() => (this.banner.value = null), 5200);
          break;
        case 'valleyEvent':
          if (e.owner === PLAYER) audio.play('arrive');
          break;
        case 'eventResolved': {
          if (e.owner !== PLAYER) break;
          const d = eventDef(e.def);
          this.toast('/assets/icons/scroll.png', `${d?.icon ?? ''} ${e.text}`, 'info');
          break;
        }
        case 'familySettled':
          this.toast('/assets/icons/hut.png', `The ${e.surname} family have a home at last`, 'good');
          break;
        case 'objectiveComplete':
          audio.play('objective');
          this.toast('/assets/icons/scroll.png', e.label, 'good');
          break;
        case 'chapterComplete':
          audio.play('tierUp');
          this.banner.value = { title: `${e.chapter} complete`, sub: e.next ? `Next chapter: ${e.next}` : 'Your settlement thrives' };
          setTimeout(() => (this.banner.value = null), 4200);
          break;
        case 'victory':
          this.victory.value = e.scenario;
          this.save(false);
          break;
      }
    }
  }

  toast(iconUrl: string, text: string, tone: Toast['tone']): void {
    const t: Toast = { id: ++this.toastId, icon: iconUrl, text, tone };
    this.toasts.value = [...this.toasts.value, t].slice(-4);
    setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((x) => x.id !== t.id);
    }, tone === 'big' ? 7000 : 4800);
  }

  // ---- intents ------------------------------------------------------------

  startPlacing(type: BuildingType): void {
    audio.play('click');
    this.mode.value = { kind: 'place', type };
    this.selection.value = null;
    this.ghost.value = null;
    this.view.setGhost(null);
  }

  cancel(): void {
    if (this.mode.value.kind === 'place') {
      this.mode.value = { kind: 'select' };
      this.ghost.value = null;
      this.view.setGhost(null);
    } else this.selection.value = null;
  }

  hover(sx: number, sy: number): void {
    if (this.mode.value.kind === 'place') {
      this.updateGhost(sx, sy);
      return;
    }
    const sid = this.view.settlerAt(sx, sy, 20);
    const bid = sid === null ? this.view.buildingAt(sx, sy) : null;
    this.hovered = sid !== null ? { kind: 'settler', id: sid } : bid !== null ? { kind: 'building', id: bid } : null;
    this.view.renderer.domElement.style.cursor = this.hovered ? 'pointer' : '';
  }

  tap(sx: number, sy: number, touch: boolean, keepPlacing = false): void {
    audio.start();
    const mode = this.mode.value;
    if (mode.kind === 'place') {
      this.touchPlacing.value = touch;
      this.updateGhost(sx, sy);
      if (!touch) this.confirmPlacement(keepPlacing);
      return;
    }
    const sid = this.view.settlerAt(sx, sy, touch ? 34 : 24);
    if (sid !== null) {
      audio.play('click');
      this.selection.value = { kind: 'settler', id: sid };
      return;
    }
    const bid = this.view.buildingAt(sx, sy);
    if (bid !== null) {
      audio.play('click');
      this.selection.value = { kind: 'building', id: bid };
      return;
    }
    this.selection.value = null;
  }

  confirmPlacement(keepPlacing = false): void {
    const g = this.ghost.value;
    if (!g || !g.ok) return;
    this.world.enqueue({ type: 'place', owner: PLAYER, building: g.type, x: g.x, y: g.y });
    if (!keepPlacing) {
      this.mode.value = { kind: 'select' };
      this.ghost.value = null;
      this.view.setGhost(null);
    }
  }

  chooseEvent(eventId: number, option: number): void {
    audio.play('click');
    this.world.enqueue({ type: 'chooseEvent', owner: PLAYER, eventId, option });
  }

  chooseBoon(offerId: number, choice: number): void {
    audio.play('click');
    this.world.enqueue({ type: 'chooseBoon', owner: PLAYER, offerId, choice });
  }

  demolish(id: number): void {
    this.world.enqueue({ type: 'demolish', owner: PLAYER, id });
    this.selection.value = null;
  }

  setSpeed(s: number): void {
    audio.play('click');
    this.speed.value = s;
    this.paused.value = false;
  }

  togglePause(): void {
    this.paused.value = !this.paused.value;
  }

  focusSelection(): void {
    const p = this.selectionPos();
    if (p) this.view.rig.lookAt(p.x, p.z);
  }

  focusSite(id: number): void {
    const p = this.view.sites.position(this.world, id);
    if (p) this.view.rig.lookAt(p.x, p.z);
  }

  focusBuilding(id: number): void {
    const p = this.posOf(id);
    if (p) this.view.rig.lookAt(p.x, p.z);
    this.selection.value = { kind: 'building', id };
  }

  private updateGhost(sx: number, sy: number): void {
    const mode = this.mode.value;
    if (mode.kind !== 'place') return;
    const p = this.view.groundAt(sx, sy);
    if (!p) return;
    const def = BUILDINGS[mode.type];
    const x = Math.round(p.x - def.size / 2);
    const y = Math.round(p.z - def.size / 2);
    const prev = this.ghost.value;
    if (prev && prev.x === x && prev.y === y && prev.type === mode.type) return;
    const check = canPlace(this.world, PLAYER, mode.type, x, y);
    let inRange: number | undefined;
    const job = def.job;
    if (job && job.kind === 'gather') inRange = countInRange(this.world, x, y + def.size, job.node, job.radius);
    else if (job && job.kind === 'plant') inRange = countInRange(this.world, x, y + def.size, 'tree', job.radius);
    this.ghost.value = { type: mode.type, x, y, ok: check.ok, reason: check.reason, inRange };
    this.view.setGhost(this.ghost.value);
  }

  private selectionPos() {
    const sel = this.selection.value;
    if (!sel) return null;
    if (sel.kind === 'settler') return this.world.settlers.has(sel.id) ? (this.view.settlers.positions.get(sel.id) ?? null) : null;
    return this.view.buildings.centre(sel.id);
  }

  private updateSelectionRing(): void {
    const sel = this.selection.value;
    if (sel && sel.kind === 'building' && !this.world.buildings.has(sel.id)) this.selection.value = null;
    const p = this.selectionPos();
    this.view.setSelection(p ?? null, sel?.kind === 'building' ? 1.35 : 0.4);
    const h = this.hovered;
    const same = h && sel && h.kind === sel.kind && h.id === sel.id;
    const hp = h && !same ? (h.kind === 'settler' ? this.view.settlers.positions.get(h.id) : this.view.buildings.centre(h.id)) : null;
    this.view.setHover(hp ?? null, h?.kind === 'building' ? 1.35 : 0.4);
  }

  dispose(): void {
    this.overlay.clear();
  }
}

export function icon(type: BuildingType | string): string {
  return `/assets/icons/${type === 'wagon' ? 'hut' : type}.png`;
}

function countInRange(world: World, cx: number, cy: number, kind: string, r: number): number {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!world.inBounds(x, y)) continue;
      const node = world.nodes.get(world.nodeAt[world.idx(x, y)]);
      if (node && node.kind === kind && (node.amount > 0 || node.growth > 0)) n++;
    }
  return n;
}

