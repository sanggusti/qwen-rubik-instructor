import { describe, it, expect } from 'vitest';
import { solvedState, applyMove } from '../cube/state';
import { validateStep, endsWithMoves } from './lesson_validator';
import type { LessonStep } from './lesson_types';

describe('endsWithMoves', () => {
    it('returns false when history is shorter than expected', () => {
        expect(endsWithMoves(['R'], ['R', 'U'])).toBe(false);
    });

    it('matches when history ends with the expected sequence', () => {
        expect(endsWithMoves(['F', 'R', 'U'], ['R', 'U'])).toBe(true);
    });

    it('ignores earlier non-matching moves', () => {
        expect(endsWithMoves(['U', 'D', 'R', 'U', "R'", "U'"], ['R', 'U', "R'", "U'"])).toBe(true);
    });

    it('returns false when the tail does not match', () => {
        expect(endsWithMoves(['R', 'U', 'R'], ['R', 'U', "R'"])).toBe(false);
    });

    it('matches an empty expected sequence', () => {
        expect(endsWithMoves(['R'], [])).toBe(true);
    });
});

describe('validateStep', () => {
    const base = { id: 's', title: 't', body: 'b' };

    it('manual steps never auto-complete', () => {
        const step: LessonStep = { ...base, validator: { type: 'manual' } };
        expect(validateStep(step, ['R', 'U'], solvedState())).toBe(false);
    });

    it('moveSequence steps complete when history ends with the moves', () => {
        const step: LessonStep = {
            ...base,
            validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
        };
        expect(validateStep(step, ['R', 'U', "R'", "U'"], solvedState())).toBe(true);
        expect(validateStep(step, ['R', 'U', "R'"], solvedState())).toBe(false);
    });

    it('moveSequence steps WITH setup also require the cube to be solved', () => {
        // A setup-based drill scrambles with the inverse of the algorithm, so the
        // right move suffix on a cube knocked off-track must NOT complete.
        const step: LessonStep = {
            ...base,
            setupMoves: ['U', 'R', "U'", "R'"],
            validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
        };
        // Setup then algorithm returns a solved cube -> completes.
        const solved = solvedState();
        for (const m of ['U', 'R', "U'", "R'", 'R', 'U', "R'", "U'"]) applyMove(solved, m);
        expect(validateStep(step, ['R', 'U', "R'", "U'"], solved)).toBe(true);

        // A stray move before the algorithm: suffix still matches, but the cube
        // is not solved -> must NOT complete (the false-"correct" bug).
        const offTrack = solvedState();
        for (const m of ['U', 'R', "U'", "R'", 'D', 'R', 'U', "R'", "U'"]) applyMove(offTrack, m);
        expect(validateStep(step, ['D', 'R', 'U', "R'", "U'"], offTrack)).toBe(false);
    });

    it('cubeSolved steps complete only when the cube is solved', () => {
        const step: LessonStep = { ...base, validator: { type: 'cubeSolved' } };
        expect(validateStep(step, [], solvedState())).toBe(true);

        const scrambled = solvedState();
        applyMove(scrambled, 'R');
        expect(validateStep(step, [], scrambled)).toBe(false);
    });

    it('cubeState steps complete only when the cube matches the expected state', () => {
        const expected = solvedState();
        applyMove(expected, 'R');
        applyMove(expected, 'U');
        const step: LessonStep = { ...base, validator: { type: 'cubeState', expected } };

        const reached = solvedState();
        applyMove(reached, 'R');
        applyMove(reached, 'U');
        expect(validateStep(step, ['R', 'U'], reached)).toBe(true);

        // A stray move means the right move suffix lands on a different state.
        const off = solvedState();
        applyMove(off, 'D');
        applyMove(off, 'R');
        applyMove(off, 'U');
        expect(validateStep(step, ['D', 'R', 'U'], off)).toBe(false);
    });
});
