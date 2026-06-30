export type LessonTrack = 'beginner' | 'time-improvement';

export type StepValidator =
    | { type: 'manual' }
    | { type: 'moveSequence'; moves: string[] }
    | { type: 'cubeSolved' };

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
}

export interface LessonProgress {
    completedStepIds: string[];
    currentStepId?: string;
    completedAt?: string;
}
