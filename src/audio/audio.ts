import { Instruments } from './instruments';
import { Conductor, type Mood, type Stinger } from './music';

/**
 * Procedural audio: no sound files.
 * - Music: an original soundtrack played live by a synthesised band (see music.ts).
 * - Ambience: wind, and a soundscape that follows the season (birds in spring, crickets in
 *   summer, rooks and gusts in autumn, howling wind and wolves in winter), water when the
 *   camera is near a river or lake, and hearths crackling in a busy village.
 * - Effects: axe chops, pick clinks, hammer taps, saws, chimes, attenuated by distance from
 *   the camera focus so a busy village murmurs rather than clatters.
 * Four volume buses (master, music, ambience, effects) and a mute that silences everything.
 */
export type { Mood, Stinger };

/** What the camera hears, updated by the game a few times a second. */
export interface Soundscape {
  season: 0 | 1 | 2 | 3;
  /** 0..1: share of water around the camera focus. */
  water: number;
  /** 0..1: how many homes and workplaces are near the camera focus. */
  village: number;
}
export type Sfx = 'chop' | 'pick' | 'hammer' | 'saw' | 'shovel' | 'complete' | 'tierUp' | 'arrive' | 'click' | 'place' | 'warn' | 'objective' | 'deliver' | 'letter';

export interface Volumes {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  /** Muffles everything but the UI while paused or in menus. */
  private muffle!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private birdTimer = 2;
  private critterTimer = 4;
  private crackleTimer = 1;
  private last: Partial<Record<Sfx, number>> = {};
  private volumes: Volumes = { master: 0.8, music: 0.6, ambience: 0.6, effects: 0.7, muted: false };
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private water: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private scene: Soundscape = { season: 0, water: 0, village: 0 };
  private conductor: Conductor | null = null;
  private pendingMood: { mood: Mood; intensity: number } = { mood: 'theme', intensity: 1 };
  started = false;

  /** Must be called from a user gesture (browser autoplay rules). */
  start(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.started = true;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    // A gentle bus compressor: glues the band together and keeps fanfares from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.muffle);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.muffle);
    // Music: the band → a hall reverb (wet) plus the dry signal → ducking → the music bus.
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.muffle);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus);
    const bandOut = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    bandOut.connect(dry).connect(this.musicDuck);
    bandOut.connect(verb).connect(wet).connect(this.musicDuck);
    this.conductor = new Conductor(ctx, new Instruments(ctx, bandOut), this.musicDuck);
    this.conductor.setMood(this.pendingMood.mood, this.pendingMood.intensity);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      // Brownish noise: softer than white, reads as wind.
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = b * 3.5;
    }
    this.startWind();
    this.startWater();
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  get muted(): boolean {
    return this.volumes.muted;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.1);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 1.6, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.effects, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.volumes.ambience * 0.5, t, 0.1);
  }

  /** What the music should be doing (the conductor moves there at the next phrase). */
  setMood(mood: Mood, intensity: number): void {
    this.pendingMood = { mood, intensity };
    this.conductor?.setMood(mood, intensity);
  }

  /** A short fanfare or bell over the music, for big moments. */
  stinger(s: Stinger): void {
    if (this.ctx?.state === 'running') this.conductor?.stinger(s);
  }

  /** Paused or in a menu: the world (and the band) sound far away. */
  setMuffled(on: boolean): void {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 650 : 20000, this.ctx.currentTime, 0.15);
  }

  setScene(s: Soundscape): void {
    this.scene = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Winter wind howls; summer air is still.
    const wind = [0.18, 0.12, 0.24, 0.4][s.season];
    this.windGain?.gain.setTargetAtTime(wind, t, 2);
    this.water?.gain.gain.setTargetAtTime(s.water * 0.35, t, 0.8);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    // Slow gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(this.ambBus);
    src.start();
    lfo.start();
    this.windFilter = filter;
    this.windGain = gain;
  }

  /** A river's babble: noise through a wandering band-pass, faded in near water. */
  private startWater(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 1.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.9;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.6;
    const lg = ctx.createGain();
    lg.gain.value = 380;
    lfo.connect(lg).connect(filter.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.ambBus);
    src.start();
    lfo.start();
    this.water = { gain, filter };
  }

  /** Call every frame: the music, and the season's creatures. `zoom` 0 (close) .. 1 (far) thins out detail. */
  update(dt: number, zoom: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.conductor?.update();
    const season = this.scene.season;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      // Spring is full of song, summer a little less, autumn sparse, winter silent.
      this.birdTimer = [1.2, 2.5, 6, 999][season] + Math.random() * [4, 5, 8, 0][season];
      if (season !== 3) this.bird(0.5 - zoom * 0.3);
    }
    this.critterTimer -= dt;
    if (this.critterTimer <= 0) {
      this.critterTimer = season === 1 ? 1.5 + Math.random() * 2 : 7 + Math.random() * 14;
      if (season === 1) this.cricket(0.5 - zoom * 0.25);
      else if (season === 2) this.rook(0.45 - zoom * 0.2);
      else if (season === 3 && Math.random() < 0.35) this.wolf(0.4);
    }
    // Hearths and workshops: soft crackles, more of them in a busy village up close.
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 0.15 + Math.random() * (1.4 - this.scene.village);
      if (this.scene.village > 0.1 && zoom < 0.7) this.crackle(this.scene.village * (0.7 - zoom) * (season === 3 ? 1.6 : 1));
    }
    if (this.windFilter) this.windFilter.Q.value = 0.5 + zoom + (season === 3 ? 1.5 : 0);
  }

  /** A summer cricket: a few fast, high chirps. */
  private cricket(level: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambBus);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025 * level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.05);
    }
  }

  /** An autumn rook: a couple of hoarse caws, far off. */
  private rook(level: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambBus);
    for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
      const t = t0 + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.22);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 * level, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(f).connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.26);
    }
  }

  /** A wolf on a winter night, very far away. */
  private wolf(level: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(560, t + 0.7);
    o.frequency.linearRampToValueAtTime(470, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03 * level, t + 0.5);
    g.gain.linearRampToValueAtTime(0, t + 2.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    o.connect(g).connect(pan).connect(this.ambBus);
    o.start(t);
    o.stop(t + 2.5);
  }

  /** A hearth's crackle. */
  private crackle(level: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800 + Math.random() * 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.03);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.06);
  }

  private bird(level: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1600;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambBus);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      const f = base * (0.85 + Math.random() * 0.35);
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() > 0.5 ? 1.35 : 0.75), t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06 * level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  /**
   * Play an effect. `distance` (world units from the camera focus) attenuates world sounds;
   * per-type rate limiting keeps a big village from turning into noise.
   */
  play(sfx: Sfx, distance = 0, viewRadius = 30): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap: Partial<Record<Sfx, number>> = { chop: 0.07, pick: 0.07, hammer: 0.06, saw: 0.15, shovel: 0.2, deliver: 0.12, click: 0.03 };
    if (now - (this.last[sfx] ?? -1) < (minGap[sfx] ?? 0.05)) return;
    const level = Math.max(0, 1 - distance / viewRadius);
    if (level <= 0.02) return;
    this.last[sfx] = now;
    switch (sfx) {
      case 'chop':
        return this.thock(now, 780 + Math.random() * 200, 0.16, 0.5 * level, 'bandpass', 6);
      case 'hammer':
        return this.thock(now, 1300 + Math.random() * 300, 0.06, 0.35 * level, 'bandpass', 9);
      case 'pick':
        this.thock(now, 2600, 0.05, 0.25 * level, 'bandpass', 14);
        return this.tone(now, 3100 + Math.random() * 400, 0.12, 0.05 * level, 'triangle');
      case 'saw':
        return this.rasp(now, 0.32, 0.12 * level);
      case 'shovel':
        return this.thock(now, 300, 0.12, 0.25 * level, 'lowpass', 1);
      case 'deliver':
        return this.thock(now, 520, 0.05, 0.14 * level, 'lowpass', 2);
      case 'click':
        return this.tone(now, 880, 0.05, 0.08, 'triangle');
      case 'place':
        this.thock(now, 220, 0.18, 0.4, 'lowpass', 1);
        return this.tone(now, 440, 0.12, 0.06, 'triangle');
      case 'complete':
        return this.chime(now, [523.25, 659.25, 783.99], 0.11, 0.12 * Math.max(level, 0.5));
      case 'objective':
        return this.chime(now, [659.25, 880], 0.1, 0.1);
      case 'tierUp':
        return this.chime(now, [392, 523.25, 659.25, 1046.5], 0.13, 0.13);
      case 'arrive':
        return this.horn(now);
      case 'warn':
        return this.chime(now, [311.13, 233.08], 0.22, 0.09);
      case 'letter':
        // A wax seal and a little bell: something waits in the ledger.
        this.thock(now, 400, 0.06, 0.15, 'lowpass', 1);
        return this.chime(now + 0.05, [1174.66, 1567.98], 0.09, 0.05);
    }
  }

  private thock(t: number, freq: number, dur: number, vol: number, type: BiquadFilterType, q: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private rasp(t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.linearRampToValueAtTime(2600, t + dur);
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private chime(t: number, freqs: number[], step: number, vol: number): void {
    freqs.forEach((f, i) => {
      this.tone(t + i * step, f, 0.9, vol, 'sine');
      this.tone(t + i * step, f * 2, 0.4, vol * 0.25, 'sine');
    });
  }

  private horn(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(196, t);
    o.frequency.linearRampToValueAtTime(220, t + 0.15);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.12);
    g.gain.linearRampToValueAtTime(0.05, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 1.2);
  }
}

/** A hall's reverb tail: decaying stereo noise. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

export const audio = new AudioEngine();
