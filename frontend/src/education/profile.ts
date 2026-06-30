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

// --- Decay & forgetting ---------------------------------------------------
// What makes this a memory and not a hoard: a struggle's weight fades the longer
// ago the learner last hit it, struggles that fade past a threshold are dropped
// entirely, and a mastered skill left idle long enough resurfaces for review.
const DAY_MS = 24 * 60 * 60 * 1000;
const MISTAKE_HALF_LIFE_MS = 14 * DAY_MS; // a struggle's weight halves every 2 weeks
const REVIEW_INTERVAL_MS = 21 * DAY_MS; // mastered but idle this long → due for review
const FORGET_THRESHOLD = 0.5; // decayed weight at/below this is forgotten
const MAX_MASTERED = 6; // bound the mastered list so a long history can't blow context
const MAX_STRUGGLES = 3;
const MAX_REVIEW = 3;
const RELEVANCE_BONUS = 100; // a stat matching the current context ranks first

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

function ageMs(stat: StageStat, now: number): number {
  const t = Date.parse(stat.lastAt);
  // Legacy/missing timestamps are treated as "just now" so we never forget data
  // we can't date.
  return Number.isNaN(t) ? 0 : Math.max(0, now - t);
}

// Exponential fade: 1 right after an attempt, halving every MISTAKE_HALF_LIFE_MS.
export function decayFactor(age: number, halfLife: number = MISTAKE_HALF_LIFE_MS): number {
  return age <= 0 ? 1 : Math.pow(0.5, age / halfLife);
}

// A struggle's effective weight: cumulative mistakes faded by how long ago the
// learner last touched the stage. Old pain fades; recent pain stays sharp.
export function decayedWeight(stat: StageStat, now: number): number {
  return stat.mistakes * decayFactor(ageMs(stat, now));
}

// A mastered skill left idle past the review interval is "due for review" — the
// forgetting curve, surfaced as spaced repetition. Mastery itself stays sticky.
export function isDueForReview(stat: StageStat, now: number): boolean {
  return stat.mastered && ageMs(stat, now) >= REVIEW_INTERVAL_MS;
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
  dueForReview: string[];
}

export interface DigestOptions {
  now?: number;
  /** Current stage the learner is on, so the relevant memory ranks first. */
  context?: string;
}

export function buildMemoryDigest(profile: UserProfile, opts: DigestOptions = {}): MemoryDigest {
  const now = opts.now ?? Date.now();
  const { context } = opts;
  const stats = Object.values(profile.performance);

  // Retrieval: rank unmastered struggles by faded severity (with a big bonus
  // when the stage matches what the learner is doing now), and FORGET those
  // whose weight has decayed at/below the threshold — they no longer recall.
  const struggles = stats
    .filter((s) => !s.mastered && decayedWeight(s, now) > FORGET_THRESHOLD)
    .map((s) => ({
      stat: s,
      score: decayedWeight(s, now) + (context && s.stage === context ? RELEVANCE_BONUS : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_STRUGGLES)
    .map(({ stat }) => ({ stage: stat.stage, label: stat.label, mistakes: stat.mistakes }));

  // Mastered: most-recently-practiced first, bounded so a long history fits a
  // limited context window.
  const mastered = stats
    .filter((s) => s.mastered)
    .sort((a, b) => ageMs(a, now) - ageMs(b, now))
    .slice(0, MAX_MASTERED)
    .map((s) => s.label ?? s.stage);

  // The other half of forgetting: stale mastered skills resurface for review.
  const dueForReview = stats
    .filter((s) => isDueForReview(s, now))
    .sort((a, b) => ageMs(b, now) - ageMs(a, now))
    .slice(0, MAX_REVIEW)
    .map((s) => s.label ?? s.stage);

  const last = profile.history[profile.history.length - 1];
  return {
    level: profile.level,
    method: profile.method,
    sessions: profile.history.length,
    lastKind: last?.kind,
    struggles,
    mastered,
    dueForReview
  };
}
