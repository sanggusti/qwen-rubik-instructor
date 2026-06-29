import type { State } from '../core/state';
import { isSolved, statesEqual } from '../core/state';
import type { LessonStep } from './lesson_types';

export function validateStep(
    step: LessonStep,
    moveHistory: string[],
    state: State
): boolean {
    switch (step.validator.type) {
        case 'manual':
            return false;

        case 'moveSequence':
            if (!endsWithMoves(moveHistory, step.validator.moves)) return false;
            // A setup-based drill scrambles with the inverse of the algorithm, so
            // performing it must also return the cube to solved. Gate on the cube
            // state too, or a stray move (or "Apply example moves" onto an already
            // off-track cube) would complete the step on an unsolved cube.
            return step.setupMoves?.length ? isSolved(state) : true;

        case 'cubeSolved':
            return isSolved(state);

        case 'cubeState':
            return statesEqual(state, step.validator.expected);
    }
}

export function endsWithMoves(history: string[], expected: string[]): boolean {
    if (history.length < expected.length) return false;
    return expected.every((move, index) =>
        history[history.length - expected.length + index] === move
    );
}
