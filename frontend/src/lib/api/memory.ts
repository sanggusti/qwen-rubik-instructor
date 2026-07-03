// Fire-and-forget bridge to the backend's optional persistence layer (Turso).
// localStorage stays the source of truth; these calls mirror it server-side so
// Qwen can recall the learner across sessions and the leaderboard fills up.
// Every call swallows failures — with the backend (or its DB) down, the app
// behaves exactly as before.

import { PUBLIC_BACKEND_URL } from '$env/static/public';
import type { UserProfile } from '../education/profile';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';
const TIMEOUT_MS = 4000;
const HANDLE_KEY = 'rubik-handle';

export interface LeaderboardEntry {
  userId: string;
  handle: string;
  bestMs: number;
  at: string;
}

async function post(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    /* persistence is best-effort; offline path stays silent */
  }
}

export function syncProfile(profile: UserProfile, handle: string | null = getHandle()): Promise<void> {
  return post('/memory/sync', {
    userId: profile.sessionId,
    handle: handle ?? undefined,
    level: profile.level,
    method: profile.method,
    history: profile.history,
    performance: profile.performance
  });
}

export function recordAttempt(opts: {
  userId: string;
  drillId: string;
  durationMs: number;
  mistakes?: number;
}): Promise<void> {
  return post('/attempts', { ...opts, handle: getHandle() ?? undefined });
}

export async function fetchLeaderboard(drillId: string): Promise<LeaderboardEntry[] | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/leaderboard?drillId=${encodeURIComponent(drillId)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { persisted: boolean; entries: LeaderboardEntry[] };
    return data.persisted ? data.entries : null;
  } catch {
    return null;
  }
}

export function getHandle(): string | null {
  try {
    return localStorage?.getItem(HANDLE_KEY);
  } catch {
    return null;
  }
}

export function setHandle(handle: string): void {
  try {
    localStorage?.setItem(HANDLE_KEY, handle.trim().slice(0, 24));
  } catch {
    /* ignore */
  }
}
