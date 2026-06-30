// A tiny client-side learner profile + session memory, persisted in
// localStorage. Sent with each generate request so the backend can personalise
// narration, method, and pacing. Reuses the StorageLike injection pattern from
// lesson_progress.ts so it's testable without a DOM.

import type { StorageLike } from './lesson_progress';

export type Level = 'newbie' | 'intermediate' | 'advanced';
export type Method = 'lbl' | 'cfop';

export interface HistoryEntry {
  kind: 'walkthrough' | 'lesson';
  method: Method;
  stages: number;
  at: string; // ISO timestamp
}

export interface UserProfile {
  level: Level;
  method: Method;
  sessionId: string;
  history: HistoryEntry[];
}

const KEY = 'rubik-profile';
const HISTORY_CAP = 10;
export const LEVELS: Level[] = ['newbie', 'intermediate', 'advanced'];

// Newbies learn layer-by-layer; intermediate/advanced see CFOP framing.
export function deriveMethod(level: Level): Method {
  return level === 'newbie' ? 'lbl' : 'cfop';
}

export function nextLevel(level: Level): Level {
  return LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
}

function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `sess-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function defaultStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

function fresh(): UserProfile {
  return { level: 'newbie', method: 'lbl', sessionId: newSessionId(), history: [] };
}

export function loadProfile(storage: StorageLike | null = defaultStorage()): UserProfile {
  if (!storage) return fresh();
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return fresh();
  }
  if (!raw) {
    const p = fresh();
    saveProfile(p, storage);
    return p;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    const level: Level = LEVELS.includes(parsed.level as Level) ? (parsed.level as Level) : 'newbie';
    return {
      level,
      method: parsed.method === 'lbl' || parsed.method === 'cfop' ? parsed.method : deriveMethod(level),
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : newSessionId(),
      history: Array.isArray(parsed.history) ? parsed.history.slice(-HISTORY_CAP) : []
    };
  } catch {
    return fresh();
  }
}

export function saveProfile(p: UserProfile, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota/availability errors */
  }
}

export function setLevel(level: Level, storage: StorageLike | null = defaultStorage()): UserProfile {
  const p = loadProfile(storage);
  p.level = level;
  p.method = deriveMethod(level);
  saveProfile(p, storage);
  return p;
}

export function appendHistory(
  entry: HistoryEntry,
  storage: StorageLike | null = defaultStorage()
): UserProfile {
  const p = loadProfile(storage);
  p.history = [...p.history, entry].slice(-HISTORY_CAP);
  saveProfile(p, storage);
  return p;
}
