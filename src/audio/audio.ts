/**
 * Procedural audio: no sound files. A soft wind-and-birdsong ambience plus small synthesised
 * effects (axe chops, pick clinks, hammer taps, saws, chimes). Effects are attenuated by
 * distance from the camera focus so a busy village murmurs rather than clatters.
 */
export type Sfx = 'chop' | 'pick' | 'hammer' | 'saw' | 'shovel' | 'complete' | 'tierUp' | 'arrive' | 'click' | 'place' | 'warn' | 'objective' | 'deliver';

export interface Volumes {
  master: number;
  ambience: number;
  effects: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private birdTimer = 2;
  private last: Partial<Record<Sfx, number>> = {};
  private volumes: Volumes = { master: 0.8, ambience: 0.6, effects: 0.7 };
  private windFilter: BiquadFilterNode | null = null;
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
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
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
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.effects, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.volumes.ambience * 0.5, t, 0.1);
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
    gain.gain.value = 0.35;
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
  }

  /** Call every frame: schedules ambient birdsong. `zoom` 0 (close) .. 1 (far) thins out detail. */
  update(dt: number, zoom: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      this.bird(0.5 - zoom * 0.3);
    }
    if (this.windFilter) this.windFilter.Q.value = 0.5 + zoom;
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

export const audio = new AudioEngine();
