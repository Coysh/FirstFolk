import { canBridge, spanAt, type BridgeCheck, type Span } from './sim/bridges';
import { signal } from '@preact/signals';
import * as THREE from 'three';
import { audio, type Sfx } from './audio/audio';
import { BALANCE, TICK_HZ, TICK_MS } from './sim/balance';
import { seasonOf } from './sim/seasons';
import { canPlace } from './sim/commands';
import { BUILDINGS, DISCOVERIES, SKILLS, type BuildingType, type Good, type Tool } from './sim/defs';
import { DEEDS, deedProblem, deedTargetProblem, outpostSpot, type DeedId } from './sim/deeds';
import { HOUSES, playerMod } from './sim/houses';
import { NO_OWNER, previewInfluence, previewRemoval } from './sim/territory';
import { CONTESTED } from './sim/crown';
import { scoutProblem } from './sim/scouts';
import { defenceOf, hallOf, huscarls, raidProblem, raidStrength } from './sim/warfare';
import { ICON } from './render/overlay';
import { serializeWorld } from './sim/save';
import { objectiveStatus, type ObjectiveStatus } from './sim/scenario';
import { TIER_XP } from './sim/trades';
import type { SimEvent, World } from './sim/world';
import type { Overlay } from './render/overlay';
import type { GameRenderer } from './render/scene';
import { recordDaily, recordDynasty, writeSave, type StoredDynasty } from './settings';
import { ORIGINS, type OriginId } from './sim/origins';
import { OMENS } from './sim/omens';
import { rivalLine, type RivalMoment } from './ui/rivalVoice';
import { newsFor, type News } from './ui/news';

export const PLAYER = 0;

export type Mode = { kind: 'select' } | { kind: 'place'; type: BuildingType } | { kind: 'deed'; seat: number; deed: DeedId } | { kind: 'raid' } | { kind: 'scout' } | { kind: 'bridge' };
export type Selection = { kind: 'building'; id: number } | { kind: 'settler'; id: number } | null;

export interface Toast {
  id: number;
  icon: string;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'big' | 'rival';
}


export interface GhostState {
  type: BuildingType;
  x: number;
  y: number;
  ok: boolean;
  reason?: string;
  /** Resources within the work radius, for placement feedback. */
  inRange?: number;
  /** For border buildings: land it would win (and from the rival), and what it would bring over. */
  claim?: ClaimPreview;
}

export interface ClaimPreview {
  gained: number;
  fromRival: number;
  sites: string[];
}

/** What a raid on a rival post would face, and what burning it would free. */
export interface RaidPreview {
  targetId: number;
  name: string;
  problem: string;
  attack: number;
  defence: number;
  /** Tiles the rival would lose, and landmarks that would slip from their grasp. */
  lost: number;
  sites: string[];
}

/** Where a targeted deed would land, and what it would do. */
export interface DeedPreview {
  x: number;
  y: number;
  r: number;
  problem: string;
  claim?: ClaimPreview;
}

const AUTOSAVE_SECONDS = 45;
const STRIKE_SFX: Record<Tool, Sfx> = { axe: 'chop', pick: 'pick', hammer: 'hammer', saw: 'saw', shovel: 'shovel', basket: 'click', spear: 'click' };

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
  /** The bridge being aimed: the span under the pointer (or the suggested one) and whether it can be built. */
  readonly bridgeGhost = signal<{ span: Span; check: BridgeCheck } | null>(null);
  readonly selection = signal<Selection>(null);
  /** Bumped a few times a second; UI components read the world when it changes. */
  readonly version = signal(0);
  readonly objectives = signal<ObjectiveStatus[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly victory = signal<{ scenario: string; winner: number; byTime: boolean; crowned?: boolean; acclaim?: boolean } | null>(null);
  /** The story card on screen (a beat of the saga, see sim/saga.ts), until it is dismissed or fades. */
  readonly story = signal<{ beat: number } | null>(null);
  private storyTimer: ReturnType<typeof setTimeout> | null = null;
  dismissStory(): void {
    this.story.value = null;
  }
  /** The ledger letter being read (see Hud's Ledger), and whether the first one has opened itself. */
  readonly ledgerOpen = signal<string | null>(null);
  readonly deedPreview = signal<DeedPreview | null>(null);
  readonly raidPreview = signal<RaidPreview | null>(null);
  ledgerTaught = false;
  /** The steading whose card is open in the Valley panel, if any. */
  readonly steadingOpen = signal<number | null>(null);
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
    if (fresh) {
      // One opening banner: the goal, who you face, and the valley's omens.
      const rival = this.world.players[1];
      const crown = this.world.scenario.victory === 'crown';
      const rivalName = rival?.origin && rival.origin !== 'dynasty' ? `${ORIGINS[rival.origin as OriginId].icon} ${ORIGINS[rival.origin as OriginId].name}` : rival ? 'a rival house' : '';
      this.notify({
        channel: 'banner',
        priority: 3,
        icon: '/assets/icons/renown.png',
        text: crown ? 'Keep the Kingstone, win the Crown' : 'Your valley awaits',
        sub: [rival ? `vs ${rivalName}` : '', this.world.omens.map((o) => `${OMENS[o].icon} ${OMENS[o].name}`).join(' · ')].filter(Boolean).join(' · '),
        tone: 'big',
      });
      if (rival) setTimeout(() => this.rivalVoice('greet'), 9000);
    }
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
      this.conduct();
      this.watchRivalMood();
    }
  }

  /** The rival says when its mood turns (see the bot's mood): war when it falls behind, walls when it leads. */
  private rivalMood: 'calm' | 'war' | 'walls' = 'calm';
  private watchRivalMood(): void {
    const me = this.world.players[PLAYER];
    const rival = this.world.players[1];
    if (!rival) return;
    const gap = me.renown - rival.renown;
    const mood = gap >= BALANCE.moodGap ? 'war' : gap <= -BALANCE.moodGap ? 'walls' : 'calm';
    if (mood === this.rivalMood) return;
    this.rivalMood = mood;
    if (mood !== 'calm') {
      this.rivalSpokeAt = -Infinity;
      this.rivalVoice(mood === 'war' ? 'warMood' : 'wallsMood');
    }
  }

  /**
   * The music follows the game: the village theme at work, the long night in winter, banners
   * at the border when the rival is pressing (land or a landmark lost lately, or they lead
   * late on), and the main theme as the Crown finale. The soundscape follows the camera.
   */
  private tenseUntil = 0;
  private saidLead = false;
  private sceneTimer = 0;
  private conduct(): void {
    const w = this.world;
    const me = w.players[PLAYER];
    const rival = w.players[1];
    audio.setMuffled(this.paused.value || this.menuOpen.value);
    if (this.victory.value || w.scenarioState.winner >= 0) return audio.setMood('theme', 1);
    const late = w.tick > 15 * 600;
    const pressed = this.tenseUntil > w.tick || (!!rival && late && rival.renown - me.renown >= 120);
    const intensity = w.tick < 120 * 10 ? 0 : me.rank >= 2 ? 2 : 1;
    // The rival comments on a big lead, once each way, after the middle of the game.
    if (rival && w.tick > 18 * 600 && !this.saidLead) {
      const gap = rival.renown - me.renown;
      if (Math.abs(gap) >= 150) {
        this.saidLead = true;
        this.rivalVoice(gap > 0 ? 'theyLead' : 'youLead');
      }
    }
    if (w.crown && Math.max(...w.crown.progress) * 2 >= BALANCE.crownNeed) audio.setMood('moot', 3);
    else if (pressed) audio.setMood('tension', 2);
    else if (seasonOf(w.tick) === 3) audio.setMood('winter', 1);
    else audio.setMood('village', intensity);
    if ((this.sceneTimer -= 0.2) <= 0) {
      this.sceneTimer = 1;
      audio.setScene({ season: seasonOf(w.tick), ...this.view.listen() });
    }
  }

  /** The dynasty this victory earned (shown on the report). */
  readonly earned = signal<StoredDynasty | null>(null);

  /** Winning remembers your greatest house, to found a future valley. */
  private rememberHouse(): void {
    const w = this.world;
    // The founding house: its banner family's name, its house and its best craft.
    const seat = w.players[PLAYER].seats[0];
    const best = seat && w.families.get(seat.familyId);
    if (!seat || !best) return;
    const crafts = w.players[PLAYER].crafts;
    const craft = SKILLS.reduce((a, k) => (crafts[k] > crafts[a] ? k : a), SKILLS[0]);
    this.earned.value = recordDynasty({
      surname: best.surname,
      house: seat.house,
      skill: crafts[craft] >= TIER_XP[1] ? craft : null,
      renown: w.players[PLAYER].renown,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  /** The rival speaks now and then (at most once every two minutes), in a quiet toast. */
  private rivalSpokeAt = -Infinity;
  private rivalVoice(moment: RivalMoment, vars: Record<string, string> = {}): void {
    if (!this.world.players[1] || this.world.tick - this.rivalSpokeAt < 1200) return;
    this.rivalSpokeAt = this.world.tick;
    const origin = this.world.players[1].origin;
    const house = origin && origin !== 'dynasty' ? `the ${ORIGINS[origin].name}` : 'your rival';
    this.notify({ channel: 'toast', priority: 1, icon: '/assets/icons/scroll.png', text: rivalLine(moment, { house, ...vars }), tone: 'rival' });
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
      // What the player is told is decided in one place (ui/news.ts); here only sounds, floaters,
      // the rival's voice and the music's tension.
      const n = newsFor(this.world, e, PLAYER);
      if (n) this.notify(n);
      const mine = !('owner' in e) || e.owner === PLAYER;
      switch (e.type) {
        case 'buildingComplete': {
          if (e.owner !== PLAYER) {
            if (BUILDINGS[e.buildingType].great) this.rivalVoice('theirWork', { work: BUILDINGS[e.buildingType].name });
            break;
          }
          const p = this.posOf(e.id);
          if (BUILDINGS[e.buildingType].great) {
            audio.stinger('work');
            setTimeout(() => this.rivalVoice('yourWork', { work: BUILDINGS[e.buildingType].name }), 3000);
          } else if (p) audio.play('complete', this.distanceTo(p.x, p.z), this.hearing() * 1.5);
          break;
        }
        case 'buildingPlaced':
          if (mine) audio.play('place');
          break;
        case 'produced': {
          const p = mine ? this.posOf(e.buildingId) : null;
          if (p) this.overlay.floater(`p${e.buildingId}`, p, e.good, e.bonus);
          break;
        }
        case 'delivered': {
          const b = this.world.buildings.get(e.buildingId);
          const p = mine ? this.posOf(e.buildingId) : null;
          if (b?.done && p) {
            this.overlay.floater(`d${e.buildingId}${e.good}`, p, e.good, false);
            audio.play('deliver', this.distanceTo(p.x, p.z), this.hearing());
          }
          break;
        }
        case 'familyApproaching':
        case 'born':
          if (mine) audio.play('arrive');
          break;
        case 'hungry':
        case 'winterComing':
        case 'rivalSighted':
          if (mine) audio.play('warn');
          break;
        case 'discovered':
        case 'rumour':
          if (mine) audio.play('objective');
          break;
        case 'claimed':
          if (mine) audio.stinger('discovery');
          break;
        case 'houseOffered':
        case 'valleyEvent':
          // A letter arrives in the ledger: a soft chime, no interruption.
          if (mine) audio.play('letter');
          break;
        case 'houseSeated':
        case 'craftUp':
        case 'objectiveComplete':
          if (mine) audio.play('tierUp');
          break;
        case 'rankUp':
          if (mine) audio.stinger('rankUp');
          break;
        case 'holdingChanged': {
          const d = DISCOVERIES[e.kind];
          if (e.owner === PLAYER) {
            audio.stinger('landmark');
            if (e.from >= 0) setTimeout(() => this.rivalVoice('youTook', { site: d.name }), 2500);
          } else if (e.from === PLAYER) {
            audio.stinger('loss');
            this.tenseUntil = this.world.tick + 600;
            setTimeout(() => this.rivalVoice('theyTook', { site: d.name }), 2000);
          }
          break;
        }
        case 'landLost':
          if (mine) this.tenseUntil = this.world.tick + 450;
          break;
        case 'renown': {
          if (!mine || e.x < 0 || e.amount < 5) break;
          const y = this.view.groundHeight(e.x + 0.5, e.y + 0.5);
          this.overlay.renownFloater(new THREE.Vector3(e.x + 0.5, y + 2.2, e.y + 0.5), e.amount);
          break;
        }
        case 'deed':
          if (mine) audio.stinger('deed');
          break;
        case 'raidLaunched':
          if (e.defender === PLAYER) {
            audio.stinger('warhorn');
            this.tenseUntil = this.world.tick + 600;
            if (e.owner !== NO_OWNER) setTimeout(() => this.rivalVoice('raid', { building: BUILDINGS[e.buildingType].name }), 2500);
          } else if (e.owner === PLAYER) audio.play('click');
          break;
        case 'clashBegan':
          if (e.defender === PLAYER || e.owner === PLAYER) audio.stinger('clash');
          // Your own assault: the camera follows your huscarls in.
          if (e.owner === PLAYER) this.lookAt(e.x, e.y);
          break;
        case 'clashRally':
          if (e.kind === 'rally') audio.stinger('warhorn');
          break;
        case 'raidResolved':
          if (e.owner === PLAYER) {
            audio.stinger(e.won ? 'clash' : 'loss');
            if (e.won) setTimeout(() => this.rivalVoice('burned', { building: BUILDINGS[e.buildingType].name }), 2500);
          } else if (e.defender === PLAYER) {
            audio.stinger(e.won ? 'loss' : 'clash');
            if (e.won) this.tenseUntil = this.world.tick + 600;
            else if (e.owner !== NO_OWNER) setTimeout(() => this.rivalVoice('repelled', {}), 2500);
          }
          break;
        case 'caravanSent':
          if (e.owner === PLAYER) audio.play('click');
          break;
        case 'caravanArrived':
          if (e.owner === PLAYER) audio.play('deliver');
          break;
        case 'workBegun':
          if (!mine) audio.play('warn');
          break;
        case 'workLost':
          audio.stinger('loss');
          break;
        case 'wantWon':
          audio.stinger(e.owner === PLAYER ? 'landmark' : 'loss');
          setTimeout(() => this.rivalVoice(e.owner === PLAYER ? 'youWon' : 'theyWon'), 2400);
          break;
        case 'steadingAlly':
          if (e.owner === PLAYER) audio.stinger('landmark');
          else if (e.owner >= 0 || e.was === PLAYER) audio.stinger('loss');
          break;
        case 'starfall':
          setTimeout(() => this.rivalVoice('starfall'), 6500);
          audio.stinger('starfall');
          break;
        case 'sagaBeat':
          this.story.value = { beat: e.beat };
          if (this.storyTimer) clearTimeout(this.storyTimer);
          this.storyTimer = setTimeout(() => {
            if (this.story.value?.beat === e.beat) this.story.value = null;
          }, 30000);
          break;
        case 'scoutSpotted':
          if (e.seer === PLAYER) setTimeout(() => this.rivalVoice('scout'), 1500);
          break;
        case 'crownKeeper':
          if (e.keeper >= 0) audio.stinger(e.keeper === PLAYER ? 'landmark' : 'loss');
          else if (e.keeper === CONTESTED) audio.stinger('warhorn');
          setTimeout(() => this.rivalVoice('moot'), 5000);
          break;
        case 'crownQuarter':
          if (e.owner === PLAYER) audio.stinger('moot');
          break;
        case 'victory':
          this.victory.value = { scenario: e.scenario, winner: e.winner, byTime: e.byTime, crowned: !!e.crowned };
          audio.stinger(e.winner === PLAYER ? 'victory' : 'defeat');
          if (e.winner === PLAYER) this.rememberHouse();
          if (this.world.label.startsWith('daily-')) recordDaily({ date: this.world.label.slice(6), won: e.winner === PLAYER, renown: this.world.players[PLAYER].renown, time: Math.floor(this.world.tick / 10) });
          this.save(false);
          break;
      }
    }
  }

  /**
   * The one way news reaches the screen. Banners queue and show one at a time; toasts show at
   * most two at once, the rest wait in a short queue by priority, and quiet news (priority 1) is
   * dropped rather than queued when the screen is busy. Same-key news replaces what's waiting.
   */
  private bannerQueue: News[] = [];
  private toastQueue: News[] = [];
  private bannerUntil = 0;
  notify(n: News): void {
    if (n.channel === 'banner') {
      if (this.bannerQueue.length < 3) this.bannerQueue.push(n);
    } else {
      if (n.key) this.toastQueue = this.toastQueue.filter((q) => q.key !== n.key);
      if (n.priority === 1 && (this.toasts.value.length >= 1 || this.toastQueue.length)) return;
      this.toastQueue.push(n);
      this.toastQueue.sort((a, b) => b.priority - a.priority);
      this.toastQueue.length = Math.min(this.toastQueue.length, 3);
    }
    this.pumpNews();
  }

  private pumpNews(): void {
    const now = performance.now();
    if (!this.banner.value && now >= this.bannerUntil) {
      const b = this.bannerQueue.shift();
      if (b) {
        this.banner.value = { title: b.text, sub: b.sub ?? '' };
        this.bannerUntil = now + 4200;
        setTimeout(() => {
          this.banner.value = null;
          this.pumpNews();
        }, 3800);
      }
    }
    while (this.toasts.value.length < 2 && this.toastQueue.length) {
      const n = this.toastQueue.shift()!;
      this.toast(n.icon, n.sub ? `${n.text} · ${n.sub}` : n.text, n.tone);
    }
  }

  toast(iconUrl: string, text: string, tone: Toast['tone']): void {
    const t: Toast = { id: ++this.toastId, icon: iconUrl, text, tone };
    this.toasts.value = [...this.toasts.value, t].slice(-2);
    setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((x) => x.id !== t.id);
      this.pumpNews();
    }, tone === 'big' ? 5500 : 4200);
  }

  // ---- intents ------------------------------------------------------------

  startPlacing(type: BuildingType): void {
    audio.play('click');
    this.mode.value = { kind: 'place', type };
    this.selection.value = null;
    this.ghost.value = null;
    this.view.setGhost(null);
  }

  /** Bridge mode: aim at water between two banks. With a suggestion (the best bridge), the ghost starts there. */
  startBridging(suggest?: Span | null): void {
    audio.play('click');
    this.mode.value = { kind: 'bridge' };
    this.selection.value = null;
    this.ghost.value = null;
    this.view.setGhost(null);
    this.aimBridge(suggest ?? null);
    if (suggest) this.view.rig.lookAt(suggest.x + 0.5, suggest.y + 0.5);
  }

  private aimBridge(span: Span | null): void {
    if (!span) {
      this.bridgeGhost.value = null;
      this.view.setBridgeGhost(null, false);
      return;
    }
    const check = canBridge(this.world, PLAYER, span);
    this.bridgeGhost.value = { span, check };
    this.view.setBridgeGhost(span, check.ok);
  }

  private updateBridgeGhost(sx: number, sy: number): void {
    const p = this.view.groundAt(sx, sy);
    if (!p) return;
    const span = spanAt(this.world, Math.floor(p.x), Math.floor(p.z));
    const prev = this.bridgeGhost.value?.span;
    if (span && prev && prev.x === span.x && prev.y === span.y && prev.dir === span.dir && prev.len === span.len) return;
    // Pointing at something that cannot be bridged keeps the last good aim, so a touch tap can't lose it.
    if (span || !this.touchPlacing.value) this.aimBridge(span);
  }

  confirmBridge(keep = false): void {
    const g = this.bridgeGhost.value;
    if (!g || !g.check.ok) return;
    this.world.enqueue({ type: 'bridge', owner: PLAYER, ...g.span });
    audio.play('click');
    if (!keep) this.cancel();
  }

  cancel(): void {
    if (this.mode.value.kind === 'bridge') {
      this.mode.value = { kind: 'select' };
      this.bridgeGhost.value = null;
      this.view.setBridgeGhost(null, false);
    } else if (this.mode.value.kind === 'scout') {
      this.mode.value = { kind: 'select' };
      this.view.renderer.domElement.style.cursor = '';
    } else if (this.mode.value.kind === 'raid') {
      this.mode.value = { kind: 'select' };
      this.raidPreview.value = null;
    } else if (this.mode.value.kind === 'deed') {
      this.mode.value = { kind: 'select' };
      this.deedPreview.value = null;
      this.view.showTargetRing(null);
    }
    else if (this.mode.value.kind === 'place') {
      this.mode.value = { kind: 'select' };
      this.ghost.value = null;
      this.view.setGhost(null);
    } else this.selection.value = null;
  }

  hover(sx: number, sy: number): void {
    if (this.mode.value.kind === 'bridge') {
      this.updateBridgeGhost(sx, sy);
      return;
    }
    if (this.mode.value.kind === 'place') {
      this.updateGhost(sx, sy);
      return;
    }
    if (this.mode.value.kind === 'deed') {
      this.updateDeedPreview(sx, sy);
      return;
    }
    if (this.mode.value.kind === 'raid') {
      this.updateRaidPreview(sx, sy);
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
    if (mode.kind === 'bridge') {
      // Mouse: click builds the span under the pointer. Touch: the first tap aims, a tap on the same span builds it.
      const before = this.bridgeGhost.value?.span;
      this.touchPlacing.value = touch;
      this.updateBridgeGhost(sx, sy);
      const now = this.bridgeGhost.value?.span;
      if (!touch || (before && now && before.x === now.x && before.y === now.y && before.dir === now.dir && before.len === now.len)) this.confirmBridge(keepPlacing);
      return;
    }
    if (mode.kind === 'deed') {
      // Touch: the first tap aims (with a preview), the ✓ button confirms. Mouse: click to do it.
      this.deedPreview.value = null;
      this.updateDeedPreview(sx, sy);
      this.touchPlacing.value = touch;
      if (!touch) this.confirmDeed();
      return;
    }
    if (mode.kind === 'scout') {
      const p = this.view.groundAt(sx, sy);
      if (p) this.confirmScout(Math.floor(p.x), Math.floor(p.z));
      return;
    }
    if (mode.kind === 'raid') {
      this.raidPreview.value = null;
      this.updateRaidPreview(sx, sy);
      this.touchPlacing.value = touch;
      if (!touch) this.confirmRaid();
      return;
    }
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

  chooseHouse(offerId: number, choice: number): void {
    audio.play('click');
    this.world.enqueue({ type: 'chooseHouse', owner: PLAYER, offerId, choice });
  }

  /** A Great House's power: instant ones happen now, targeted ones wait for a tap on the map. */
  useDeed(seatIndex: number): void {
    const seat = this.world.players[PLAYER].seats[seatIndex];
    if (!seat) return;
    const id = HOUSES[seat.house].power;
    const problem = deedProblem(this.world, PLAYER, seatIndex);
    if (problem) {
      // Say why, rather than doing nothing.
      audio.play('warn');
      this.toast('/assets/icons/scroll.png', `${DEEDS[id].icon} ${DEEDS[id].name}: ${problem}`, 'warn');
      return;
    }
    audio.play('click');
    if (!DEEDS[id].target) {
      this.world.enqueue({ type: 'deed', owner: PLAYER, seat: seatIndex, x: 0, y: 0 });
      return;
    }
    this.selection.value = null;
    this.mode.value = { kind: 'deed', seat: seatIndex, deed: id };
  }

  /** Pick a rival post for the huscarls: the map waits for a tap on one. */
  /** Pick a place for the scout to go (T), then tap the map. */
  startScout(): void {
    const w = this.world;
    audio.play('click');
    const hall = [...w.buildings.values()].find((b) => b.owner === PLAYER && b.type === 'wagon');
    const problem = !hall ? 'No hall to send a scout from' : w.scouts.some((s) => s.owner === PLAYER) ? 'Your scout is still out' : w.tick < w.players[PLAYER].scoutReady ? `Your scout is resting (${Math.ceil((w.players[PLAYER].scoutReady - w.tick) / TICK_HZ)}s)` : '';
    if (problem) {
      audio.play('warn');
      this.toast(ICON.shield, problem, 'warn');
      return;
    }
    this.selection.value = null;
    this.mode.value = { kind: 'scout' };
    this.view.renderer.domElement.style.cursor = 'crosshair';
  }

  confirmScout(x: number, y: number): void {
    const problem = scoutProblem(this.world, PLAYER, x, y);
    if (problem) {
      audio.play('warn');
      this.toast(ICON.shield, problem, 'warn');
      return;
    }
    this.world.enqueue({ type: 'scout', owner: PLAYER, x, y });
    audio.play('click');
    this.cancel();
  }

  /** Call the folk to a besieged post (or, if your huscarls are the besiegers, press the attack). */
  rally(): void {
    const w = this.world;
    const band = w.warbands.find((b) => b.phase === 'clash' && b.clash && (b.owner === PLAYER ? !b.clash.surged : !b.clash.rallied && w.buildings.get(b.targetId)?.owner === PLAYER));
    if (!band) return;
    if (band.owner !== PLAYER && w.tick < w.players[PLAYER].rallyReady) {
      audio.play('warn');
      this.toast(ICON.shield, `The folk are catching their breath (${Math.ceil((w.players[PLAYER].rallyReady - w.tick) / TICK_HZ)}s)`, 'warn');
      return;
    }
    w.enqueue({ type: 'rally', owner: PLAYER });
    audio.stinger('warhorn');
  }

  startRaid(): void {
    audio.play('click');
    const problem = raidProblem(this.world, PLAYER, -1);
    if (problem && !problem.startsWith('Pick')) {
      audio.play('warn');
      this.toast(ICON.shield, problem, 'warn');
      return;
    }
    this.selection.value = null;
    this.raidPreview.value = null;
    this.mode.value = { kind: 'raid' };
  }

  confirmRaid(): void {
    const pv = this.raidPreview.value;
    if (this.mode.value.kind !== 'raid' || !pv) return;
    if (pv.problem) {
      audio.play('warn');
      this.toast(ICON.shield, pv.problem, 'warn');
      return;
    }
    this.world.enqueue({ type: 'raid', owner: PLAYER, targetId: pv.targetId });
    this.mode.value = { kind: 'select' };
    this.raidPreview.value = null;
  }

  /** Hovering a rival post while choosing a raid: the odds, and what it would free. */
  private updateRaidPreview(sx: number, sy: number): void {
    const id = this.view.buildingAt(sx, sy);
    const b = id === null ? undefined : this.world.buildings.get(id);
    if (!b) {
      this.raidPreview.value = null;
      return;
    }
    if (this.raidPreview.value?.targetId === b.id) return;
    const problem = raidProblem(this.world, PLAYER, b.id);
    const attack = raidStrength(this.world, PLAYER, huscarls(this.world, hallOf(this.world, PLAYER)));
    const pv = problem ? null : previewRemoval(this.world, b.id, PLAYER);
    this.raidPreview.value = {
      targetId: b.id,
      name: BUILDINGS[b.type].name,
      problem,
      attack,
      defence: defenceOf(this.world, b),
      lost: pv?.lost ?? 0,
      sites: pv?.sites.map((s) => `${DISCOVERIES[s.kind].icon} ${DISCOVERIES[s.kind].name}`) ?? [],
    };
  }

  setAutoHomes(on: boolean): void {
    audio.play('click');
    this.world.enqueue({ type: 'setAutoHomes', owner: PLAYER, on });
  }

  /** Send a cart to a steading: what its Want asks for, or a gift of what the stores hold most of. */
  sendCaravan(siteId: number, good: Good, n: number): void {
    this.world.enqueue({ type: 'caravan', owner: PLAYER, siteId, good, n });
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

  lookAt(x: number, y: number): void {
    this.view.rig.lookAt(x + 0.5, y + 0.5);
  }

  focusBuilding(id: number): void {
    const p = this.posOf(id);
    if (p) this.view.rig.lookAt(p.x, p.z);
    this.selection.value = { kind: 'building', id };
  }

  confirmDeed(): void {
    const mode = this.mode.value;
    const pv = this.deedPreview.value;
    if (mode.kind !== 'deed' || !pv) return;
    if (pv.problem) {
      audio.play('warn');
      this.toast('/assets/icons/scroll.png', pv.problem, 'warn');
      return;
    }
    this.world.enqueue({ type: 'deed', owner: PLAYER, seat: mode.seat, x: pv.x, y: pv.y });
    this.mode.value = { kind: 'select' };
    this.deedPreview.value = null;
    this.view.showTargetRing(null);
  }

  /** Aiming a Festival or an Expedition: show the ring it would cover and the land it would win. */
  private updateDeedPreview(sx: number, sy: number): void {
    const mode = this.mode.value;
    const p = this.view.groundAt(sx, sy);
    if (mode.kind !== 'deed' || !p) return;
    const x = Math.floor(p.x);
    const y = Math.floor(p.z);
    const prev = this.deedPreview.value;
    if (prev && prev.x === x && prev.y === y) return;
    const problem = deedTargetProblem(this.world, PLAYER, mode.deed, x, y);
    let r = mode.deed === 'shieldwall' && !problem ? BALANCE.shieldWall[0] : 0;
    let claim: ClaimPreview | undefined;
    if (!problem && (mode.deed === 'festival' || mode.deed === 'expedition')) {
      const src =
        mode.deed === 'festival'
          ? { owner: PLAYER, x, y, r: 12, p: 150 }
          : { owner: PLAYER, ...(outpostSpot(this.world, PLAYER, x, y) ?? { x, y }), r: (BUILDINGS.outpost.claim ?? 7) + playerMod(this.world, PLAYER, 'claim'), p: BUILDINGS.outpost.power ?? 70 };
      if (mode.deed === 'expedition') {
        src.x += 1;
        src.y += 1;
      }
      r = src.r;
      claim = toPreview(previewInfluence(this.world, src));
    }
    this.deedPreview.value = { x, y, r, problem, claim };
    this.view.showTargetRing(r && !problem ? { x: x + 0.5, z: y + 0.5, r } : null);
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
    // Border buildings: preview the land and landmarks they would win.
    let claim: ClaimPreview | undefined;
    if (def.claim && check.ok) {
      const c = Math.floor(def.size / 2);
      claim = toPreview(previewInfluence(this.world, { owner: PLAYER, x: x + c, y: y + c, r: def.claim, p: def.power ?? 60 }));
    }
    this.ghost.value = { type: mode.type, x, y, ok: check.ok, reason: check.reason, inRange, claim };
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

function toPreview(p: ReturnType<typeof previewInfluence>): ClaimPreview {
  return { gained: p.gained, fromRival: p.fromRival, sites: p.sites.map((s) => `${DISCOVERIES[s.kind].icon} ${DISCOVERIES[s.kind].name}`) };
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

