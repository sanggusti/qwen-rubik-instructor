// Type definitions for the Practice subsystem. Mirrors the lesson types in
// spirit but is fully self-contained: drills are static, deterministic, and
// validated either by an expected move sequence or by the cube reaching a
// solved state.

export type DrillCategory = 'trigger' | 'algorithm' | 'solve';

export type DrillDifficulty = 'easy' | 'medium' | 'hard';

export type DrillValidator =
    | { type: 'moveSequence'; moves: string[] }
    | { type: 'cubeSolved' };

export interface Drill {
    id: string;
    title: string;
    category: DrillCategory;
    difficulty: DrillDifficulty;
    prompt: string;
    // Moves applied programmatically before the user starts (e.g. a scramble to
    // solve). These never count as user attempts.
    setupMoves?: string[];
    // The reference answer, shown on demand via "Apply example moves".
    expectedMoves?: string[];
    // How many times the drill repeats before it is marked complete. Defaults
    // to 1 when omitted.
    rounds?: number;
    validator: DrillValidator;
}

export type EvaluationStatus = 'idle' | 'progress' | 'correct' | 'wrong';

export interface EvaluationResult {
    status: EvaluationStatus;
    message: string;
}

export interface DrillFilter {
    category?: DrillCategory;
    difficulty?: DrillDifficulty;
}
