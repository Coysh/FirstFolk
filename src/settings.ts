import { signal } from '@preact/signals';
import type { SaveData } from './sim/save';
import type { Dynasty } from './sim/origins';
import { houseFromBoons } from './sim/houses';
import { summarize, type SaveSummary } from './sim/save';

export type Quality = 'high' | 'balanced' | 'low';

export interface Settings {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  /** Silences everything (M key or the speaker button), keeping the levels for later. */
  muted: boolean;
  quality: Quality;
  hints: boolean;
  /** A slow day and night: windows and fires glow after dusk. */
  dayNight: boolean;
}

const SETTINGS_KEY = 'firstfolk.settings.v1';
const SAVE_KEY = 'firstfolk.save.v1';

const defaults: Settings = {
  master: 0.8,
  music: 0.6,
  ambience: 0.6,
  effects: 0.7,
  muted: false,
  quality: matchMedia('(pointer: coarse)').matches ? 'balanced' : 'high',
  hints: true,
  dayNight: true,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const settings = signal<Settings>({ ...defaults, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) });

export function toggleMute(): void {
  saveSettings({ ...settings.value, muted: !settings.value.muted });
}

export function saveSettings(next: Settings): void {
  settings.value = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

interface StoredSave {
  savedAt: number;
  summary: SaveSummary;
  data: SaveData;
}

/** Store the game. Returns false if storage is unavailable or full. */
export function writeSave(data: SaveData): boolean {
  const savedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt, summary: summarize(data, savedAt), data } satisfies StoredSave));
    saveSummary.value = summarize(data, savedAt);
    return true;
  } catch {
    return false;
  }
}

export function readSave(): SaveData | null {
  return read<StoredSave>(SAVE_KEY)?.data ?? null;
}

function readSummary(): SaveSummary | null {
  return read<StoredSave>(SAVE_KEY)?.summary ?? null;
}

export const saveSummary = signal<SaveSummary | null>(readSummary());

/** Today's Daily Valley: the same seed and omens for everyone, and your best result. */
const DAILY_KEY = 'firstfolk.daily.v1';

export interface DailyResult {
  date: string;
  won: boolean;
  renown: number;
  /** Seconds of game time to the result. */
  time: number;
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dailySeed = (date: string) => Number(date.replace(/-/g, '')) % 900000 + 100000;

export const dailyBest = signal<DailyResult | null>(read<DailyResult>(DAILY_KEY));

/** Keep the better of today's results: a win beats a loss, then higher renown, then faster. */
export function recordDaily(r: DailyResult): void {
  const prev = dailyBest.value;
  const better = !prev || prev.date !== r.date || (r.won && !prev.won) || (r.won === prev.won && (r.renown > prev.renown || (r.renown === prev.renown && r.time < prev.time)));
  if (!better) return;
  dailyBest.value = r;
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(r));
  } catch {
    /* storage unavailable */
  }
}

/** Houses that won a valley, remembered to found the next (newest first, up to six). */
const DYNASTY_KEY = 'firstfolk.dynasties.v1';

export interface StoredDynasty extends Dynasty {
  renown: number;
  date: string;
}

// Dynasties won before the Great Houses remembered boons: they keep the house those boons implied.
export const dynasties = signal<StoredDynasty[]>((read<(StoredDynasty & { boons?: string[] })[]>(DYNASTY_KEY) ?? []).map((d) => ({ ...d, house: d.house ?? houseFromBoons(d.boons ?? [], d.skill) })));

/** Remember a winning house; winning again with the same name adds a generation. */
export function recordDynasty(d: Omit<StoredDynasty, 'generation'>): StoredDynasty {
  const prev = dynasties.value.find((x) => x.surname === d.surname);
  const entry: StoredDynasty = { ...d, generation: (prev?.generation ?? 0) + 1 };
  dynasties.value = [entry, ...dynasties.value.filter((x) => x.surname !== d.surname)].slice(0, 6);
  try {
    localStorage.setItem(DYNASTY_KEY, JSON.stringify(dynasties.value));
  } catch {
    /* storage unavailable */
  }
  return entry;
}
