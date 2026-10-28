import { Instruments } from './instruments';

/**
 * The soundtrack: four original pieces in old modes, written out note by note, and a
 * conductor that plays them on the synthesised band and follows the game.
 *
 * - "The First Valley" (D Dorian, 3/4): the main theme, on the title, at victory, and as the Moot finale.
 * - "Hearthsong" (G Mixolydian, 3/4): the village at work, spring to autumn.
 * - "The Long Night" (E Aeolian, 4/4): winter, slow, with bells.
 * - "Banners at the Border" (D Dorian, 4/4): tension, when the rival is pressing you.
 *
 * Moods change at four-bar phrase boundaries, so transitions stay musical; intensity adds or
 * removes layers (drone, harp bass, lute arpeggios, melody, doubling, drums) on the fly. Calm
 * pieces breathe: between passes there are quiet interludes of drone alone, so the music
 * never becomes wallpaper. Short stingers (fanfares, bells) mark big moments.
 */
export type Mood = 'theme' | 'village' | 'winter' | 'tension' | 'moot';
export type Stinger = 'discovery' | 'landmark' | 'loss' | 'rankUp' | 'victory' | 'defeat' | 'starfall' | 'moot' | 'deed' | 'work';

interface Piece {
  name: string;
  bpm: number;
  beats: 3 | 4;
  /** Drone root (MIDI). */
  tonic: number;
  /** Which voice carries the melody. */
  lead: 'flute' | 'lute' | 'horn';
  /** Bells ring the chord on each bar's first beat. */
  bells?: boolean;
  /** Breathing room between passes (calm pieces). */
  rests?: boolean;
  /** [chord, melody] per bar. Chords: root, optional #/b, then m (minor) or 5 (open fifth). Melody: NOTE:beats or r:beats. */
  bars: [string, string][];
}

const THEME: Piece = {
  name: 'The First Valley',
  bpm: 92,
  beats: 3,
  tonic: 50,
  lead: 'flute',
  bars: [
    ['Dm', 'A4:1 D5:1.5 E5:0.5'],
    ['Dm', 'F5:1 E5:1 D5:1'],
    ['F', 'C5:1 A4:2'],
    ['C', 'G4:1 A4:1 C5:1'],
    ['Dm', 'D5:1.5 E5:0.5 F5:1'],
    ['C', 'G5:1 F5:1 E5:1'],
    ['Am', 'D5:1 C5:1 E5:1'],
    ['Dm', 'D5:3'],
    ['F', 'F5:1 G5:1 A5:1'],
    ['Am', 'A5:2 G5:1'],
    ['Dm', 'F5:1 E5:1 D5:1'],
    ['F', 'C5:2 A4:1'],
    ['G', 'B4:1 C5:1 D5:1'],
    ['Am', 'E5:1.5 F5:0.5 E5:1'],
    ['Dm', 'D5:1 C5:1 A4:1'],
    ['Dm', 'D5:3'],
  ],
};

const HEARTH: Piece = {
  name: 'Hearthsong',
  bpm: 108,
  beats: 3,
  tonic: 55,
  lead: 'lute',
  rests: true,
  bars: [
    ['G', 'G4:1 B4:0.5 D5:0.5 D5:1'],
    ['Em', 'E5:1 D5:1 B4:1'],
    ['Am', 'C5:1 A4:0.5 B4:0.5 C5:1'],
    ['D5', 'D5:3'],
    ['G', 'G5:1 F5:0.5 E5:0.5 D5:1'],
    ['C', 'C5:1 E5:1 D5:1'],
    ['Dm', 'B4:1 A4:1 F4:1'],
    ['G', 'G4:3'],
    ['Dm', 'D5:1 E5:1 F5:1'],
    ['C', 'G5:2 E5:1'],
    ['Dm', 'F5:1 E5:1 D5:1'],
    ['C', 'C5:2 B4:1'],
    ['Am', 'A4:1 B4:1 C5:1'],
    ['F', 'D5:1 E5:0.5 D5:0.5 C5:1'],
    ['G', 'B4:1 A4:1 B4:1'],
    ['G', 'G4:3'],
  ],
};

const WINTER: Piece = {
  name: 'The Long Night',
  bpm: 60,
  beats: 4,
  tonic: 52,
  lead: 'flute',
  bells: true,
  rests: true,
  bars: [
    ['Em', 'E5:2 B4:2'],
    ['C', 'C5:1 D5:1 B4:2'],
    ['Am', 'A4:2 G4:1 A4:1'],
    ['B5', 'B4:4'],
    ['Em', 'E5:2 F#5:1 G5:1'],
    ['D', 'F#5:2 D5:2'],
    ['Am', 'E5:1 D5:1 C5:1 A4:1'],
    ['Em', 'B4:2 E4:2'],
  ],
};

const BORDER: Piece = {
  name: 'Banners at the Border',
  bpm: 112,
  beats: 4,
  tonic: 50,
  lead: 'horn',
  bars: [
    ['Dm', 'D5:0.5 D5:0.5 F5:0.5 D5:0.5 A5:1 G5:1'],
    ['Dm', 'F5:1 E5:0.5 F5:0.5 D5:2'],
    ['C', 'C5:0.5 C5:0.5 E5:0.5 C5:0.5 G5:1 F5:1'],
    ['C', 'E5:1 D5:0.5 E5:0.5 C5:2'],
    ['Dm', 'D5:0.5 F5:0.5 A5:1 A5:0.5 B5:0.5 C6:1'],
    ['Am', 'A5:1 G5:0.5 F5:0.5 E5:2'],
    ['C', 'F5:1 E5:1 D5:1 C5:1'],
    ['Dm', 'D5:4'],
  ],
};

const MOOT: Piece = { ...THEME, name: 'The Moot', bpm: 120, lead: 'flute' };

export const PIECES: Record<Mood, Piece> = { theme: THEME, village: HEARTH, winter: WINTER, tension: BORDER, moot: MOOT };

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 73. */
export function noteToMidi(n: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return (Number(m[3]) + 1) * 12 + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "F#m" → root MIDI in octave 3, and the interval used as the chord's colour note. */
export function parseChord(c: string): { root: number; third: number } {
  const m = /^([A-G])([#b]?)(m|5)?$/.exec(c);
  if (!m) throw new Error(`bad chord ${c}`);
  const root = 48 + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, third: m[3] === 'm' ? 3 : m[3] === '5' ? 7 : 4 };
}

export function parseMelody(s: string): { midi: number | null; beats: number }[] {
  return s
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, b] = tok.split(':');
      return { midi: n === 'r' ? null : noteToMidi(n), beats: Number(b) };
    });
}

/** Bars of a piece must add up (checked by tests, so a typo can't make the music stumble). */
export function barLengths(p: Piece): number[] {
  return p.bars.map(([, mel]) => parseMelody(mel).reduce((n, x) => n + x.beats, 0));
}

const STINGERS: Record<Stinger, (band: Instruments, t: number) => number> = {
  discovery: (b, t) => {
    ['D5', 'F#5', 'A5', 'D6'].forEach((n, i) => b.pluck(t + i * 0.11, noteToMidi(n), 0.9, i * 0.2 - 0.3));
    b.bell(t + 0.44, noteToMidi('D6'), 0.9);
    return 2;
  },
  landmark: (b, t) => {
    ['G4', 'C5', 'E5'].forEach((n, i) => b.horn(t + i * 0.22, noteToMidi(n), 0.2, 0.8));
    b.horn(t + 0.66, noteToMidi('G5'), 0.9, 0.9);
    b.bell(t + 0.66, noteToMidi('C6'), 0.7);
    b.drum(t + 0.66, 0.7);
    return 2.2;
  },
  rankUp: (b, t) => {
    b.horn(t, noteToMidi('C5'), 0.22, 0.9);
    b.horn(t + 0.26, noteToMidi('C5'), 0.14, 0.8);
    b.horn(t + 0.44, noteToMidi('G5'), 0.5, 0.9);
    b.horn(t + 1.0, noteToMidi('E5'), 0.25, 0.8);
    b.horn(t + 1.3, noteToMidi('C6'), 1.1, 1);
    for (const d of [0, 0.44, 1.0, 1.3]) b.drum(t + d, 0.8);
    b.bell(t + 1.3, noteToMidi('C6'), 0.8);
    return 3;
  },
  loss: (b, t) => {
    ['A4', 'F4', 'D4'].forEach((n, i) => b.flute(t + i * 0.45, noteToMidi(n), i === 2 ? 1.2 : 0.42, 0.8));
    b.drum(t, 0.5);
    return 2.2;
  },
  victory: (b, t) => {
    const mel = parseMelody('E5:1.5 F5:0.5 E5:1 D5:1 C5:1 A4:1 D5:3');
    let x = t;
    for (const n of mel) {
      if (n.midi) {
        b.horn(x, n.midi, n.beats * 0.6, 0.9);
        b.pluck(x, n.midi - 12, 0.7);
      }
      x += n.beats * 0.6;
    }
    b.bell(x - 1.8, noteToMidi('D6'), 0.9);
    return x - t + 1;
  },
  defeat: (b, t) => {
    parseMelody('E5:1 C5:1 A4:2 E4:3').reduce((x, n) => {
      if (n.midi) b.flute(x, n.midi, n.beats * 0.7, 0.8);
      return x + n.beats * 0.7;
    }, t);
    b.bell(t, noteToMidi('A4'), 0.6);
    return 5.5;
  },
  starfall: (b, t) => {
    ['A6', 'E6', 'C#6', 'A5', 'E5', 'A4'].forEach((n, i) => b.bell(t + i * 0.16, noteToMidi(n), 0.7, (i % 2 ? 0.4 : -0.4)));
    b.drum(t + 1.0, 0.9);
    return 3;
  },
  moot: (b, t) => {
    b.horn(t, noteToMidi('D4'), 0.5, 0.9);
    b.horn(t + 0.6, noteToMidi('A4'), 0.5, 0.9);
    b.horn(t + 1.2, noteToMidi('D5'), 1.4, 1);
    for (let i = 0; i < 8; i++) b.drum(t + 1.2 + i * 0.12, 0.3 + i * 0.07, i % 2 === 1);
    return 3.2;
  },
  deed: (b, t) => {
    ['A5', 'E6'].forEach((n, i) => b.pluck(t + i * 0.08, noteToMidi(n), 0.7));
    b.bell(t + 0.16, noteToMidi('A6'), 0.45);
    return 1;
  },
  work: (b, t) => {
    ['D5', 'A5', 'D6', 'F#6'].forEach((n, i) => b.bell(t + i * 0.25, noteToMidi(n), 0.8));
    b.horn(t + 1.0, noteToMidi('D5'), 1.2, 0.9);
    return 3;
  },
};

interface Note {
  t: number;
  play: () => void;
}

export class Conductor {
  /** What the game wants now; the conductor moves there at the next phrase. */
  private want: { mood: Mood; intensity: number } = { mood: 'theme', intensity: 1 };
  private mood: Mood = 'theme';
  private intensity = 1;
  private piece: Piece = THEME;
  private bar = 0;
  private pass = 0;
  /** Absolute time the next phrase starts. */
  private next = 0;
  private queue: Note[] = [];
  private restUntil = 0;
  private duckUntil = 0;

  constructor(
    private ctx: AudioContext,
    private band: Instruments,
    /** The music's level, ducked under stingers. */
    private level: GainNode,
  ) {}

  setMood(mood: Mood, intensity: number): void {
    this.want = { mood, intensity: Math.max(0, Math.min(3, intensity)) };
    // Intensity can rise mid-phrase (layers fade in); a new mood waits for the phrase to end.
    if (mood === this.mood) this.intensity = this.want.intensity;
  }

  stinger(s: Stinger): void {
    const t = this.ctx.currentTime + 0.05;
    const len = STINGERS[s](this.band, t);
    // Duck the music under the fanfare.
    this.level.gain.setTargetAtTime(0.35, t, 0.08);
    this.duckUntil = Math.max(this.duckUntil, t + len);
  }

  /** Schedule ahead. Call often (every frame is fine). */
  update(): void {
    const now = this.ctx.currentTime;
    if (this.duckUntil && now > this.duckUntil) {
      this.duckUntil = 0;
      this.level.gain.setTargetAtTime(1, now, 0.6);
    }
    if (this.next < now) this.next = now + 0.1;
    while (this.next < now + 0.6) this.phrase(this.next);
    while (this.queue.length && this.queue[0].t < now + 0.3) {
      const n = this.queue.shift()!;
      // After a stall (a hidden tab), skip what's long gone rather than playing it all at once.
      if (n.t > now - 0.15) n.play();
    }
  }

  /** Compose the next four bars (or a rest) starting at time t. */
  private phrase(t: number): void {
    // Phrase boundary: take the wanted mood.
    if (this.want.mood !== this.mood) {
      const into = this.want.mood;
      this.mood = into;
      this.piece = PIECES[into];
      this.bar = 0;
      this.pass = 0;
      this.restUntil = 0;
    }
    this.intensity = this.want.intensity;
    const p = this.piece;
    const beat = 60 / p.bpm;
    this.band.droneOn(t, p.tonic, this.intensity === 0 ? 0.02 : 0.035);
    if (t < this.restUntil) {
      // An interlude: drone alone, the valley's own sounds in front.
      this.band.droneLevel(t, 0.018);
      this.next = this.restUntil;
      return;
    }
    const bars = Math.min(4, p.bars.length - this.bar);
    for (let i = 0; i < bars; i++) this.composeBar(t + i * p.beats * beat, p.bars[this.bar + i], beat);
    this.next = t + bars * p.beats * beat;
    this.bar += bars;
    if (this.bar >= p.bars.length) {
      this.bar = 0;
      this.pass++;
      if (p.rests && this.pass % 2 === 0) this.restUntil = this.next + 8 + Math.random() * 10;
    }
    this.queue.sort((a, b) => a.t - b.t);
  }

  private at(t: number, play: () => void): void {
    this.queue.push({ t, play });
  }

  private composeBar(t: number, [chord, mel]: [string, string], beat: number): void {
    const p = this.piece;
    const lvl = this.intensity;
    const { root, third } = parseChord(chord);
    const hum = () => (Math.random() - 0.5) * 0.016;
    // Harp bass on the downbeat.
    this.at(t, () => this.band.pluck(t, root - 12, 0.75, -0.2, 0.3));
    if (p.bells) this.at(t, () => this.band.bell(t, root + 24, 0.35, 0.3));
    // Lute arpeggio in eighths (sparser when quiet, half notes in winter).
    const shape = p.beats === 3 ? [0, 7, 12, 12 + third, 12, 7] : [0, 7, 12, 12 + third, 19, 12 + third, 12, 7];
    const step = p.bpm < 70 ? 2 : 1;
    if (lvl >= 1 || this.bar % 2 === 0)
      for (let i = 0; i < shape.length; i += step) {
        const x = t + (i * beat) / 2 + hum();
        const v = (i === 0 ? 0.55 : 0.4) * (lvl === 0 ? 0.6 : 1);
        this.at(x, () => this.band.pluck(x, root + shape[i], v, 0.25, 0.7));
      }
    // The tune.
    if (lvl >= 1) {
      let x = t;
      const leadIsLute = p.lead === 'lute' && this.pass % 2 === 0;
      for (const n of parseMelody(mel)) {
        const at = x;
        const dur = n.beats * beat;
        if (n.midi !== null) {
          const m = n.midi;
          if (p.lead === 'horn') this.at(at, () => this.band.horn(at, m - 12, dur * 0.9, 0.55));
          else if (leadIsLute) this.at(at, () => this.band.pluck(at + hum(), m, 0.85, -0.1, 1));
          else this.at(at, () => this.band.flute(at, m, dur * 0.95, 0.8, -0.1));
          // Doubling an octave down on the lute as things heat up.
          if (lvl >= 2 && !leadIsLute) this.at(at, () => this.band.pluck(at + hum(), m - 12, 0.5, 0.15, 0.8));
        }
        x += dur;
      }
    }
    // Drums.
    if (lvl >= 2 || p === BORDER) {
      for (let b = 0; b < p.beats; b++) {
        const x = t + b * beat;
        const strong = b === 0 || (p.beats === 4 && b === 2);
        if (strong) this.at(x, () => this.band.drum(x, lvl >= 3 ? 0.9 : 0.6));
        else if (lvl >= 2) this.at(x, () => this.band.drum(x, 0.35, true));
        if (lvl >= 3) this.at(x + beat / 2, () => this.band.drum(x + beat / 2, 0.25, true));
      }
    }
    // The hurdy-gurdy buzz on the beat in tense music.
    if (p === BORDER || lvl >= 3) for (let b = 0; b < p.beats; b++) this.at(t + b * beat, () => this.band.droneBuzz(t + b * beat, beat));
  }
}
