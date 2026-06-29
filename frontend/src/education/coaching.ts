import type { LessonStep } from './lesson_types';

export type CoachingMessageKind = 'hint' | 'mistake' | 'recommendation';

export interface CoachingMessage {
    kind: CoachingMessageKind;
    title: string;
    body: string;
}

export interface CoachingContext {
    step: LessonStep;
    moveHistory: string[];
    stepCompleted: boolean;
    lessonCompleted: boolean;
    isLastStep: boolean;
    nextLessonTitle?: string;
    /** Off-track moves made on this step so far, used to escalate help. */
    stepMistakes?: number;
}

function hint(body: string): CoachingMessage {
    return { kind: 'hint', title: 'Hint', body };
}

function mistake(body: string): CoachingMessage {
    return { kind: 'mistake', title: 'Watch out', body };
}

function recommendation(body: string): CoachingMessage {
    return { kind: 'recommendation', title: 'Next', body };
}

// Pure, deterministic coaching for the current lesson step. It never blocks
// progress; the engine still validates completion via endsWithMoves.
export function buildCoachingMessages(args: CoachingContext): CoachingMessage[] {
    const { step, moveHistory, stepCompleted, lessonCompleted, isLastStep, nextLessonTitle } = args;
    const stepMistakes = args.stepMistakes ?? 0;

    if (lessonCompleted) {
        const messages: CoachingMessage[] = [recommendation('Lesson complete.')];
        if (nextLessonTitle) messages.push(recommendation(`Try next: ${nextLessonTitle}`));
        return messages;
    }

    switch (step.validator.type) {
        case 'moveSequence':
            return sequenceMessages(
                step, step.validator.moves, moveHistory, stepCompleted, isLastStep, stepMistakes
            );

        case 'manual':
            return step.hints?.length
                ? [hint(step.hints[0])]
                : [recommendation('Read the step, then press Mark complete when ready.')];

        case 'cubeSolved':
            if (stepCompleted) return [recommendation('Cube is solved. Continue.')];
            return step.hints?.length
                ? [hint(step.hints[0])]
                : [
                    recommendation(
                        'Solve the cube from this setup. If you get lost, reset the cube and set up the step again.'
                    )
                ];
    }
}

function sequenceMessages(
    step: LessonStep,
    expectedMoves: string[],
    moveHistory: string[],
    stepCompleted: boolean,
    isLastStep: boolean,
    stepMistakes: number
): CoachingMessage[] {
    if (stepCompleted) {
        return [
            recommendation(isLastStep ? 'Step complete. Finish the lesson.' : 'Continue to the next step.')
        ];
    }

    if (moveHistory.length === 0) {
        return [step.hints?.length ? hint(step.hints[0]) : hint(`Start with ${expectedMoves[0]}.`)];
    }

    // The step completes when the history ENDS with the expected moves
    // (endsWithMoves), so the user's current attempt is the longest trailing
    // run that forms a prefix of the sequence. Measuring from the tail means a
    // mistake clears as soon as the user starts the sequence over correctly.
    const onTrack = trailingPrefixLength(moveHistory, expectedMoves);
    if (onTrack > 0) {
        if (onTrack < expectedMoves.length) return [hint(`Next move: ${expectedMoves[onTrack]}.`)];
        return [];
    }

    // Off track: describe the divergence using the forward prefix match so the
    // message keeps the "Expected X, but got Y" context of the first wrong move.
    let matched = 0;
    while (
        matched < moveHistory.length &&
        matched < expectedMoves.length &&
        moveHistory[matched] === expectedMoves[matched]
    ) {
        matched++;
    }
    const expectedMove = expectedMoves[matched] ?? expectedMoves[expectedMoves.length - 1];
    const gotMove = moveHistory[matched] ?? moveHistory[moveHistory.length - 1];
    const error = mistake(`Expected ${expectedMove}, but got ${gotMove}.`);

    // Escalate the help the more the learner slips on this same step.
    if (stepMistakes >= 5) {
        return [
            error,
            recommendation(
                `Nearly there. Tap "Show next move" for the exact turn (${expectedMove}), ` +
                    'or "Apply example moves" to watch the whole sequence.'
            )
        ];
    }
    if (stepMistakes >= 3) {
        return [
            error,
            recommendation(
                `Restart from ${expectedMoves[0]} and go slowly — the move you need here is ${expectedMove}.`
            )
        ];
    }
    return [
        error,
        recommendation('Try the sequence again from the beginning, or use Apply example moves.')
    ];
}

// Length of the longest suffix of `history` that is a prefix of `expected`.
export function trailingPrefixLength(history: string[], expected: string[]): number {
    const max = Math.min(history.length, expected.length);
    for (let p = max; p > 0; p--) {
        let ok = true;
        for (let i = 0; i < p; i++) {
            if (history[history.length - p + i] !== expected[i]) {
                ok = false;
                break;
            }
        }
        if (ok) return p;
    }
    return 0;
}
