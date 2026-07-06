import { describe, expect, it } from 'vitest';

import type { StorageLike } from '../education/lesson_progress';
import type { Walkthrough } from '../education/walkthrough';
import {
    hasReviewSolve,
    hydrateReviewSession,
    loadReviewSession,
    recordScramble,
    recordSolve,
    type ReviewSession
} from './session';

function fakeStorage(): StorageLike {
    const map = new Map<string, string>();
    return {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k)
    };
}

function solveWalkthrough(over: Partial<Walkthrough> = {}): Walkthrough {
    return {
        id: 'solve-current',
        title: 'Solve my cube',
        description: 'Layer by layer',
        startFromCurrent: true,
        beats: [
            { text: 'The scramble.', moves: ['R', 'U', 'F'], pace: 'fast' },
            { text: 'Now the cross.', moves: ["F'", "U'", "R'"], stage: 'cross' }
        ],
        ...over
    };
}

describe('review session capture', () => {
    it('round-trips a recorded solve', () => {
        const storage = fakeStorage();
        recordSolve(solveWalkthrough(), 'newbie', 'lbl', storage);
        const session = loadReviewSession(storage);
        expect(session?.version).toBe(1);
        expect(session?.solve?.title).toBe('Solve my cube');
        expect(session?.solve?.level).toBe('newbie');
        expect(session?.solve?.beats).toHaveLength(2);
        expect(hasReviewSolve(storage)).toBe(true);
    });

    it('ignores catalog walkthroughs and trivial solves', () => {
        const storage = fakeStorage();
        recordSolve(solveWalkthrough({ startFromCurrent: false }), 'newbie', 'lbl', storage);
        expect(hasReviewSolve(storage)).toBe(false);
        recordSolve(
            solveWalkthrough({ beats: [{ text: 'only one beat', moves: ['R'] }] }),
            'newbie',
            'lbl',
            storage
        );
        expect(hasReviewSolve(storage)).toBe(false);
    });

    it('replaces a prior solve wholesale', () => {
        const storage = fakeStorage();
        recordSolve(solveWalkthrough(), 'newbie', 'lbl', storage);
        recordSolve(solveWalkthrough({ title: 'Second solve' }), 'advanced', 'cfop', storage);
        const solve = loadReviewSession(storage)?.solve;
        expect(solve?.title).toBe('Second solve');
        expect(solve?.method).toBe('cfop');
    });

    it('tracks scrambles without touching the solve', () => {
        const storage = fakeStorage();
        recordSolve(solveWalkthrough(), 'newbie', 'lbl', storage);
        recordScramble(['R', 'U'], storage);
        recordScramble(['F'], storage);
        const session = loadReviewSession(storage);
        expect(session?.scrambleCount).toBe(2);
        expect(session?.lastScramble?.moves).toEqual(['F']);
        expect(session?.solve?.title).toBe('Solve my cube');
    });

    it('returns null on corrupt or wrong-version data', () => {
        const storage = fakeStorage();
        storage.setItem('rubik-review-session', 'not json');
        expect(loadReviewSession(storage)).toBeNull();
        storage.setItem('rubik-review-session', JSON.stringify({ version: 2 }));
        expect(loadReviewSession(storage)).toBeNull();
    });

    it('swallows storage write failures', () => {
        const storage = fakeStorage();
        storage.setItem = () => {
            throw new Error('quota exceeded');
        };
        expect(() => recordSolve(solveWalkthrough(), 'newbie', 'lbl', storage)).not.toThrow();
        expect(() => recordScramble(['R'], storage)).not.toThrow();
    });

    it('hydrates a mirrored session for a fresh device', () => {
        const storage = fakeStorage();
        const mirrored: ReviewSession = {
            version: 1,
            startedAt: '2026-07-06T00:00:00Z',
            scrambleCount: 3,
            solve: {
                capturedAt: '2026-07-06T00:05:00Z',
                title: 'Mirrored solve',
                description: '',
                level: 'newbie',
                method: 'lbl',
                beats: solveWalkthrough().beats
            }
        };
        hydrateReviewSession(mirrored, storage);
        expect(loadReviewSession(storage)?.solve?.title).toBe('Mirrored solve');
    });
});
