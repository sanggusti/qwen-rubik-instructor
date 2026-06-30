import { describe, it, expect } from 'vitest';
import { LESSON_CATALOG } from './lesson_catalog';
import { solvedState, applyMove, isSolved } from '../cube/state';

// The seven LBL stages, in order, that the beginner curriculum must cover so a
// learner can go from a scramble to a solved cube.
const LBL_STAGES = [
    'cross',
    'first-layer-corners',
    'middle-layer',
    'last-layer-cross',
    'll-corner-position',
    'll-corner-orientation',
    'last-layer-edges'
];

describe('LBL curriculum', () => {
    it('covers every LBL stage in solver order', () => {
        const stages = LESSON_CATALOG.filter((l) => l.stage).map((l) => l.stage);
        for (const stage of LBL_STAGES) expect(stages).toContain(stage);
        // Stage lessons appear in the canonical solving order.
        const present = LBL_STAGES.filter((s) => stages.includes(s));
        const ordered = stages.filter((s) => LBL_STAGES.includes(s!));
        expect(ordered).toEqual(present);
    });

    // Every drill that scrambles via setupMoves and then asks for an exact
    // sequence must return the cube to solved — this verifies the setup is the
    // true inverse of the taught algorithm (catches any hand-inversion error).
    const drills = LESSON_CATALOG.flatMap((l) =>
        l.steps
            .filter((s) => s.setupMoves?.length && s.validator.type === 'moveSequence')
            .map((s) => ({ lesson: l.id, step: s }))
    );

    it.each(drills)('setup + algorithm solves: $lesson / $step.id', ({ step }) => {
        const state = solvedState();
        for (const m of step.setupMoves!) applyMove(state, m);
        expect(isSolved(state)).toBe(false); // setup actually scrambles
        const algo = step.validator.type === 'moveSequence' ? step.validator.moves : [];
        for (const m of algo) applyMove(state, m);
        expect(isSolved(state)).toBe(true); // algorithm restores it
    });
});
