import { describe, it, expect } from 'vitest';
import { buildCoachingMessages } from './coaching';
import type { LessonStep } from './lesson_types';

const seqStep = (moves: string[], hints?: string[]): LessonStep => ({
    id: 's',
    title: 't',
    body: 'b',
    expectedMoves: moves,
    hints,
    validator: { type: 'moveSequence', moves }
});

const base = {
    stepCompleted: false,
    lessonCompleted: false,
    isLastStep: false
};

describe('buildCoachingMessages', () => {
    it('hints to start with the first move when no moves are made', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U']),
            moveHistory: []
        });
        const hint = messages.find((m) => m.kind === 'hint');
        expect(hint).toBeDefined();
        expect(hint!.body).toContain('R');
    });

    it('uses a step-provided hint at the start when present', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U'], ['Press the R key.']),
            moveHistory: []
        });
        expect(messages[0].kind).toBe('hint');
        expect(messages[0].body).toBe('Press the R key.');
    });

    it('hints the next move while on a correct prefix', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U']),
            moveHistory: ['R']
        });
        const hint = messages.find((m) => m.kind === 'hint');
        expect(hint).toBeDefined();
        expect(hint!.body).toContain('U');
    });

    it('detects a mistake mentioning expected and actual moves', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U']),
            moveHistory: ['R', 'D']
        });
        const error = messages.find((m) => m.kind === 'mistake');
        expect(error).toBeDefined();
        expect(error!.body).toContain('U');
        expect(error!.body).toContain('D');
        expect(messages.some((m) => m.kind === 'recommendation')).toBe(true);
    });

    it('clears the mistake once the user restarts the sequence correctly', () => {
        // Expected R U R' U'. The user errs (D), then begins again from the top.
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U', "R'", "U'"]),
            moveHistory: ['R', 'U', 'D', 'R']
        });
        expect(messages.some((m) => m.kind === 'mistake')).toBe(false);
        const next = messages.find((m) => m.kind === 'hint');
        expect(next).toBeDefined();
        expect(next!.body).toContain('U');
    });

    it('recommends marking complete for manual steps without hints', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: { id: 'm', title: 't', body: 'b', validator: { type: 'manual' } },
            moveHistory: []
        });
        expect(messages[0].kind).toBe('recommendation');
        expect(messages[0].body).toContain('Mark complete');
    });

    it('recommends the next lesson when the lesson is complete', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: seqStep(['R', 'U']),
            moveHistory: [],
            stepCompleted: true,
            lessonCompleted: true,
            nextLessonTitle: 'Practice both hands'
        });
        expect(messages.some((m) => m.kind === 'recommendation' && m.body.includes('Lesson complete'))).toBe(
            true
        );
        expect(
            messages.some((m) => m.kind === 'recommendation' && m.body.includes('Practice both hands'))
        ).toBe(true);
    });

    it('recommends solving for an incomplete cubeSolved step', () => {
        const messages = buildCoachingMessages({
            ...base,
            step: { id: 'c', title: 't', body: 'b', validator: { type: 'cubeSolved' } },
            moveHistory: []
        });
        expect(messages[0].kind).toBe('recommendation');
        expect(messages[0].body.toLowerCase()).toContain('solve');
    });
});
