import type { State } from '../cube/state';
import { isSolved } from '../cube/state';
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
            return endsWithMoves(moveHistory, step.validator.moves);

        case 'cubeSolved':
            return isSolved(state);
    }
}

export function endsWithMoves(history: string[], expected: string[]): boolean {
    if (history.length < expected.length) return false;
    return expected.every((move, index) =>
        history[history.length - expected.length + index] === move
    );
}
