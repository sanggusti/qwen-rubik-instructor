// Deterministic evaluation of a user's attempt against a drill. Reuses the
// existing tail-match validator and solved-state check so practice and lessons
// agree on what "done" means. Returns a status plus a human-readable message.

import type { State } from '../core/state';
import { isSolved } from '../core/state';
import { endsWithMoves } from './lesson_validator';
import { trailingPrefixLength } from './coaching';
import type { Drill, EvaluationResult } from './practice_types';

export function evaluate(drill: Drill, moveHistory: string[], state: State): EvaluationResult {
    switch (drill.validator.type) {
        case 'moveSequence':
            return evaluateSequence(
                drill.validator.moves,
                moveHistory,
                state,
                !!drill.setupMoves?.length
            );
        case 'cubeSolved':
            return evaluateSolved(state);
    }
}

function evaluateSequence(
    expected: string[],
    moveHistory: string[],
    state: State,
    requireSolved: boolean
): EvaluationResult {
    if (moveHistory.length === 0) {
        return { status: 'idle', message: `Start with ${expected[0]}.` };
    }

    // The drill completes when the history ENDS with the expected moves, so a
    // mistake clears as soon as the user restarts the sequence correctly.
    if (endsWithMoves(moveHistory, expected)) {
        // A setup-based drill must also leave the cube solved; right moves on a
        // cube knocked off-track earlier is not a real success.
        if (requireSolved && !isSolved(state)) {
            return {
                status: 'wrong',
                message: 'Right moves, but the cube isn’t solved — reset the drill and start from the setup.'
            };
        }
        return { status: 'correct', message: 'Correct sequence.' };
    }

    const onTrack = trailingPrefixLength(moveHistory, expected);
    if (onTrack > 0) {
        return { status: 'progress', message: `Good. Next move: ${expected[onTrack]}.` };
    }

    // Off track: describe the first divergence from the start of the attempt.
    let matched = 0;
    while (
        matched < moveHistory.length &&
        matched < expected.length &&
        moveHistory[matched] === expected[matched]
    ) {
        matched++;
    }
    const expectedMove = expected[matched] ?? expected[expected.length - 1];
    const gotMove = moveHistory[matched] ?? moveHistory[moveHistory.length - 1];
    return {
        status: 'wrong',
        message: `Expected ${expectedMove}, but got ${gotMove}. Start the sequence again.`
    };
}

function evaluateSolved(state: State): EvaluationResult {
    return isSolved(state)
        ? { status: 'correct', message: 'Cube solved.' }
        : { status: 'progress', message: 'Keep going until the cube is solved.' };
}
