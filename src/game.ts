import { signal } from '@preact/signals';
import * as THREE from 'three';
import { audio, type Sfx } from './audio/audio';
import { BALANCE, TICK_MS } from './sim/balance';
import { seasonOf } from './sim/seasons';
import { canPlace } from './sim/commands';
import { BUILDINGS, DISCOVERIES, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good, type Tool } from './sim/defs';
import { DEEDS, bestCraft, council, deedOf, deedPower, prestige, deedTargetProblem, outpostSpot, type DeedId } from './sim/deeds';
import { previewInfluence } from './sim/territory';
import { serializeWorld } from './sim/save';
import { BOONS } from './sim/boons';
import { eventDef } from './sim/events';
import { plural } from './sim/population';
import { objectiveStatus, type ObjectiveStatus } from './sim/scenario';
import { TIER_XP, TRADES, tradeTitle } from './sim/trades';
import type { SimEvent, World } from './sim/world';
import type { Overlay } from './render/overlay';
import type { GameRenderer } from './render/scene';
import { recordDaily, recordDynasty, writeSave, type StoredDynasty } from './settings';
import { ORIGINS, type OriginId } from './sim/origins';
import { OMENS } from './sim/omens';
import { challengeDef } from './sim/challenges';
import { rivalLine, type RivalMoment } from './ui/rivalVoice';

export const PLAYER = 0;

export type Mode = { kind: 'select' } | { kind: 'place'; type: BuildingType } | { kind: 'deed'; familyId: number; deed: DeedId };
export type Selection = { kind: 'building'; id: number } | { kind: 'settler'; id: number } | null;

export interface Toast {
  id: number;
  icon: string;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'big' | 'rival';
}

/** Routine news (births, sales, finished huts) is throttled so the important news stands out. */
const LOW_NEWS_GAP_MS = 7000;

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

/** Where a targeted deed would land, and what it would do. */
export interface DeedPreview {
  x: number;
  y: number;
  r: number;
  problem: string;
  claim?: ClaimPreview;
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
  readonly victory = signal<{ scenario: string; winner: number; byTime: boolean; acclaim?: boolean } | null>(null);
  /** The ledger letter being read (see Hud's Ledger), and whether the first one has opened itself. */
  readonly ledgerOpen = signal<string | null>(null);
  readonly deedPreview = signal<DeedPreview | null>(null);
  ledgerTaught = false;
  /** The Market Day popover is open. */
  readonly marketOpen = signal(false);
  readonly banner = signal<{ title: string; sub: string } | null>(null);
  /** True when the last placement interaction came from touch (shows a confirm button). */
  readonly touchPlacing = signal(false);
  readonly lastSaved = signal<number | null>(null);

  private acc = 0;
  private uiTimer = 0;
  private autosaveTimer = AUTOSAVE_SECONDS;
  private toastId = 0;
  private hovered: { kind: 'building' | 'settler'; id: number } | null = null;
  private landLostCooldown = 0;

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
      this.toast('/assets/icons/hut.png', 'Your family has arrived in the valley. Build a Woodcutter near the trees!', 'info');
      const rival = this.world.players[1];
      if (rival?.origin) setTimeout(() => this.toast('/assets/icons/scroll.png', `Across the valley a rival house has settled: ${ORIGINS[rival.origin as OriginId].icon} ${ORIGINS[rival.origin as OriginId].name}.`, 'warn'), 2500);
      if (rival) setTimeout(() => this.rivalVoice('greet'), 9000);
      if (this.world.omens.length) setTimeout(() => this.toast('/assets/icons/scroll.png', `Omens for this valley: ${this.world.omens.map((o) => `${OMENS[o].icon} ${OMENS[o].name}`).join(', ')}.`, 'info'), 5000);
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
      this.watchCouncil();
      this.conduct();
    }
  }

  /**
   * The music follows the game: the village theme at work, the long night in winter, banners
   * at the border when the rival is pressing (land or a landmark lost lately, or they lead
   * late on), and the main theme as the Moot finale. The soundscape follows the camera.
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
    if (w.scenario.timeLimit && w.tick >= BALANCE.mootAt) audio.setMood('moot', 3);
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
    const fams = [...w.families.values()].filter((f) => f.owner === PLAYER);
    if (!fams.length) return;
    const best = fams.reduce((a, f) => (prestige(w, f) > prestige(w, a) ? f : a));
    const craft = bestCraft(best);
    this.earned.value = recordDynasty({
      surname: best.surname,
      boons: best.boons.slice(0, 2),
      skill: best.skills[craft] >= TIER_XP[1] ? craft : null,
      renown: w.players[PLAYER].renown,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  /** The rival's house and its head, for their messages. */
  private rivalVoice(moment: RivalMoment, vars: Record<string, string> = {}): void {
    const fam = [...this.world.families.values()].find((f) => f.owner === 1);
    const head = [...this.world.settlers.values()].find((s) => s.owner === 1 && !s.child);
    if (!fam) return;
    const house = `the ${plural(fam.surname)}`;
    this.toast('/assets/icons/scroll.png', `${head?.name ?? 'The rival'} of ${house}: ${rivalLine(moment, { house, ...vars })}`, 'rival');
  }

  /** A new deed reaching the council is news (families swapping seats is not). */
  private seated: DeedId[] | null = null;
  private watchCouncil(): void {
    const seats = council(this.world, PLAYER);
    const now = seats.map((f) => deedOf(f)!);
    if (this.seated)
      for (const fam of seats) {
        const id = deedOf(fam)!;
        if (this.seated.includes(id)) continue;
        audio.play('objective');
        this.toast('/assets/icons/people.png', `The ${plural(fam.surname)} rise to the Great Houses: ${DEEDS[id].icon} ${DEEDS[id].name} is yours to call.`, 'good');
      }
    this.seated = now;
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
      // Only news about the rival that we choose to share gets through.
      if ('owner' in e && e.owner !== PLAYER && !RIVAL_NEWS.has(e.type) && !(e.type === 'holdingChanged' && e.from === PLAYER) && !(e.type === 'buildingComplete' && BUILDINGS[e.buildingType].great)) continue;
      switch (e.type) {
        case 'buildingComplete': {
          const p = this.posOf(e.id);
          if (e.owner !== PLAYER) {
            // Only a rival's Great Work gets this far: they boast.
            this.toast(icon(e.buildingType), `Your rival has finished ${BUILDINGS[e.buildingType].name}.`, 'warn');
            this.rivalVoice('theirWork', { work: BUILDINGS[e.buildingType].name });
            break;
          }
          if (BUILDINGS[e.buildingType].great) {
            audio.stinger('work');
            setTimeout(() => this.rivalVoice('yourWork', { work: BUILDINGS[e.buildingType].name }), 3000);
          }
          else if (p) audio.play('complete', this.distanceTo(p.x, p.z), this.hearing() * 1.5);
          if (e.buildingType !== 'wagon') (BUILDINGS[e.buildingType].great || e.buildingType === 'watchtower' ? this.toast.bind(this) : this.news.bind(this))(icon(e.buildingType), `${BUILDINGS[e.buildingType].name} finished`, 'good');
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
          this.news('/assets/icons/people.png', `The ${e.surname} family (${e.size}) are settling in. They know a little ${TRADES[e.skill].name.toLowerCase()}.`, 'good');
          break;
        case 'cameOfAge':
          this.news('/assets/icons/people.png', `${e.name} ${e.surname} has come of age and learned from the family`);
          break;
        case 'born':
          audio.play('arrive');
          this.news('/assets/icons/people.png', `${e.name} is born to the ${e.surname} family`, 'good');
          break;
        case 'tierUp': {
          const s = this.world.settlers.get(e.settlerId);
          const fam = s && this.world.families.get(s.familyId);
          const trade = TRADES[e.skill];
          const text = `${s?.name} ${fam?.surname ?? ''} is now a ${tradeTitle(e.skill, e.tier)}! ${trade.perks[e.tier]}`;
          const at = icon(this.world.buildings.get(e.buildingId)?.type ?? 'woodcutter');
          // Every tier-up is routine news; a family's first Master gets its own fanfare below.
          this.news(at, text, 'good');
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
          this.news('/assets/icons/berries.png', 'Bellies are full again', 'good');
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
          audio.stinger('discovery');
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
          // A letter arrives in the ledger: a soft chime, no interruption.
          if (e.owner === PLAYER) audio.play('letter');
          break;
        case 'boonChosen':
          if (e.owner !== PLAYER) break;
          audio.play('tierUp');
          this.news('/assets/icons/people.png', `The ${plural(e.surname)} are now ${BOONS[e.boon].name}: ${BOONS[e.boon].blurb}`, 'good');
          break;
        case 'married': {
          if (e.owner !== PLAYER) break;
          const a = this.world.settlers.get(e.a);
          const b = this.world.settlers.get(e.b);
          audio.play('arrive');
          this.news('/assets/icons/hut.png', `${a?.name} and ${b?.name} marry and found a new ${e.surname} household, with the gifts of both families`, 'good');
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
        case 'rivalSighted':
          audio.play('warn');
          this.toast('/assets/icons/lookout.png', 'Your scouts have sighted the rival settlement’s border! Race them for the valley’s prizes.', 'warn');
          break;
        case 'rankUp':
          if (e.owner !== PLAYER) {
            this.toast('/assets/icons/scroll.png', `Word arrives: the rival settlement is now a ${RANK_NAMES[e.rank]}.`, 'warn');
            break;
          }
          audio.stinger('rankUp');
          this.banner.value = {
            title: `Your camp is now a ${RANK_NAMES[e.rank]}!`,
            sub: e.unlocks.length ? `New: ${e.unlocks.map((t) => BUILDINGS[t].name).join(', ')} · the border grows · a family earns a boon` : 'The border grows · a family earns a boon',
          };
          setTimeout(() => (this.banner.value = null), 5200);
          break;
        case 'valleyEvent':
          if (e.owner === PLAYER) audio.play('letter');
          break;
        case 'eventResolved': {
          if (e.owner !== PLAYER) break;
          const d = eventDef(e.def);
          this.toast('/assets/icons/scroll.png', `${d?.icon ?? ''} ${e.text}`, 'info');
          break;
        }
        case 'familySettled':
          this.news('/assets/icons/hut.png', `The ${e.surname} family have a home at last`, 'good');
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
        case 'holdingChanged': {
          const d = DISCOVERIES[e.kind];
          if (e.owner === PLAYER) {
            audio.stinger('landmark');
            this.banner.value = { title: `${d.icon} ${d.name} is yours!`, sub: e.from >= 0 ? `Taken from your rival: +${d.renown} renown a minute while you hold it` : `+${d.renown} renown a minute while you hold it` };
            setTimeout(() => (this.banner.value = null), 3800);
            if (e.from >= 0) setTimeout(() => this.rivalVoice('youTook', { site: d.name }), 2500);
          } else if (e.from === PLAYER) {
            audio.stinger('loss');
            this.tenseUntil = this.world.tick + 600;
            this.toast('/assets/icons/lookout.png', `Your rival’s border has swallowed the ${d.name}! Push back with Watchtowers or a Festival.`, 'warn');
            setTimeout(() => this.rivalVoice('theyTook', { site: d.name }), 2000);
          }
          break;
        }
        case 'landLost':
          this.tenseUntil = this.world.tick + 450;
          if (this.landLostCooldown > this.world.tick) break;
          this.landLostCooldown = this.world.tick + 300;
          this.toast('/assets/icons/lookout.png', `Your rival’s influence is pushing into your land (${e.tiles} tiles lost).`, 'warn');
          break;
        case 'renown': {
          if (e.x < 0 || e.amount < 5) break;
          const y = this.view.groundHeight(e.x + 0.5, e.y + 0.5);
          this.overlay.renownFloater(new THREE.Vector3(e.x + 0.5, y + 2.2, e.y + 0.5), e.amount);
          break;
        }
        case 'deed': {
          const d = DEEDS[e.deed];
          if (e.owner !== PLAYER) {
            if (e.deed === 'festival' || e.deed === 'expedition') this.toast('/assets/icons/scroll.png', `Your rival’s ${plural(e.surname)} ${e.deed === 'festival' ? 'hold a festival near your border' : 'raise an outpost in the wilds'}.`, 'warn');
            break;
          }
          audio.stinger('deed');
          this.toast('/assets/icons/people.png', `${d.icon} ${d.name}! ${e.text}`, 'big');
          break;
        }
        case 'sold':
          audio.play('deliver');
          this.news(`/assets/icons/${e.good}.png`, `Market Day: ${e.n} ${GOOD_INFO[e.good].name.toLowerCase()} sold for +${e.renown} renown`, 'good');
          break;
        case 'workBegun':
          if (e.owner === PLAYER) break;
          audio.play('warn');
          this.toast(icon(e.buildingType), `Your rival has begun ${BUILDINGS[e.buildingType].name}! Only the first to finish it gets it.`, 'warn');
          break;
        case 'workLost':
          audio.stinger('loss');
          this.toast(icon(e.buildingType), `Your rival finished ${BUILDINGS[e.buildingType].name} first. Your site is abandoned; half its materials came home.`, 'warn');
          break;
        case 'firstMaster':
          audio.play('tierUp');
          this.toast('/assets/icons/renown.png', `${e.name} is the first ${tradeTitle(e.skill, 2)} of the ${e.surname} family! +10 renown, and their deed grows stronger.`, 'big');
          break;
        case 'elder':
          this.news('/assets/icons/people.png', `${e.name} ${e.surname} is an elder now: no more hard work, but they teach the family their craft.`);
          break;
        case 'died':
          if (e.legend) {
            audio.play('tierUp');
            this.banner.value = { title: `${e.name} ${e.surname} has died`, sub: `A Master to the last, aged ${e.age}. Their legend lives on: ${SKILLS.includes(e.legend) ? TRADES[e.legend].name.toLowerCase() : ''} is faster for all, and +15 renown` };
            setTimeout(() => (this.banner.value = null), 5200);
          } else this.news('/assets/icons/people.png', `${e.name} ${e.surname} has died, aged ${e.age}. The family mourns.`);
          break;
        case 'challenge': {
          const def = challengeDef(e.def)!;
          audio.stinger('moot');
          this.toast('/assets/icons/renown.png', `${def.icon} ${def.title}! ${def.text} +${def.prize}★ to the winner.`, 'big');
          break;
        }
        case 'challengeWon': {
          const def = challengeDef(e.def)!;
          if (e.winner === PLAYER) {
            audio.stinger('landmark');
            this.banner.value = { title: `${def.icon} You won ${def.title}!`, sub: `+${e.prize} renown. The valley talks of nothing else.` };
            setTimeout(() => (this.banner.value = null), 3600);
            setTimeout(() => this.rivalVoice('youWon'), 2400);
          } else {
            audio.stinger('loss');
            this.toast('/assets/icons/renown.png', `Your rival won ${def.title} (+${e.prize}★).`, 'warn');
            setTimeout(() => this.rivalVoice('theyWon'), 1800);
          }
          break;
        }
        case 'challengeExpired':
          this.news('/assets/icons/renown.png', `Nobody won ${challengeDef(e.def)?.title ?? 'the challenge'}. The prize goes unclaimed.`);
          break;
        case 'starfall':
          setTimeout(() => this.rivalVoice('starfall'), 6500);
          audio.stinger('starfall');
          this.banner.value = { title: '☄️ A star has fallen!', sub: 'It came down between you and your rival: a Star-Stone, the richest landmark in the valley. Push your border over it first!' };
          setTimeout(() => (this.banner.value = null), 5600);
          break;
        case 'moot':
          setTimeout(() => this.rivalVoice('moot'), 6000);
          audio.stinger('moot');
          this.banner.value = { title: '📯 The Valley Moot!', sub: 'Folk from all around gather for the final stretch: every landmark now pays double renown' };
          setTimeout(() => (this.banner.value = null), 5200);
          break;
        case 'victory':
          this.victory.value = { scenario: e.scenario, winner: e.winner, byTime: e.byTime, acclaim: !!e.acclaim };
          audio.stinger(e.winner === PLAYER ? 'victory' : 'defeat');
          if (e.winner === PLAYER) this.rememberHouse();
          if (this.world.label.startsWith('daily-')) recordDaily({ date: this.world.label.slice(6), won: e.winner === PLAYER, renown: this.world.players[PLAYER].renown, time: Math.floor(this.world.tick / 10) });
          this.save(false);
          break;
      }
    }
  }

  /** Routine news: shown only if nothing routine was shown in the last few seconds. */
  private lowNewsAt = 0;
  news(iconUrl: string, text: string, tone: Toast['tone'] = 'info'): void {
    const now = performance.now();
    if (now - this.lowNewsAt < LOW_NEWS_GAP_MS / Math.max(1, this.speed.value)) return;
    this.lowNewsAt = now;
    this.toast(iconUrl, text, tone);
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
    if (this.mode.value.kind === 'deed') {
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
    if (this.mode.value.kind === 'place') {
      this.updateGhost(sx, sy);
      return;
    }
    if (this.mode.value.kind === 'deed') {
      this.updateDeedPreview(sx, sy);
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
    if (mode.kind === 'deed') {
      // Touch: the first tap aims (with a preview), the ✓ button confirms. Mouse: click to do it.
      this.deedPreview.value = null;
      this.updateDeedPreview(sx, sy);
      this.touchPlacing.value = touch;
      if (!touch) this.confirmDeed();
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

  chooseBoon(offerId: number, choice: number): void {
    audio.play('click');
    this.world.enqueue({ type: 'chooseBoon', owner: PLAYER, offerId, choice });
  }

  /** A council family's deed: instant ones happen now, targeted ones wait for a tap on the map. */
  useDeed(familyId: number): void {
    const fam = this.world.families.get(familyId);
    const id = fam && deedOf(fam);
    if (!id) return;
    audio.play('click');
    if (!DEEDS[id].target) {
      this.world.enqueue({ type: 'deed', owner: PLAYER, familyId, x: 0, y: 0 });
      return;
    }
    // Raise picks a site: go straight to the one closest to finished, unless the player taps another.
    this.selection.value = null;
    this.mode.value = { kind: 'deed', familyId, deed: id };
  }

  setAutoHomes(on: boolean): void {
    audio.play('click');
    this.world.enqueue({ type: 'setAutoHomes', owner: PLAYER, on });
  }

  sell(good: Good): void {
    this.world.enqueue({ type: 'sell', owner: PLAYER, good });
  }

  setTrade(good: Good, keep: number | null): void {
    audio.play('click');
    this.world.enqueue({ type: 'setTrade', owner: PLAYER, good, keep });
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

  confirmDeed(): void {
    const mode = this.mode.value;
    const pv = this.deedPreview.value;
    if (mode.kind !== 'deed' || !pv) return;
    if (pv.problem) {
      audio.play('warn');
      this.toast('/assets/icons/scroll.png', pv.problem, 'warn');
      return;
    }
    this.world.enqueue({ type: 'deed', owner: PLAYER, familyId: mode.familyId, x: pv.x, y: pv.y });
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
    const fam = this.world.families.get(mode.familyId);
    let r = 0;
    let claim: ClaimPreview | undefined;
    if (!problem && fam && (mode.deed === 'festival' || mode.deed === 'expedition')) {
      const power = deedPower(fam);
      const src =
        mode.deed === 'festival'
          ? { owner: PLAYER, x, y, r: 10 + power * 2, p: 110 + power * 30 }
          : { owner: PLAYER, ...(outpostSpot(this.world, PLAYER, x, y) ?? { x, y }), r: (BUILDINGS.outpost.claim ?? 7) + (power > 1 ? 2 : 0) + (fam.mods.claim ? 2 : 0), p: BUILDINGS.outpost.power ?? 70 };
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

/** Rival news the player hears about. */
const RIVAL_NEWS = new Set<SimEvent['type']>(['claimed', 'rankUp', 'deed', 'workBegun']);

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

