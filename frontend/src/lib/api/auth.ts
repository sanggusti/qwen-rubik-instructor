// Google-auth API client for challenge mode. Unlike memory.ts these calls
// surface failures (the UI needs to show login/username errors), but they
// share the same base-URL + timeout conventions.

import { PUBLIC_BACKEND_URL } from '$env/static/public';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';
const TIMEOUT_MS = 8000;

export interface Member {
  id: string;
  email: string;
  username: string | null;
  hasUsername: boolean;
}

export function redirectToGoogle(): void {
  window.location.href = `${BASE_URL}/auth/google`;
}

export async function getMe(token: string): Promise<Member | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return (await res.json()) as Member;
  } catch {
    return null;
  }
}

/** Returns null on success, or an error message to show inline. */
export async function setUsername(token: string, username: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) return null;
    if (res.status === 409) return 'That username is already taken.';
    if (res.status === 400) return 'Usernames are 2–24 letters, digits or underscores.';
    if (res.status === 503) return 'Leaderboard service is unavailable right now.';
    return 'Something went wrong — try again.';
  } catch {
    return 'Something went wrong — try again.';
  }
}

export async function logout(token: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    /* best-effort; the local token is cleared regardless */
  }
}
