// Challenge-mode API: authenticated score submission (fire-and-forget, like
// memory.ts) and the public leaderboard.

import { PUBLIC_BACKEND_URL } from '$env/static/public';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';
const TIMEOUT_MS = 4000;

export interface ChallengeEntry {
  rank: number;
  username: string;
  bestMs: number;
  at: string;
}

export async function submitScore(
  token: string,
  solveTimeMs: number,
  scrambleLength = 20
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/challenge/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ solveTimeMs, scrambleLength }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    /* best-effort; the celebration goes on regardless */
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
