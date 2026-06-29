export type LessonTrack = 'beginner' | 'time-improvement';

import type { State } from '../core/state';

export type StepValidator =
    | { type: 'manual' }
    | { type: 'moveSequence'; moves: string[] }
    | { type: 'cubeSolved' }
    // Completes when the cube reaches `expected` — the exact state after a solve
    // stage's moves. Lets the generated solve lesson auto-grade each stage.
    | { type: 'cubeState'; expected: State };

export interface LessonStep {
    id: string;
    title: string;
    body: string;
    setupMoves?: string[];
    expectedMoves?: string[];
    hints?: string[];
    validator: StepValidator;
}

export interface Lesson {
    id: string;
    track: LessonTrack;
    title: string;
    audience: string;
    description: string;
    steps: LessonStep[];
    // Solver stage this lesson maps onto (e.g. 'cross', 'middle-layer'). Lets
    // performance be keyed by stage so it aligns with generated solve frames.
    stage?: string;
    // True for runtime (Qwen) lessons. They're not part of the gated beginner
    // path, so the list never locks them.
    generated?: boolean;
}

export interface LessonProgress {
    completedStepIds: string[];
    currentStepId?: string;
    completedAt?: string;
}
