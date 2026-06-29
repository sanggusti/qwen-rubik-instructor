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

// Per-stage skill record, accumulated across attempts. A "stage" is a lesson or
// drill id (the curriculum maps solver stages onto these). This is the memory
// the backend reads to adapt narration to how the learner is actually doing.
export interface StageStat {
  stage: string;
  label?: string; // human-readable, for the welcome-back nod
  attempts: number; // completions of this stage
  mistakes: number; // cumulative wrong moves across attempts
  bestMs?: number; // fastest completion
  lastAt: string; // ISO timestamp of the most recent attempt
  mastered: boolean; // completed cleanly at least once
}

export interface UserProfile {
  level: Level;
  method: Method;
  sessionId: string;
  history: HistoryEntry[];
  performance: Record<string, StageStat>;
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
  return { level: 'newbie', method: 'lbl', sessionId: newSessionId(), history: [], performance: {} };
}

function parsePerformance(raw: unknown): Record<string, StageStat> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, StageStat> = {};
  for (const [stage, v] of Object.entries(raw as Record<string, Partial<StageStat>>)) {
    if (!v || typeof v !== 'object') continue;
    out[stage] = {
      stage,
      label: typeof v.label === 'string' ? v.label : undefined,
      attempts: typeof v.attempts === 'number' ? v.attempts : 0,
      mistakes: typeof v.mistakes === 'number' ? v.mistakes : 0,
      bestMs: typeof v.bestMs === 'number' ? v.bestMs : undefined,
      lastAt: typeof v.lastAt === 'string' ? v.lastAt : '',
      mastered: v.mastered === true
    };
  }
  return out;
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
      history: Array.isArray(parsed.history) ? parsed.history.slice(-HISTORY_CAP) : [],
      performance: parsePerformance(parsed.performance)
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

function nowIso(): string {
  return new Date().toISOString();
}

// The outcome of one completed lesson/drill, folded into the stage's running
// stats. Called by the lesson and practice engines on completion.
export interface StageResult {
  stage: string;
  label?: string;
  mistakes: number;
  durationMs?: number;
}

export function recordStageResult(
  result: StageResult,
  storage: StorageLike | null = defaultStorage()
): UserProfile {
  const p = loadProfile(storage);
  const prev = p.performance[result.stage];
  const bestMs =
    result.durationMs === undefined
      ? prev?.bestMs
      : Math.min(result.durationMs, prev?.bestMs ?? result.durationMs);
  p.performance = {
    ...p.performance,
    [result.stage]: {
      stage: result.stage,
      label: result.label ?? prev?.label,
      attempts: (prev?.attempts ?? 0) + 1,
      mistakes: (prev?.mistakes ?? 0) + result.mistakes,
      bestMs,
      lastAt: nowIso(),
      // Mastered the moment it's completed with no mistakes; stays mastered.
      mastered: (prev?.mastered ?? false) || result.mistakes === 0
    }
  };
  saveProfile(p, storage);
  return p;
}

// A compact, structured summary of the learner sent to the backend each request
// so Qwen can remember and adapt (see narrative.llm_narrator). Kept small on
// purpose — a couple of struggle stages and the mastered list, not raw history.
export interface DigestStage {
  stage: string;
  label?: string;
  mistakes: number;
}

export interface MemoryDigest {
  level: Level;
  method: Method;
  sessions: number;
  lastKind?: HistoryEntry['kind'];
  struggles: DigestStage[];
  mastered: string[];
}

export function buildMemoryDigest(profile: UserProfile): MemoryDigest {
  const stats = Object.values(profile.performance);
  const struggles = stats
    .filter((s) => !s.mastered && s.mistakes > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .slice(0, 3)
    .map((s) => ({ stage: s.stage, label: s.label, mistakes: s.mistakes }));
  const mastered = stats.filter((s) => s.mastered).map((s) => s.label ?? s.stage);
  const last = profile.history[profile.history.length - 1];
  return {
    level: profile.level,
    method: profile.method,
    sessions: profile.history.length,
    lastKind: last?.kind,
    struggles,
    mastered
  };
}
