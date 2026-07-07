// Fire-and-forget bridge for the review-session mirror (Turso). localStorage
// stays the source of truth (lib/review/session.ts); these calls mirror the
// captured session server-side so /review works on a new device. Every call
// swallows failures — with the backend (or its DB) down, the app behaves
// exactly as before.

import { PUBLIC_BACKEND_URL } from '$env/static/public';
import type { ReviewSession } from '../review/session';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';
const TIMEOUT_MS = 4000;

export async function syncReviewSession(userId: string, session: ReviewSession): Promise<void> {
  try {
    await fetch(`${BASE_URL}/review/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, session }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    /* persistence is best-effort; offline path stays silent */
  }
}

export async function fetchReviewSession(userId: string): Promise<ReviewSession | null> {
  try {
    const res = await fetch(`${BASE_URL}/review/${encodeURIComponent(userId)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: ReviewSession };
    return data.session?.version === 1 ? data.session : null;
  } catch {
    return null;
  }
}
