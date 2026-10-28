import { describe, expect, it } from 'vitest';
import { PIECES, barLengths, noteToMidi, parseChord } from '../src/audio/music';

describe('the soundtrack', () => {
  it('every bar of every piece adds up to its metre (no stumbling tunes)', () => {
    for (const [mood, p] of Object.entries(PIECES))
      barLengths(p).forEach((n, i) => expect(n, `${mood} bar ${i + 1}`).toBe(p.beats));
  });

  it('reads notes and chords', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C#5')).toBe(73);
    expect(parseChord('Dm')).toEqual({ root: 50, third: 3 });
    expect(parseChord('D5').third).toBe(7);
  });
});
