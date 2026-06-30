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

    it('cubeSolved steps complete only when the cube is solved', () => {
        const step: LessonStep = { ...base, validator: { type: 'cubeSolved' } };
        expect(validateStep(step, [], solvedState())).toBe(true);

        const scrambled = solvedState();
        applyMove(scrambled, 'R');
        expect(validateStep(step, [], scrambled)).toBe(false);
    });
});
