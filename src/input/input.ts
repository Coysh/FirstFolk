import { bestBridge } from '../sim/bridges';
import { hallOf } from '../sim/warfare';
import { BUILD_MENU } from '../sim/defs';
import type { Game } from '../game';
import { toggleMute } from '../settings';

/** Build hotkeys in shelf order. */
export const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
/** House power hotkeys, in seat order. */
export const DEED_KEYS = ['z', 'x', 'c', 'v'];

interface PointerInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  button: number;
  type: string;
}

const DRAG_THRESHOLD = 7;

/**
 * Unified mouse / touch / keyboard handling.
 * Mouse: drag pans, right-drag rotates, wheel zooms, click selects/places.
 * Touch: one finger pans, pinch zooms, twist rotates, tap selects/places.
 */
export class Input {
  private pointers = new Map<number, PointerInfo>();
  private dragging = false;
  private gesture: { dist: number; angle: number; mx: number; my: number } | null = null;
  private keys = new Set<string>();

  constructor(private el: HTMLElement, private getGame: () => Game | null) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.keys.clear();
    });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private local(e: PointerEvent | WheelEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private get game(): Game {
    return this.getGame()!;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.getGame()) return;
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, { ...p, startX: p.x, startY: p.y, startTime: performance.now(), button: e.button, type: e.pointerType });
    if (this.pointers.size === 2) {
      this.gesture = this.twoFinger();
      this.dragging = true;
    }
  };

  private twoFinger() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private onMove = (e: PointerEvent) => {
    if (!this.getGame()) return;
    const p = this.local(e);
    const info = this.pointers.get(e.pointerId);
    if (!info) {
      if (e.pointerType === 'mouse') this.game.hover(p.x, p.y);
      return;
    }
    const dx = p.x - info.x;
    const dy = p.y - info.y;
    info.x = p.x;
    info.y = p.y;
    const rig = this.game.view.rig;

    if (this.pointers.size >= 2 && this.gesture) {
      const g = this.twoFinger();
      if (g.dist > 0 && this.gesture.dist > 0) rig.zoom(this.gesture.dist / g.dist);
      let da = g.angle - this.gesture.angle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      rig.rotate(-da, true);
      this.panByPixels(g.mx - this.gesture.mx, g.my - this.gesture.my);
      this.gesture = g;
      return;
    }

    if (!this.dragging && Math.hypot(p.x - info.startX, p.y - info.startY) > DRAG_THRESHOLD) this.dragging = true;
    if (!this.dragging) {
      if (info.type === 'mouse') this.game.hover(p.x, p.y);
      return;
    }
    if (info.type === 'mouse' && (info.button === 2 || e.shiftKey && info.button === 1)) rig.rotate(-dx * 0.008, true);
    else this.panByPixels(dx, dy);
    if (info.type === 'mouse') this.game.hover(p.x, p.y);
  };

  private panByPixels(dx: number, dy: number) {
    const rig = this.game.view.rig;
    const upp = rig.unitsPerPixel(this.el.clientHeight);
    rig.panImmediate(-dx * upp, (dy * upp) / Math.sin(rig.pitch));
  }

  private onUp = (e: PointerEvent) => {
    if (!this.getGame()) return;
    const info = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    if (!info) return;
    const wasDrag = this.dragging;
    if (this.pointers.size === 0) this.dragging = false;
    if (wasDrag || this.pointers.size > 0) return;
    if (info.type === 'mouse' && info.button !== 0) return;
    if (performance.now() - info.startTime > 600) return;
    const p = this.local(e);
    this.game.tap(p.x, p.y, info.type !== 'mouse', e.shiftKey);
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    if (this.pointers.size === 0) this.dragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.getGame()) return;
    this.game.view.rig.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement || !this.getGame()) return;
    if (this.game.menuOpen.value) {
      if (k === 'escape') this.game.menuOpen.value = false;
      return;
    }
    const rig = this.game.view.rig;
    if (k === 'q') rig.snapRotate(-1);
    else if (k === 'e') rig.snapRotate(1);
    else if (k === '+' || k === '=') rig.zoom(0.8);
    else if (k === '-' || k === '_') rig.zoom(1.25);
    else if (k === 'escape') {
      if (this.game.mode.value.kind !== 'select' || this.game.selection.value || this.game.marketOpen.value) {
        this.game.marketOpen.value = false;
        this.game.cancel();
      }
      else this.game.menuOpen.value = true;
    }
    else if (k === ' ') {
      e.preventDefault();
      this.game.togglePause();
    } else if (HOTKEYS.includes(k) && HOTKEYS.indexOf(k) < BUILD_MENU.length) {
      const type = BUILD_MENU[HOTKEYS.indexOf(k)];
      if (this.game.world.isUnlocked(0, type)) this.game.startPlacing(type);
    }
    else if (k === 'b' && this.game.world.players[0].rank >= 1) this.game.startBridging(bestBridge(this.game.world, 0)?.span);
    else if (k === 'f') this.game.focusSelection();
    else if (k === 'm') toggleMute();
    else if (k === 'r' && hallOf(this.game.world, 0)) this.game.startRaid();
    else if (DEED_KEYS.includes(k)) {
      if (this.game.world.players[0].seats[DEED_KEYS.indexOf(k)]) this.game.useDeed(DEED_KEYS.indexOf(k));
    }
    else if (k === 'delete' || k === 'backspace') {
      const sel = this.game.selection.value;
      if (sel?.kind === 'building') this.game.demolish(sel.id);
    } else this.keys.add(k);
  };

  /** Continuous keyboard panning; call once per frame. */
  update(dt: number): void {
    if (!this.getGame()) return;
    const rig = this.game.view.rig;
    const speed = rig.distance * 1.1 * dt;
    let r = 0;
    let f = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) r -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) r += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) f += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) f -= 1;
    if (r || f) rig.pan(r * speed, f * speed);
  }
}
