import { signal } from '@preact/signals';
import type * as THREE from 'three';
import { audio } from './audio/audio';
import { Game } from './game';
import { Input } from './input/input';
import { Overlay } from './render/overlay';
import { GameRenderer, createRenderer, nextFrame } from './render/scene';
import { OpeningBot } from './sim/ai/openingBot';
import { TICK_MS } from './sim/balance';
import type { Difficulty } from './sim/rules';
import { deserializeWorld, type SaveData } from './sim/save';
import { World } from './sim/world';
import { rollOmens } from './sim/omens';
import type { OriginId } from './sim/origins';
import { readSave, settings } from './settings';

export type Screen = 'title' | 'loading' | 'game';

/** Top-level flow: animated title scene → loading (real progress) → game, sharing one WebGL context. */
export class Shell {
  readonly screen = signal<Screen>('title');
  readonly loading = signal({ fraction: 0, label: '' });
  readonly menuReady = signal(false);
  readonly error = signal<string | null>(null);
  game: Game | null = null;

  private renderer: THREE.WebGLRenderer;
  private menuView: GameRenderer | null = null;
  private menuWorld: World | null = null;
  private menuBot: OpeningBot | null = null;
  private menuAcc = 0;
  private overlay: Overlay;
  private input: Input;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement, overlayParent: HTMLElement) {
    this.renderer = createRenderer(canvas);
    this.overlay = new Overlay(overlayParent);
    this.input = new Input(canvas, () => (this.screen.value === 'game' ? this.game : null));
    window.addEventListener('resize', () => {
      this.menuView?.resize();
      this.game?.view.resize();
    });
    // Save when the tab is hidden or closed, so Continue is always up to date.
    const persist = () => {
      if (this.screen.value === 'game') this.game?.save(false);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        persist();
        audio.suspend();
      } else audio.resume();
    });
    window.addEventListener('pagehide', persist);
    settings.subscribe((s) => {
      audio.setVolumes(s);
      this.menuView?.applyQuality(s.quality);
      this.game?.view.applyQuality(s.quality);
      this.overlay.visible = true;
    });
  }

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame((now) => {
      this.last = now;
      requestAnimationFrame(loop);
    });
    void this.buildMenuScene();
  }

  private frame(dt: number): void {
    if (this.screen.value === 'game' && this.game) {
      this.input.update(dt);
      this.game.frame(dt);
    } else if (this.screen.value === 'title' && this.menuView && this.menuWorld) {
      // A living village behind the menu: the scripted bot keeps building.
      this.menuAcc += dt * 1000;
      while (this.menuAcc >= TICK_MS) {
        this.menuAcc -= TICK_MS;
        this.menuBot!.update(this.menuWorld);
        this.menuView.beforeTick();
        this.menuWorld.step();
      }
      this.menuView.handleEvents(this.menuWorld.drainEvents());
      this.menuView.render(this.menuAcc / TICK_MS, dt);
    }
  }

  /** Pre-simulate a few minutes of a settlement so the title shows a lived-in village. */
  private async buildMenuScene(): Promise<void> {
    await nextFrame();
    const world = new World({ seed: 41, difficulty: 'relaxed' });
    const bot = new OpeningBot();
    for (let i = 0; i < 4200; i++) {
      bot.update(world);
      world.step();
      if (i % 300 === 0) await nextFrame();
    }
    world.drainEvents();
    const view = new GameRenderer(this.renderer, this.canvas, world, settings.value.quality);
    // Yield between build steps so the title menu stays responsive while the scene assembles.
    await view.build(() => nextFrame());
    view.cinematic = true;
    const rig = view.rig;
    rig.goalDistance = rig.distance = 24;
    rig.pitch = 0.42;
    rig.yaw = rig.goalYaw = 0.6;
    const t = rig.target;
    rig.lookAt(t.x + 3, t.z - 2, true);
    if (this.screen.value !== 'title') {
      view.dispose();
      return;
    }
    this.menuWorld = world;
    this.menuBot = bot;
    this.menuView = view;
    this.menuReady.value = true;
  }

  private disposeMenu(): void {
    this.menuView?.dispose();
    this.menuView = null;
    this.menuWorld = null;
    this.menuBot = null;
    this.menuReady.value = false;
  }

  /** A new valley: the omens come from the seed, the origin is the player's opener. */
  async newGame(seed: number, difficulty: Difficulty, rival = true, origin?: OriginId, label = ''): Promise<void> {
    await this.launch(async () => new World({ seed, difficulty, scenario: rival ? 'landfall' : 'peaceful', origin, omens: rollOmens(seed), label }), true);
  }

  async continueGame(): Promise<void> {
    const data = readSave();
    if (!data) {
      this.error.value = 'No saved game was found.';
      return;
    }
    await this.launch(async () => deserializeWorld(data as SaveData), false);
  }

  private async launch(makeWorld: () => Promise<World>, fresh: boolean): Promise<void> {
    audio.start();
    audio.play('click');
    this.error.value = null;
    this.screen.value = 'loading';
    const report = async (fraction: number, label: string) => {
      this.loading.value = { fraction, label };
      await nextFrame();
      await nextFrame();
    };
    try {
      await report(0.02, fresh ? 'Charting a new valley' : 'Unrolling your saved game');
      this.disposeMenu();
      const world = await makeWorld();
      await report(0.15, fresh ? 'Charting a new valley' : 'Unrolling your saved game');
      if (this.game) {
        this.game.view.dispose();
        this.game.dispose();
        this.game = null;
      }
      const view = new GameRenderer(this.renderer, this.canvas, world, settings.value.quality);
      await view.build((f, label) => report(0.15 + f * 0.83, label));
      this.game = new Game(world, view, this.overlay);
      await report(1, 'Ready');
      this.screen.value = 'game';
      this.game.begin(fresh);
    } catch (e) {
      console.error(e);
      this.error.value = (e as Error).message;
      this.screen.value = 'title';
      void this.buildMenuScene();
    }
  }

  quitToTitle(): void {
    this.game?.save(false);
    this.game?.view.dispose();
    this.game?.dispose();
    this.game = null;
    this.screen.value = 'title';
    void this.buildMenuScene();
  }
}
