import { signal } from '@preact/signals';
import type { SaveData } from './sim/save';
import { summarize, type SaveSummary } from './sim/save';

export type Quality = 'high' | 'balanced' | 'low';

export interface Settings {
  master: number;
  ambience: number;
  effects: number;
  quality: Quality;
  hints: boolean;
}

const SETTINGS_KEY = 'firstfolk.settings.v1';
const SAVE_KEY = 'firstfolk.save.v1';

const defaults: Settings = {
  master: 0.8,
  ambience: 0.6,
  effects: 0.7,
  quality: matchMedia('(pointer: coarse)').matches ? 'balanced' : 'high',
  hints: true,
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
