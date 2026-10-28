/**
 * Synthesised medieval instruments for the soundtrack (no sample files):
 * - lute / harp: Karplus–Strong plucked strings, rendered once per pitch and cached;
 * - recorder: a breathy triangle voice with delayed vibrato and a breath "chiff";
 * - drone: a hurdy-gurdy-like pair of detuned saws through a slowly breathing filter;
 * - frame drum (bodhrán), rim taps, bells with inharmonic partials, and a shawm-like horn.
 * Everything goes into one `out` node; the engine adds reverb and volume.
 */
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Instruments {
  private plucks = new Map<number, AudioBuffer>();
  private noise: AudioBuffer;
  private drone: { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; gate: GainNode; root: number } | null = null;

  constructor(
    private ctx: AudioContext,
    readonly out: AudioNode,
  ) {
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** A plucked string (lute in the middle, harp low): Karplus–Strong, cached per pitch. */
  pluck(t: number, midi: number, vel: number, pan = 0, bright = 1): void {
    t = Math.max(t, this.ctx.currentTime);
    const src = this.ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 + 2600 * bright;
    const g = this.ctx.createGain();
    g.gain.value = vel * 0.55;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(lp).connect(g).connect(p).connect(this.out);
    src.start(t);
    src.stop(t + 2.4);
  }

  private pluckBuffer(midi: number): AudioBuffer {
    const cached = this.plucks.get(midi);
    if (cached) return cached;
    const sr = this.ctx.sampleRate;
    const f = mtof(midi);
    const len = Math.floor(sr * 2.3);
    const n = Math.max(2, Math.round(sr / f));
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const ring = new Float32Array(n);
    // A soft pluck: low-passed noise excitation, gentler on high strings.
    let prev = 0;
    for (let i = 0; i < n; i++) {
      prev = prev * 0.55 + (Math.random() * 2 - 1) * 0.45;
      ring[i] = prev;
    }
    const decay = Math.min(0.9985, 0.9965 + (60 - midi) * 0.00004);
    let j = 0;
    for (let i = 0; i < len; i++) {
      const next = j + 1 === n ? 0 : j + 1;
      const v = ring[j];
      data[i] = v;
      ring[j] = 0.5 * (v + ring[next]) * decay;
      j = next;
    }
    // Fade the tail so cut-offs never click.
    for (let i = len - 2000; i < len; i++) data[i] *= (len - i) / 2000;
    this.plucks.set(midi, buf);
    return buf;
  }

  /** A recorder note: soft attack, delayed vibrato, a breath chiff at the start. */
  flute(t: number, midi: number, dur: number, vel: number, pan = 0): void {
    t = Math.max(t, this.ctx.currentTime);
    const ctx = this.ctx;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibg = ctx.createGain();
    vibg.gain.setValueAtTime(0, t);
    vibg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur * 0.6));
    vib.connect(vibg);
    vibg.connect(o.frequency);
    vibg.connect(o2.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    const end = t + Math.max(0.12, dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.06);
    g.gain.setTargetAtTime(vel * 0.12, t + 0.06, 0.2);
    g.gain.setTargetAtTime(0, end - 0.04, 0.06);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(g).connect(p).connect(this.out);
    // Breath: a short band of noise at the note's start.
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 3;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(ng).connect(p);
    for (const x of [o, o2, vib]) {
      x.start(t);
      x.stop(end + 0.4);
    }
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.1);
  }

  /** Start (or move) the drone to a new root; it glides rather than restarting. */
  droneOn(t: number, root: number, level: number): void {
    t = Math.max(t, this.ctx.currentTime);
    const ctx = this.ctx;
    if (this.drone) {
      if (this.drone.root !== root) {
        this.drone.oscs[0].frequency.setTargetAtTime(mtof(root), t, 0.4);
        this.drone.oscs[1].frequency.setTargetAtTime(mtof(root) * 1.004, t, 0.4);
        this.drone.oscs[2].frequency.setTargetAtTime(mtof(root + 7), t, 0.4);
        this.drone.root = root;
      }
      this.drone.gain.gain.setTargetAtTime(level, t, 1.2);
      return;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfog = ctx.createGain();
    lfog.gain.value = 220;
    lfo.connect(lfog).connect(filter.frequency);
    const gate = ctx.createGain();
    gate.gain.value = 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, t, 1.5);
    const oscs = [mtof(root), mtof(root) * 1.004, mtof(root + 7)].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.5 : 0.7;
      o.connect(og).connect(filter);
      o.start(t);
      return o;
    });
    filter.connect(gate).connect(gain).connect(this.out);
    lfo.start(t);
    this.drone = { oscs, gain, filter, gate, root };
  }

  droneLevel(t: number, level: number): void {
    t = Math.max(t, this.ctx.currentTime);
    this.drone?.gain.gain.setTargetAtTime(level, t, 1.2);
  }

  /** The hurdy-gurdy's buzzing "trompette": a rhythmic pulse on the drone (tension). */
  droneBuzz(t: number, beat: number): void {
    t = Math.max(t, this.ctx.currentTime);
    if (!this.drone) return;
    const g = this.drone.gate.gain;
    g.setValueAtTime(1.6, t);
    g.setTargetAtTime(1, t + 0.02, beat * 0.25);
  }

  /** Frame drum: a low thump with a skin slap; `rim` is a light tap on the frame. */
  drum(t: number, vel: number, rim = false): void {
    t = Math.max(t, this.ctx.currentTime);
    const ctx = this.ctx;
    if (!rim) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.4);
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = rim ? 'bandpass' : 'lowpass';
    f.frequency.value = rim ? 2400 : 900;
    f.Q.value = rim ? 3 : 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * (rim ? 0.12 : 0.18), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (rim ? 0.05 : 0.12));
    n.connect(f).connect(ng).connect(this.out);
    n.start(t, Math.random() * 0.8);
    n.stop(t + 0.15);
  }

  /** A bell: inharmonic partials, long ring. */
  bell(t: number, midi: number, vel: number, pan = 0): void {
    t = Math.max(t, this.ctx.currentTime);
    const ctx = this.ctx;
    const f = mtof(midi);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out);
    for (const [ratio, amp, dur] of [
      [1, 1, 3.2],
      [2.76, 0.4, 1.6],
      [5.4, 0.18, 0.8],
      [0.5, 0.25, 2.4],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 0.09 * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** A shawm-like horn for fanfares. */
  horn(t: number, midi: number, dur: number, vel: number): void {
    t = Math.max(t, this.ctx.currentTime);
    const ctx = this.ctx;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.06);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.6;
    const vg = ctx.createGain();
    vg.gain.value = f * 0.004;
    vib.connect(vg).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(2200, t + 0.12);
    const g = ctx.createGain();
    const end = t + dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.09, t + 0.05);
    g.gain.setTargetAtTime(0, end - 0.05, 0.08);
    o.connect(bp).connect(g).connect(this.out);
    o.start(t);
    vib.start(t);
    o.stop(end + 0.5);
    vib.stop(end + 0.5);
  }
}
