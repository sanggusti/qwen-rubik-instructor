// Challenge-mode API: server-timed session flow + public leaderboard.
//
// Anti-cheat contract:
//   1. Call startChallenge() when the timer starts → backend stores started_at,
//      returns an opaque session key.
//   2. Call submitScore(token, key) on solve or give-up → backend redeems key
//      and computes solve_time_ms server-side.  No solve time is ever sent from
//      the client.

import { PUBLIC_BACKEND_URL } from '$env/static/public';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';
const TIMEOUT_MS = 4000;

export type ScoreStatus = 'solved' | 'give_up';

export interface ChallengeEntry {
  rank: number;
  username: string;
  bestMs: number;
  at: string;
  status: ScoreStatus;
}

export interface StartChallengeResult {
  key: string;
  startedAt: string;
  username: string;
}

export interface SubmitScoreResult {
  ok: boolean;
  bestMs: number;
  solveTimeMs: number;
  status: ScoreStatus;
}

export async function startChallenge(
  token: string,
  scrambleLength = 20
): Promise<StartChallengeResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/challenge/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scrambleLength }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return (await res.json()) as StartChallengeResult;
  } catch {
    return null;
  }
}

export async function submitScore(
  token: string,
  key: string,
  status: ScoreStatus = 'solved'
): Promise<SubmitScoreResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/challenge/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, status }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return (await res.json()) as SubmitScoreResult;
  } catch {
    return null;
  }
}

export async function fetchChallengeLeaderboard(limit = 10): Promise<ChallengeEntry[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/challenge/leaderboard?limit=${limit}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { entries: ChallengeEntry[] };
    return data.entries;
  } catch {
    return null;
  }
}
