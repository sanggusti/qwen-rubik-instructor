// Session capture for the /review canvas. The browser is authoritative: the
// latest Qwen solve walkthrough (scramble beat + narrated stage beats) plus
// light scramble metadata are kept in localStorage so the review page can
// replay the exact original session — original narration included — offline.
// A best-effort Turso mirror (api/review.ts) lets it follow the learner
// across devices; this module never depends on the network.

import type { Beat, Walkthrough } from '../education/walkthrough';
import type { Level, Method } from '../education/profile';
import type { StorageLike } from '../education/lesson_progress';

export interface ReviewSolve {
    capturedAt: string;
    title: string;
    description: string;
    level: Level;
    method: Method;
    /** beat 0 = the scramble from solved; beats 1.. = one solver stage each. */
    beats: Beat[];
}

export interface ReviewSession {
    version: 1;
    startedAt: string;
    scrambleCount: number;
    lastScramble?: { moves: string[]; at: string };
    solve?: ReviewSolve;
}

const KEY = 'rubik-review-session';

function defaultStorage(): StorageLike | null {
    try {
        return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    } catch {
        return null;
    }
}

function emptySession(): ReviewSession {
    return { version: 1, startedAt: new Date().toISOString(), scrambleCount: 0 };
}

export function loadReviewSession(
    storage: StorageLike | null = defaultStorage()
): ReviewSession | null {
    if (!storage) return null;
    let raw: string | null = null;
    try {
        raw = storage.getItem(KEY);
    } catch {
        return null;
    }
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<ReviewSession>;
        if (parsed.version !== 1) return null;
        if (parsed.solve && !Array.isArray(parsed.solve.beats)) return null;
        return parsed as ReviewSession;
    } catch {
        return null;
    }
}

function save(session: ReviewSession, storage: StorageLike | null): void {
    if (!storage) return;
    try {
        storage.setItem(KEY, JSON.stringify(session));
    } catch {
        // Storage may be unavailable or full; the review simply isn't captured.
    }
}

export function recordScramble(
    moves: string[],
    storage: StorageLike | null = defaultStorage()
): void {
    const session = loadReviewSession(storage) ?? emptySession();
    session.scrambleCount += 1;
    session.lastScramble = { moves: [...moves], at: new Date().toISOString() };
    save(session, storage);
}

// Capture a generated "Solve my cube" walkthrough. Only solves of the live cube
// qualify (beat 0 carries the scramble); catalog walkthroughs are ignored.
export function recordSolve(
    walkthrough: Walkthrough,
    level: Level,
    method: Method,
    storage: StorageLike | null = defaultStorage()
): void {
    if (!walkthrough.startFromCurrent || walkthrough.beats.length < 2) return;
    const session = loadReviewSession(storage) ?? emptySession();
    session.solve = {
        capturedAt: new Date().toISOString(),
        title: walkthrough.title,
        description: walkthrough.description,
        level,
        method,
        beats: walkthrough.beats
    };
    save(session, storage);
}

export function hasReviewSolve(storage: StorageLike | null = defaultStorage()): boolean {
    return !!loadReviewSession(storage)?.solve;
}

// Store a session fetched from the Turso mirror (used when localStorage is
// empty on a new device). The local copy stays authoritative afterwards.
export function hydrateReviewSession(
    session: ReviewSession,
    storage: StorageLike | null = defaultStorage()
): void {
    save(session, storage);
}
